import { create } from 'zustand';
import { 
  addEdge, 
  applyNodeChanges, 
  applyEdgeChanges 
} from '@xyflow/react';
import type {
  Connection,
  Edge,
  Node,
  OnNodesChange,
  OnEdgesChange
} from '@xyflow/react';

// StateNode exposes 4 source handles (left-out/right-out/top-out/bottom-out) and
// 4 target handles (left-in/right-in/top-in/bottom-in) stacked on the same spot.
// Edges built programmatically (templates, NFA->DFA, minimization, project load)
// never set sourceHandle/targetHandle, so React Flow has to guess among those
// handles and can pick e.g. top-out -> bottom-in for two side-by-side nodes,
// routing the connector straight through the node body. Resolve a sane handle
// pair from the nodes' actual positions instead of leaving it ambiguous.
function resolveHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  isSelfLoop: boolean
): { sourceHandle: string; targetHandle: string } {
  if (isSelfLoop) {
    // Same handle id on both ends so TransitionEdge's coordinate-based
    // self-loop detection (sourceX/Y ~= targetX/Y) actually triggers.
    return { sourceHandle: 'top-out', targetHandle: 'top-in' };
  }

  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: 'right-out', targetHandle: 'left-in' }
      : { sourceHandle: 'left-out', targetHandle: 'right-in' };
  }
  return dy >= 0
    ? { sourceHandle: 'bottom-out', targetHandle: 'top-in' }
    : { sourceHandle: 'top-out', targetHandle: 'bottom-in' };
}

interface GraphState {
  nodes: Node[];
  edges: Edge[];
  nodeCounter: number;
  automatonType: 'DFA' | 'NFA' | 'Mealy' | 'Moore' | 'PDA' | 'TM';
  setAutomatonType: (type: 'DFA' | 'NFA' | 'Mealy' | 'Moore' | 'PDA' | 'TM') => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  addNode: (x: number, y: number) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  toggleStart: (id: string) => void;
  toggleAccept: (id: string) => void;
  updateEdgeLabel: (id: string, label: string) => void;
  clearGraph: () => void;
  loadGraph: (nodes: Node[], edges: Edge[], counter: number) => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  nodeCounter: 0,
  automatonType: 'DFA',
  
  setAutomatonType: (type) => set({ automatonType: type }),

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection) => {
    const { source, target } = connection;
    if (!source || !target) return;

    // Check if an edge between source and target already exists
    const existingEdge = get().edges.find(
      (e) => e.source === source && e.target === target
    );

    if (existingEdge) {
      // Append default symbol to existing edge label
      const currentLabel = (existingEdge.data?.label as string) || '';
      const symbols = currentLabel.split(',').map(s => s.trim()).filter(Boolean);
      const nextSym = get().automatonType === 'Mealy' ? '0/0' : get().automatonType === 'PDA' ? 'a, Z -> A Z' : get().automatonType === 'TM' ? '0 -> 0, R' : 'b';
      if (!symbols.includes(nextSym)) {
        get().updateEdgeLabel(existingEdge.id, [...symbols, nextSym].join(', '));
      }
      return;
    }

    let defaultLabel = 'a';
    const machine = get().automatonType;
    if (machine === 'Mealy') defaultLabel = '0/0';
    else if (machine === 'PDA') defaultLabel = 'a, Z -> A Z';
    else if (machine === 'TM') defaultLabel = '0 -> 0, R';

    const newEdge: Edge = {
      id: `e-${source}-${target}-${Date.now()}`,
      source,
      target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      type: 'transition',
      data: { label: defaultLabel },
    };

    set({
      edges: addEdge(newEdge, get().edges),
    });
  },

  addNode: (x, y) => {
    const counter = get().nodeCounter;
    const label = `q${counter}`;
    const isFirstNode = get().nodes.length === 0;

    const newNode: Node = {
      id: `node-${counter}`,
      type: 'state',
      position: { x, y },
      data: { 
        label, 
        isStart: isFirstNode, 
        isAccept: false,
        isActive: false 
      },
    };

    set({
      nodes: [...get().nodes, newNode],
      nodeCounter: counter + 1,
    });
  },

  deleteNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
    });
  },

  deleteEdge: (id) => {
    set({
      edges: get().edges.filter((e) => e.id !== id),
    });
  },

  toggleStart: (id) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, isStart: !n.data.isStart } };
        }
        // Only one start state in DFA/NFA
        return { ...n, data: { ...n.data, isStart: false } };
      }),
    });
  },

  toggleAccept: (id) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, isAccept: !n.data.isAccept } };
        }
        return n;
      }),
    });
  },

  updateEdgeLabel: (id, label) => {
    set({
      edges: get().edges.map((e) => {
        if (e.id === id) {
          return { ...e, data: { ...e.data, label } };
        }
        return e;
      }),
    });
  },

  clearGraph: () => {
    set({
      nodes: [],
      edges: [],
      nodeCounter: 0,
    });
  },

  loadGraph: (nodes, edges, counter) => {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const resolvedEdges = edges.map((e) => {
      if (e.sourceHandle && e.targetHandle) return e;

      const sourceNode = nodeById.get(e.source);
      const targetNode = nodeById.get(e.target);
      if (!sourceNode || !targetNode) return e;

      const handles = resolveHandles(sourceNode.position, targetNode.position, e.source === e.target);
      return {
        ...e,
        sourceHandle: e.sourceHandle ?? handles.sourceHandle,
        targetHandle: e.targetHandle ?? handles.targetHandle,
      };
    });

    set({
      nodes,
      edges: resolvedEdges,
      nodeCounter: counter,
    });
  },
}));
