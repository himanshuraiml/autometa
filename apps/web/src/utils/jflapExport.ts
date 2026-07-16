import type { Node, Edge } from '@xyflow/react';
import { exportToJflap, importFromJflap } from '@autometa/rule-engine';
import type { JflapAutomatonType, PositionedAutomatonNode } from '@autometa/rule-engine';
import { toAutomaton } from './flowAutomaton';
import type { AutomatonType } from './flowAutomaton';

/** Serializes the current canvas to JFLAP .jff XML. JFLAP has no per-state output format, so Moore machines can't be represented. */
export const exportProjectToJflap = (nodes: Node[], edges: Edge[], automatonType: AutomatonType): string => {
  if (automatonType === 'Moore') {
    throw new Error("JFLAP export isn't available for Moore machines — JFLAP's format has no per-state output.");
  }
  const automaton = toAutomaton(nodes, edges, automatonType);
  const positionedNodes: PositionedAutomatonNode[] = automaton.nodes.map(node => {
    const flowNode = nodes.find(n => n.id === node.id);
    return { ...node, x: flowNode?.position.x ?? 0, y: flowNode?.position.y ?? 0 };
  });
  return exportToJflap(positionedNodes, automaton.edges, automatonType as JflapAutomatonType);
};

export interface JflapImportedProject {
  automatonType: AutomatonType;
  nodes: Node[];
  edges: Edge[];
}

/** Parses a JFLAP .jff file into the React Flow canvas shape. */
export const importProjectFromJflap = (xml: string): JflapImportedProject => {
  const result = importFromJflap(xml);
  const nodes: Node[] = result.nodes.map(n => ({
    id: n.id,
    type: 'state',
    position: { x: n.x, y: n.y },
    data: { label: n.label, isStart: n.isStart, isAccept: n.isAccept, isActive: false, scale: 1, glow: 0 },
  }));
  const edges: Edge[] = result.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'transition',
    data: { label: e.symbols.join(', ') },
  }));
  return { automatonType: result.automatonType, nodes, edges };
};
