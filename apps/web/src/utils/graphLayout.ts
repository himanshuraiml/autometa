import type { Edge, Node } from '@xyflow/react';

export interface LayeredLayoutOptions {
  columnWidth?: number;
  rowHeight?: number;
  originX?: number;
  originY?: number;
}

/**
 * A small Sugiyama-style layered layout: BFS-rank nodes into columns from the
 * start state(s) (or in-degree-0 nodes, or an arbitrary node, as fallbacks),
 * then run a few barycenter-ordering passes within each column to reduce edge
 * crossings before assigning pixel positions. Disconnected components get
 * seeded as their own column group so they don't interleave with the main
 * graph's layers.
 */
export const computeLayeredLayout = (
  nodes: Node[],
  edges: Edge[],
  options: LayeredLayoutOptions = {}
): Record<string, { x: number; y: number }> => {
  const columnWidth = options.columnWidth ?? 220;
  const rowHeight = options.rowHeight ?? 130;
  const originX = options.originX ?? 100;
  const originY = options.originY ?? 100;
  if (!nodes.length) return {};

  const nodeIds = nodes.map(n => n.id);
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  nodeIds.forEach(id => { outgoing.set(id, []); incoming.set(id, []); });
  for (const edge of edges) {
    if (edge.source === edge.target) continue; // self-loops don't affect ranking/ordering
    if (!outgoing.has(edge.source) || !incoming.has(edge.target)) continue;
    outgoing.get(edge.source)!.push(edge.target);
    incoming.get(edge.target)!.push(edge.source);
  }

  const layer = new Map<string, number>();
  const unvisited = new Set(nodeIds);
  let maxLayerSoFar = -1;

  const bfsComponent = (seeds: string[], baseLayer: number) => {
    let frontier = seeds.filter(id => unvisited.has(id));
    frontier.forEach(id => { layer.set(id, baseLayer); unvisited.delete(id); maxLayerSoFar = Math.max(maxLayerSoFar, baseLayer); });
    let depth = baseLayer;
    while (frontier.length) {
      depth += 1;
      const next: string[] = [];
      for (const id of frontier) for (const neighbor of outgoing.get(id) || []) {
        if (unvisited.has(neighbor)) { layer.set(neighbor, depth); unvisited.delete(neighbor); next.push(neighbor); maxLayerSoFar = Math.max(maxLayerSoFar, depth); }
      }
      frontier = next;
    }
  };

  const starts = nodes.filter(n => n.data?.isStart).map(n => n.id);
  const rootCandidates = starts.length ? starts : nodeIds.filter(id => (incoming.get(id) || []).length === 0);
  bfsComponent(rootCandidates.length ? rootCandidates : [nodeIds[0]], 0);

  // Any remaining nodes belong to disconnected components — seed each as its
  // own column group, two columns past whatever's been laid out so far.
  while (unvisited.size) {
    const nextRoot = [...unvisited].find(id => (incoming.get(id) || []).every(source => !unvisited.has(source))) ?? [...unvisited][0];
    bfsComponent([nextRoot], maxLayerSoFar + 2);
  }

  const layerGroups = new Map<number, string[]>();
  nodeIds.forEach(id => {
    const l = layer.get(id) ?? 0;
    layerGroups.set(l, [...(layerGroups.get(l) || []), id]);
  });
  const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b);

  // Barycenter ordering: nudge each node toward the average row-position of
  // its neighbors in the adjacent layer, alternating left-to-right and
  // right-to-left passes so both directions of influence get a say.
  const orderIndex = new Map<string, number>();
  sortedLayers.forEach(l => layerGroups.get(l)!.forEach((id, index) => orderIndex.set(id, index)));

  const reorderPass = (forward: boolean) => {
    const layersInPass = forward ? sortedLayers : [...sortedLayers].reverse();
    for (const l of layersInPass) {
      const ids = layerGroups.get(l)!;
      const withBarycenter = ids.map(id => {
        const neighbors = forward ? (incoming.get(id) || []) : (outgoing.get(id) || []);
        const positions = neighbors.map(n => orderIndex.get(n)).filter((v): v is number => v !== undefined);
        const barycenter = positions.length ? positions.reduce((sum, v) => sum + v, 0) / positions.length : orderIndex.get(id)!;
        return { id, barycenter };
      });
      withBarycenter.sort((a, b) => a.barycenter - b.barycenter);
      const reordered = withBarycenter.map(item => item.id);
      layerGroups.set(l, reordered);
      reordered.forEach((id, index) => orderIndex.set(id, index));
    }
  };
  for (let pass = 0; pass < 4; pass++) reorderPass(pass % 2 === 0);

  const positions: Record<string, { x: number; y: number }> = {};
  sortedLayers.forEach((l, layerIndexPosition) => {
    const ids = layerGroups.get(l)!;
    const layerHeight = (ids.length - 1) * rowHeight;
    ids.forEach((id, index) => {
      positions[id] = { x: originX + layerIndexPosition * columnWidth, y: originY + index * rowHeight - layerHeight / 2 };
    });
  });

  return positions;
};
