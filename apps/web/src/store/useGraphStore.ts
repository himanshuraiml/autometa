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
import { parseTransitionLabel } from '../utils/transitionParser';
import { computeLayeredLayout } from '../utils/graphLayout';
import type { Submachine } from '../utils/submachineLibrary';

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

interface GraphSnapshot {
  nodes: Node[];
  edges: Edge[];
  nodeCounter: number;
  alphabet: string[];
  tapeAlphabet: string[];
  stackAlphabet: string[];
  tapeCount: number;
  testSuites: MachineTestSuites;
}

export type LoopDirection = 'top' | 'right' | 'bottom' | 'left';
export interface MachineTestCase { id: string; input: string; expected: 'accept' | 'reject'; }
export type MachineTestSuites = Record<GraphState['automatonType'], MachineTestCase[]>;

const emptyTestSuites = (): MachineTestSuites => ({ DFA: [], NFA: [], Mealy: [], Moore: [], PDA: [], TM: [] });

const MAX_HISTORY = 50;

interface GraphState {
  nodes: Node[];
  edges: Edge[];
  nodeCounter: number;
  automatonType: 'DFA' | 'NFA' | 'Mealy' | 'Moore' | 'PDA' | 'TM';
  alphabet: string[];
  /** TM tape alphabet — declared separately from the input alphabet since a TM can write symbols it never reads as input. */
  tapeAlphabet: string[];
  /** PDA stack alphabet — declared separately from the input alphabet since pushed/popped symbols aren't input symbols. */
  stackAlphabet: string[];
  /** Number of TM tapes (1-4, default 1). 1 means "behave exactly like a single-tape TM everywhere". */
  tapeCount: number;
  testSuites: MachineTestSuites;
  allowParallelEdges: boolean;
  setAutomatonType: (type: 'DFA' | 'NFA' | 'Mealy' | 'Moore' | 'PDA' | 'TM') => void;
  setAlphabet: (alphabet: string[]) => void;
  setTapeAlphabet: (alphabet: string[]) => void;
  setStackAlphabet: (alphabet: string[]) => void;
  setTapeCount: (count: number) => void;
  setAllowParallelEdges: (allow: boolean) => void;
  addTestCase: (type: GraphState['automatonType'], input: string, expected: 'accept' | 'reject') => void;
  removeTestCase: (type: GraphState['automatonType'], id: string) => void;
  updateEdgeRouting: (id: string, routing: { parallelOffset?: number; loopDirection?: LoopDirection }) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  addNode: (x: number, y: number) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  toggleStart: (id: string) => void;
  toggleAccept: (id: string) => void;
  toggleReject: (id: string) => void;
  updateNodeLabel: (id: string, label: string) => void;
  updateEdgeLabel: (id: string, label: string) => void;
  setTableTransition: (source: string, symbol: string, target: string | null) => void;
  toggleTableTransitionTarget: (source: string, symbol: string, target: string) => void;
  setStructuredTransition: (params: { source: string; target: string; transitionText: string; previous?: { edgeId: string; transitionIndex: number } }) => void;
  clearGraph: () => void;
  loadGraph: (nodes: Node[], edges: Edge[], counter: number, options?: { preserveHistory?: boolean; alphabet?: string[]; tapeAlphabet?: string[]; stackAlphabet?: string[]; tapeCount?: number; testSuites?: MachineTestSuites }) => void;
  autoLayout: () => void;
  alignNodes: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  distributeNodes: (direction: 'horizontal' | 'vertical') => void;
  /**
   * Splices a saved submachine fragment into the current diagram on a chosen
   * transition: `edge.target` (B) is redirected to become the submachine's
   * entry point, and every node the fragment marked as an exit (isAccept) is
   * identified with B directly (not connected via an invented pass-through
   * transition — TMs have no epsilon step, so this is the textbook-correct
   * composition: exit states ARE the continuation state, not linked to it).
   */
  insertSubmachineOnEdge: (edgeId: string, submachine: Submachine) => void;
  // Undo/redo history over direct canvas edits (add/delete/move/rename/toggle/connect).
  // Bulk operations like loadGraph (project/template loads, simulation restore) are
  // intentionally excluded — they're context switches, not edits to step back through.
  past: GraphSnapshot[];
  future: GraphSnapshot[];
  undo: () => void;
  redo: () => void;
  // Internal: coalesces rapid same-field edits (e.g. every keystroke while renaming)
  // into a single history entry instead of one per keystroke.
  _coalesceKey: string | null;
  _pushHistory: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  nodeCounter: 0,
  automatonType: 'DFA',
  alphabet: [],
  tapeAlphabet: [],
  stackAlphabet: [],
  tapeCount: 1,
  testSuites: emptyTestSuites(),
  allowParallelEdges: false,
  past: [],
  future: [],
  _coalesceKey: null,

  setAutomatonType: (type) => set({ automatonType: type }),
  setAlphabet: (alphabet) => {
    const normalized = [...new Set(alphabet.map(value => value.trim()).filter(Boolean))].sort();
    get()._pushHistory();
    set({ alphabet: normalized, _coalesceKey: null });
  },
  setTapeAlphabet: (tapeAlphabet) => {
    const normalized = [...new Set(tapeAlphabet.map(value => value.trim()).filter(Boolean))].sort();
    get()._pushHistory();
    set({ tapeAlphabet: normalized, _coalesceKey: null });
  },
  setStackAlphabet: (stackAlphabet) => {
    const normalized = [...new Set(stackAlphabet.map(value => value.trim()).filter(Boolean))].sort();
    get()._pushHistory();
    set({ stackAlphabet: normalized, _coalesceKey: null });
  },
  setTapeCount: (count) => {
    const tapeCount = Math.max(1, Math.min(4, Math.round(count) || 1));
    get()._pushHistory();
    set({ tapeCount, _coalesceKey: null });
  },
  setAllowParallelEdges: (allowParallelEdges) => set({ allowParallelEdges }),
  addTestCase: (type, input, expected) => set(state => ({
    testSuites: { ...state.testSuites, [type]: [...state.testSuites[type], { id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, input, expected }] },
  })),
  removeTestCase: (type, id) => set(state => ({
    testSuites: { ...state.testSuites, [type]: state.testSuites[type].filter(test => test.id !== id) },
  })),

  _pushHistory: () => {
    const { nodes, edges, nodeCounter, past } = get();
    const { alphabet, tapeAlphabet, stackAlphabet, tapeCount, testSuites } = get();
    const snapshot: GraphSnapshot = { nodes, edges, nodeCounter, alphabet, tapeAlphabet, stackAlphabet, tapeCount, testSuites };
    set({ past: [...past, snapshot].slice(-MAX_HISTORY), future: [] });
  },

  undo: () => {
    const { past, nodes, edges, nodeCounter, future } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      nodes: previous.nodes,
      edges: previous.edges,
      nodeCounter: previous.nodeCounter,
      alphabet: previous.alphabet,
      tapeAlphabet: previous.tapeAlphabet,
      stackAlphabet: previous.stackAlphabet,
      tapeCount: previous.tapeCount,
      testSuites: previous.testSuites,
      future: [{ nodes, edges, nodeCounter, alphabet: get().alphabet, tapeAlphabet: get().tapeAlphabet, stackAlphabet: get().stackAlphabet, tapeCount: get().tapeCount, testSuites: get().testSuites }, ...future],
      _coalesceKey: null,
    });
  },

  redo: () => {
    const { future, nodes, edges, nodeCounter, past } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      future: future.slice(1),
      nodes: next.nodes,
      edges: next.edges,
      nodeCounter: next.nodeCounter,
      alphabet: next.alphabet,
      tapeAlphabet: next.tapeAlphabet,
      stackAlphabet: next.stackAlphabet,
      tapeCount: next.tapeCount,
      testSuites: next.testSuites,
      past: [...past, { nodes, edges, nodeCounter, alphabet: get().alphabet, tapeAlphabet: get().tapeAlphabet, stackAlphabet: get().stackAlphabet, tapeCount: get().tapeCount, testSuites: get().testSuites }],
      _coalesceKey: null,
    });
  },

  onNodesChange: (changes) => {
    const isMeaningful = changes.some(
      (c) => c.type === 'remove' || (c.type === 'position' && c.dragging === false)
    );
    if (isMeaningful) {
      get()._pushHistory();
      set({ _coalesceKey: null });
    }
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes) => {
    const isMeaningful = changes.some((c) => c.type === 'remove');
    if (isMeaningful) {
      get()._pushHistory();
      set({ _coalesceKey: null });
    }
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection) => {
    const { source, target } = connection;
    if (!source || !target) return;
    const isSelfLoop = source === target;

    // Check if an edge between source and target already exists
    const existingEdge = get().edges.find(
      (e) => e.source === source && e.target === target
    );

    if (existingEdge && !get().allowParallelEdges) {
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
      id: `e-${source}-${target}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source,
      target,
      // A user may drop a self-loop on any target handle. Always normalize it
      // to the top pair so its endpoints coincide and TransitionEdge renders
      // the same clean upward loop as the predefined examples.
      sourceHandle: isSelfLoop ? 'top-out' : connection.sourceHandle,
      targetHandle: isSelfLoop ? 'top-in' : connection.targetHandle,
      type: 'transition',
      data: { label: defaultLabel, parallelOffset: get().edges.filter(edge => edge.source === source && edge.target === target).length * 28, loopDirection: 'top' },
    };

    get()._pushHistory();
    set({
      // React Flow's addEdge intentionally de-duplicates identical handle
      // pairs; parallel transitions are an explicit editor feature, so append
      // directly when it is enabled.
      edges: get().allowParallelEdges ? [...get().edges, newEdge] : addEdge(newEdge, get().edges),
      _coalesceKey: null,
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

    get()._pushHistory();
    set({
      nodes: [...get().nodes, newNode],
      nodeCounter: counter + 1,
      _coalesceKey: null,
    });
  },

  deleteNode: (id) => {
    get()._pushHistory();
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      _coalesceKey: null,
    });
  },

  deleteEdge: (id) => {
    get()._pushHistory();
    set({
      edges: get().edges.filter((e) => e.id !== id),
      _coalesceKey: null,
    });
  },

  toggleStart: (id) => {
    get()._pushHistory();
    set({
      nodes: get().nodes.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, isStart: !n.data.isStart } };
        }
        // Only one start state in DFA/NFA
        return { ...n, data: { ...n.data, isStart: false } };
      }),
      _coalesceKey: null,
    });
  },

  toggleAccept: (id) => {
    get()._pushHistory();
    set({
      nodes: get().nodes.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, isAccept: !n.data.isAccept } };
        }
        return n;
      }),
      _coalesceKey: null,
    });
  },

  toggleReject: (id) => {
    get()._pushHistory();
    set({ nodes: get().nodes.map(node => node.id === id ? { ...node, data: { ...node.data, isReject: !node.data.isReject, isAccept: false } } : node), _coalesceKey: null });
  },

  updateNodeLabel: (id, label) => {
    const coalesceKey = `node-label-${id}`;
    if (get()._coalesceKey !== coalesceKey) {
      get()._pushHistory();
      set({ _coalesceKey: coalesceKey });
    }
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
    });
  },

  updateEdgeLabel: (id, label) => {
    const coalesceKey = `edge-label-${id}`;
    if (get()._coalesceKey !== coalesceKey) {
      get()._pushHistory();
      set({ _coalesceKey: coalesceKey });
    }
    set({
      edges: get().edges.map((e) => {
        if (e.id === id) {
          return { ...e, data: { ...e.data, label } };
        }
        return e;
      }),
    });
  },

  updateEdgeRouting: (id, routing) => {
    get()._pushHistory();
    set({ edges: get().edges.map(edge => edge.id === id ? { ...edge, data: { ...edge.data, ...routing } } : edge), _coalesceKey: null });
  },

  setTableTransition: (source, symbol, target) => {
    const { edges, nodes } = get();
    const containing = edges.find(edge => edge.source === source && String(edge.data?.label || '').split(',').map(value => value.trim()).includes(symbol));
    let nextEdges = edges.map(edge => {
      if (edge !== containing) return edge;
      const labels = String(edge.data?.label || '').split(',').map(value => value.trim()).filter(value => value && value !== symbol);
      return { ...edge, data: { ...edge.data, label: labels.join(', ') } };
    }).filter(edge => String(edge.data?.label || '').trim());
    if (target) {
      const existing = nextEdges.find(edge => edge.source === source && edge.target === target);
      if (existing) nextEdges = nextEdges.map(edge => edge.id === existing.id ? { ...edge, data: { ...edge.data, label: [...new Set([...String(edge.data?.label || '').split(',').map(value => value.trim()).filter(Boolean), symbol])].join(', ') } } : edge);
      else {
        const sourceNode = nodes.find(node => node.id === source); const targetNode = nodes.find(node => node.id === target);
        const handles = sourceNode && targetNode ? resolveHandles(sourceNode.position, targetNode.position, source === target) : { sourceHandle: 'right-out', targetHandle: 'left-in' };
        nextEdges.push({ id: `e-${source}-${target}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, source, target, ...handles, type: 'transition', data: { label: symbol } });
      }
    }
    get()._pushHistory();
    set({ edges: nextEdges, _coalesceKey: null });
  },

  // NFA transition-table cells allow several targets per (source, symbol), so
  // unlike setTableTransition (which replaces the single existing target)
  // this only flips one source->target edge's membership in that symbol set.
  toggleTableTransitionTarget: (source, symbol, target) => {
    const { edges, nodes } = get();
    const existingToTarget = edges.find(edge => edge.source === source && edge.target === target && String(edge.data?.label || '').split(',').map(value => value.trim()).includes(symbol));
    let nextEdges: Edge[];
    if (existingToTarget) {
      nextEdges = edges.map(edge => {
        if (edge !== existingToTarget) return edge;
        const labels = String(edge.data?.label || '').split(',').map(value => value.trim()).filter(value => value && value !== symbol);
        return { ...edge, data: { ...edge.data, label: labels.join(', ') } };
      }).filter(edge => String(edge.data?.label || '').trim());
    } else {
      const existing = edges.find(edge => edge.source === source && edge.target === target);
      if (existing) {
        nextEdges = edges.map(edge => edge.id === existing.id ? { ...edge, data: { ...edge.data, label: [...new Set([...String(edge.data?.label || '').split(',').map(value => value.trim()).filter(Boolean), symbol])].join(', ') } } : edge);
      } else {
        const sourceNode = nodes.find(node => node.id === source); const targetNode = nodes.find(node => node.id === target);
        const handles = sourceNode && targetNode ? resolveHandles(sourceNode.position, targetNode.position, source === target) : { sourceHandle: 'right-out', targetHandle: 'left-in' };
        nextEdges = [...edges, { id: `e-${source}-${target}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, source, target, ...handles, type: 'transition', data: { label: symbol } }];
      }
    }
    get()._pushHistory();
    set({ edges: nextEdges, _coalesceKey: null });
  },

  // PDA/TM transition-table rows edit one structured transition string (e.g.
  // "a, Z -> A Z" or "0 -> 1, R") at a time. `previous` identifies which
  // transition (by edge + index within that edge's comma-joined list) to pull
  // out first — used for editing an existing row's fields or moving it to a
  // new target; omit it to append a brand-new transition instead.
  setStructuredTransition: ({ source, target, transitionText, previous }) => {
    const { nodes, automatonType } = get();
    let edges = get().edges;
    // If the edited row stays on the same source/target, reuse its existing edge's
    // handles/loop-direction/parallel-offset instead of recomputing them from
    // scratch — otherwise every field edit on a lone self-loop or parallel edge
    // would visually reset it.
    const removedFrom = previous ? edges.find(edge => edge.id === previous.edgeId) : undefined;
    const preservedRouting = removedFrom && removedFrom.source === source && removedFrom.target === target
      ? { sourceHandle: removedFrom.sourceHandle, targetHandle: removedFrom.targetHandle, loopDirection: removedFrom.data?.loopDirection as LoopDirection | undefined, parallelOffset: removedFrom.data?.parallelOffset as number | undefined }
      : null;
    if (previous) {
      edges = edges.map(edge => {
        if (edge.id !== previous.edgeId) return edge;
        const items = parseTransitionLabel(String(edge.data?.label || ''), automatonType).transitions;
        const remaining = items.filter((_, index) => index !== previous.transitionIndex);
        return { ...edge, data: { ...edge.data, label: remaining.join(', ') } };
      }).filter(edge => edge.id !== previous.edgeId || String(edge.data?.label || '').trim());
    }
    if (transitionText.trim()) {
      const existing = edges.find(edge => edge.source === source && edge.target === target);
      if (existing) {
        edges = edges.map(edge => edge.id === existing.id ? { ...edge, data: { ...edge.data, label: [...parseTransitionLabel(String(edge.data?.label || ''), automatonType).transitions, transitionText].join(', ') } } : edge);
      } else {
        const sourceNode = nodes.find(node => node.id === source); const targetNode = nodes.find(node => node.id === target);
        const handles = preservedRouting?.sourceHandle && preservedRouting?.targetHandle
          ? { sourceHandle: preservedRouting.sourceHandle, targetHandle: preservedRouting.targetHandle }
          : sourceNode && targetNode ? resolveHandles(sourceNode.position, targetNode.position, source === target) : { sourceHandle: 'right-out', targetHandle: 'left-in' };
        edges = [...edges, {
          id: `e-${source}-${target}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, source, target, ...handles, type: 'transition',
          data: { label: transitionText, ...(preservedRouting?.loopDirection ? { loopDirection: preservedRouting.loopDirection } : {}), ...(preservedRouting?.parallelOffset !== undefined ? { parallelOffset: preservedRouting.parallelOffset } : {}) },
        }];
      }
    }
    get()._pushHistory();
    set({ edges, _coalesceKey: null });
  },

  clearGraph: () => {
    set({
      nodes: [],
      edges: [],
      nodeCounter: 0,
      alphabet: [],
      tapeAlphabet: [],
      stackAlphabet: [],
      tapeCount: 1,
      testSuites: emptyTestSuites(),
      past: [],
      future: [],
      _coalesceKey: null,
    });
  },

  // preserveHistory: true is used when this call is just restoring the canvas's
  // visual state (e.g. after a simulation run resets isActive highlighting) rather
  // than loading genuinely different content — the undo/redo stack should survive
  // that untouched. Real loads (projects, templates, transformation results,
  // diagrams from the lesson builder) start a fresh document, so history resets.
  loadGraph: (nodes, edges, counter, options) => {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const resolvedEdges = edges.map((e) => {
      // Normalize legacy/project self-loops too. This prevents a saved loop
      // with mismatched side handles from rendering as a straight connector.
      if (e.source === e.target) {
        const direction = (e.data?.loopDirection as LoopDirection | undefined) ?? 'top';
        return { ...e, sourceHandle: `${direction}-out`, targetHandle: `${direction}-in`, data: { ...e.data, loopDirection: direction } };
      }

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
      alphabet: options?.alphabet ?? get().alphabet,
      tapeAlphabet: options?.tapeAlphabet ?? get().tapeAlphabet,
      stackAlphabet: options?.stackAlphabet ?? get().stackAlphabet,
      tapeCount: options?.tapeCount ?? get().tapeCount,
      testSuites: options?.testSuites ?? get().testSuites,
      ...(options?.preserveHistory ? {} : { past: [], future: [], _coalesceKey: null }),
    });
  },

  autoLayout: () => {
    const { nodes, edges } = get();
    if (!nodes.length) return;
    get()._pushHistory();
    const positions = computeLayeredLayout(nodes, edges);
    set({ nodes: nodes.map(node => ({ ...node, position: positions[node.id] ?? node.position })), _coalesceKey: null });
  },

  alignNodes: (alignment) => {
    const { nodes } = get();
    if (nodes.length < 2) return;
    const xs = nodes.map(node => node.position.x), ys = nodes.map(node => node.position.y);
    const value = alignment === 'left' ? Math.min(...xs) : alignment === 'right' ? Math.max(...xs) : alignment === 'center' ? (Math.min(...xs) + Math.max(...xs)) / 2 : alignment === 'top' ? Math.min(...ys) : alignment === 'bottom' ? Math.max(...ys) : (Math.min(...ys) + Math.max(...ys)) / 2;
    get()._pushHistory();
    set({ nodes: nodes.map(node => ({ ...node, position: { ...node.position, ...(alignment === 'left' || alignment === 'right' || alignment === 'center' ? { x: value } : { y: value }) } })), _coalesceKey: null });
  },

  // Keeps the two extreme nodes along `direction` fixed and spaces the rest
  // evenly between them, matching how design tools (Figma, PowerPoint) do it.
  distributeNodes: (direction) => {
    const { nodes } = get();
    if (nodes.length < 3) return;
    const axis = direction === 'horizontal' ? 'x' : 'y';
    const sorted = [...nodes].sort((a, b) => a.position[axis] - b.position[axis]);
    const min = sorted[0].position[axis];
    const max = sorted[sorted.length - 1].position[axis];
    const step = (max - min) / (sorted.length - 1);
    const nextPositionById = new Map(sorted.map((node, index) => [node.id, min + step * index]));
    get()._pushHistory();
    set({ nodes: nodes.map(node => ({ ...node, position: { ...node.position, [axis]: nextPositionById.get(node.id) ?? node.position[axis] } })), _coalesceKey: null });
  },

  insertSubmachineOnEdge: (edgeId, submachine) => {
    const { nodes, edges } = get();
    const targetEdge = edges.find(e => e.id === edgeId);
    const sourceNode = nodes.find(n => n.id === targetEdge?.source);
    const targetNode = nodes.find(n => n.id === targetEdge?.target);
    const entryId = submachine.nodes.find(n => n.data?.isStart)?.id;
    if (!targetEdge || !sourceNode || !targetNode || !entryId) return;

    const exitIds = new Set(submachine.nodes.filter(n => n.data?.isAccept).map(n => n.id));
    const instanceSeq = `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    // Exit nodes don't get a fresh id — they're identified with the original edge's
    // target directly, so every incoming edge to an "exit" lands on a real host state.
    const idMap = new Map<string, string>(
      submachine.nodes.map(n => [n.id, exitIds.has(n.id) ? targetEdge.target : `sm_${instanceSeq}_${n.id}`])
    );

    const baseX = (sourceNode.position.x + targetNode.position.x) / 2;
    const baseY = (sourceNode.position.y + targetNode.position.y) / 2 + 160;
    const positionById = new Map<string, { x: number; y: number }>([[targetEdge.target, targetNode.position]]);
    submachine.nodes.filter(n => !exitIds.has(n.id)).forEach((n, i) => positionById.set(idMap.get(n.id)!, { x: baseX + i * 170, y: baseY }));

    const clonedNodes: Node[] = submachine.nodes
      .filter(n => !exitIds.has(n.id))
      .map(n => ({
        ...n,
        id: idMap.get(n.id)!,
        position: positionById.get(idMap.get(n.id)!)!,
        selected: false,
        data: { ...n.data, isStart: false, isAccept: false },
      }));

    const clonedEdges: Edge[] = submachine.edges.map(e => {
      const newSource = idMap.get(e.source) ?? e.source;
      const newTarget = idMap.get(e.target) ?? e.target;
      const isSelfLoop = newSource === newTarget;
      const handles = isSelfLoop
        ? { sourceHandle: `${(e.data?.loopDirection as string) || 'top'}-out`, targetHandle: `${(e.data?.loopDirection as string) || 'top'}-in` }
        : resolveHandles(positionById.get(newSource) ?? sourceNode.position, positionById.get(newTarget) ?? targetNode.position, false);
      return { ...e, id: `sm_${instanceSeq}_${e.id}`, source: newSource, target: newTarget, ...handles };
    });

    const entryNodeId = idMap.get(entryId)!;
    const entryHandles = resolveHandles(sourceNode.position, positionById.get(entryNodeId)!, sourceNode.id === entryNodeId);
    const newEntryEdge: Edge = { ...targetEdge, target: entryNodeId, sourceHandle: entryHandles.sourceHandle, targetHandle: entryHandles.targetHandle };

    get()._pushHistory();
    set({
      nodes: [...nodes, ...clonedNodes],
      edges: [...edges.filter(e => e.id !== edgeId), newEntryEdge, ...clonedEdges],
      _coalesceKey: null,
    });
  },
}));
