import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphStore } from '../useGraphStore';

const resetStore = () => {
  useGraphStore.setState({
    nodes: [],
    edges: [],
    nodeCounter: 0,
    automatonType: 'DFA',
    alphabet: [],
    testSuites: { DFA: [], NFA: [], Mealy: [], Moore: [], PDA: [], TM: [] },
    allowParallelEdges: false,
    past: [],
    future: [],
    _coalesceKey: null,
  });
};

describe('useGraphStore', () => {
  beforeEach(resetStore);

  describe('addNode', () => {
    it('makes the first node the start state and increments the counter', () => {
      useGraphStore.getState().addNode(10, 20);
      useGraphStore.getState().addNode(30, 40);

      const { nodes, nodeCounter } = useGraphStore.getState();
      expect(nodes).toHaveLength(2);
      expect(nodes[0].data.isStart).toBe(true);
      expect(nodes[1].data.isStart).toBe(false);
      expect(nodes[0].data.label).toBe('q0');
      expect(nodes[1].data.label).toBe('q1');
      expect(nodeCounter).toBe(2);
    });
  });

  describe('onConnect', () => {
    beforeEach(() => {
      useGraphStore.getState().addNode(0, 0);
      useGraphStore.getState().addNode(200, 0);
    });

    it('creates an edge with the DFA default label', () => {
      useGraphStore.getState().onConnect({
        source: 'node-0', target: 'node-1', sourceHandle: 'right-out', targetHandle: 'left-in',
      });
      const { edges } = useGraphStore.getState();
      expect(edges).toHaveLength(1);
      expect(edges[0].data?.label).toBe('a');
    });

    it('appends a new symbol to an existing edge instead of adding a parallel edge', () => {
      const { onConnect } = useGraphStore.getState();
      onConnect({ source: 'node-0', target: 'node-1', sourceHandle: null, targetHandle: null });
      onConnect({ source: 'node-0', target: 'node-1', sourceHandle: null, targetHandle: null });

      const { edges } = useGraphStore.getState();
      expect(edges).toHaveLength(1);
      expect(edges[0].data?.label).toBe('a, b');
    });

    it('uses machine-specific default labels', () => {
      useGraphStore.getState().setAutomatonType('TM');
      useGraphStore.getState().onConnect({
        source: 'node-0', target: 'node-1', sourceHandle: null, targetHandle: null,
      });
      expect(useGraphStore.getState().edges[0].data?.label).toBe('0 -> 0, R');
    });

    it('routes newly drawn self-loops through the top handles', () => {
      useGraphStore.getState().onConnect({
        source: 'node-0', target: 'node-0', sourceHandle: 'right-out', targetHandle: 'left-in',
      });
      const edge = useGraphStore.getState().edges[0];
      expect(edge.sourceHandle).toBe('top-out');
      expect(edge.targetHandle).toBe('top-in');
    });

    it('creates separate edges when parallel edges are enabled', () => {
      const store = useGraphStore.getState();
      store.setAllowParallelEdges(true);
      store.onConnect({ source: 'node-0', target: 'node-1', sourceHandle: null, targetHandle: null });
      useGraphStore.getState().onConnect({ source: 'node-0', target: 'node-1', sourceHandle: null, targetHandle: null });
      expect(useGraphStore.getState().edges).toHaveLength(2);
      expect(useGraphStore.getState().edges[1].data?.parallelOffset).toBe(28);
    });
  });

  describe('deleteNode', () => {
    it('removes the node and every edge touching it', () => {
      const s = useGraphStore.getState();
      s.addNode(0, 0);
      s.addNode(200, 0);
      useGraphStore.getState().onConnect({
        source: 'node-0', target: 'node-1', sourceHandle: null, targetHandle: null,
      });

      useGraphStore.getState().deleteNode('node-0');

      const { nodes, edges } = useGraphStore.getState();
      expect(nodes.map(n => n.id)).toEqual(['node-1']);
      expect(edges).toHaveLength(0);
    });
  });

  describe('undo/redo', () => {
    it('steps canvas edits backward and forward', () => {
      useGraphStore.getState().addNode(0, 0);
      useGraphStore.getState().addNode(100, 0);
      expect(useGraphStore.getState().nodes).toHaveLength(2);

      useGraphStore.getState().undo();
      expect(useGraphStore.getState().nodes).toHaveLength(1);

      useGraphStore.getState().redo();
      expect(useGraphStore.getState().nodes).toHaveLength(2);
    });

    it('a new edit clears the redo stack', () => {
      useGraphStore.getState().addNode(0, 0);
      useGraphStore.getState().undo();
      useGraphStore.getState().addNode(50, 50);
      expect(useGraphStore.getState().future).toHaveLength(0);
    });

    it('coalesces per-keystroke label edits into one history entry', () => {
      useGraphStore.getState().addNode(0, 0);
      const before = useGraphStore.getState().past.length;

      useGraphStore.getState().updateNodeLabel('node-0', 'a');
      useGraphStore.getState().updateNodeLabel('node-0', 'ab');
      useGraphStore.getState().updateNodeLabel('node-0', 'abc');

      expect(useGraphStore.getState().past.length).toBe(before + 1);

      useGraphStore.getState().undo();
      expect(useGraphStore.getState().nodes[0].data.label).toBe('q0');
    });
  });

  describe('loadGraph', () => {
    const nodeAt = (id: string, x: number, y: number) => ({
      id, type: 'state', position: { x, y }, data: { label: id, isStart: false, isAccept: false },
    });

    it('resolves directional handles for edges that lack them', () => {
      useGraphStore.getState().loadGraph(
        [nodeAt('a', 0, 0), nodeAt('b', 300, 0)],
        [{ id: 'e1', source: 'a', target: 'b' }],
        2,
      );
      const edge = useGraphStore.getState().edges[0];
      expect(edge.sourceHandle).toBe('right-out');
      expect(edge.targetHandle).toBe('left-in');
    });

    it('routes self-loops through the top handles', () => {
      useGraphStore.getState().loadGraph(
        [nodeAt('a', 0, 0)],
        [{ id: 'loop', source: 'a', target: 'a', sourceHandle: 'right-out', targetHandle: 'left-in' }],
        1,
      );
      const edge = useGraphStore.getState().edges[0];
      expect(edge.sourceHandle).toBe('top-out');
      expect(edge.targetHandle).toBe('top-in');
    });

    it('resets undo history unless preserveHistory is set', () => {
      useGraphStore.getState().addNode(0, 0);
      expect(useGraphStore.getState().past.length).toBeGreaterThan(0);

      useGraphStore.getState().loadGraph([nodeAt('a', 0, 0)], [], 1);
      expect(useGraphStore.getState().past).toHaveLength(0);

      useGraphStore.getState().addNode(10, 10);
      const pastLen = useGraphStore.getState().past.length;
      useGraphStore.getState().loadGraph([nodeAt('b', 0, 0)], [], 1, { preserveHistory: true });
      expect(useGraphStore.getState().past.length).toBe(pastLen);
    });
  });

  describe('clearGraph', () => {
    it('empties the canvas, counter, and history', () => {
      useGraphStore.getState().addNode(0, 0);
      useGraphStore.getState().clearGraph();
      const { nodes, edges, nodeCounter, past, future } = useGraphStore.getState();
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
      expect(nodeCounter).toBe(0);
      expect(past).toHaveLength(0);
      expect(future).toHaveLength(0);
    });
  });

  it('keeps alphabet and test suites as editable machine configuration', () => {
    const store = useGraphStore.getState();
    store.setAlphabet(['1', '0', '1']);
    store.addTestCase('DFA', '010', 'accept');
    expect(useGraphStore.getState().alphabet).toEqual(['0', '1']);
    expect(useGraphStore.getState().testSuites.DFA[0]).toMatchObject({ input: '010', expected: 'accept' });
  });

  it('lays out and aligns states', () => {
    const store = useGraphStore.getState();
    store.addNode(0, 10); store.addNode(300, 80);
    store.alignNodes('top');
    expect(useGraphStore.getState().nodes.map(node => node.position.y)).toEqual([10, 10]);
    store.autoLayout();
    expect(useGraphStore.getState().nodes[1].position).not.toEqual(useGraphStore.getState().nodes[0].position);
  });

  describe('distributeNodes', () => {
    it('spaces nodes evenly along the axis while keeping the extremes fixed', () => {
      const store = useGraphStore.getState();
      store.addNode(0, 0); store.addNode(10, 0); store.addNode(300, 0);
      // Nudge the middle node off-axis first so we can also confirm the other axis is untouched.
      useGraphStore.setState(state => ({ nodes: state.nodes.map(n => n.id === 'node-1' ? { ...n, position: { x: 10, y: 999 } } : n) }));

      store.distributeNodes('horizontal');

      const nodes = useGraphStore.getState().nodes;
      expect(nodes.find(n => n.id === 'node-0')?.position.x).toBe(0);
      expect(nodes.find(n => n.id === 'node-1')?.position.x).toBe(150);
      expect(nodes.find(n => n.id === 'node-2')?.position.x).toBe(300);
      expect(nodes.find(n => n.id === 'node-1')?.position.y).toBe(999);
    });

    it('does nothing with fewer than 3 nodes', () => {
      const store = useGraphStore.getState();
      store.addNode(0, 0); store.addNode(50, 0);
      const before = useGraphStore.getState().nodes;
      store.distributeNodes('horizontal');
      expect(useGraphStore.getState().nodes).toEqual(before);
    });
  });

  describe('toggleTableTransitionTarget', () => {
    beforeEach(() => {
      useGraphStore.getState().setAutomatonType('NFA');
      useGraphStore.getState().addNode(0, 0);
      useGraphStore.getState().addNode(200, 0);
      useGraphStore.getState().addNode(400, 0);
    });

    it('adds a symbol to a second target without disturbing the first', () => {
      const store = useGraphStore.getState();
      store.toggleTableTransitionTarget('node-0', '0', 'node-1');
      store.toggleTableTransitionTarget('node-0', '0', 'node-2');

      const edges = useGraphStore.getState().edges;
      expect(edges.find(e => e.target === 'node-1')?.data?.label).toBe('0');
      expect(edges.find(e => e.target === 'node-2')?.data?.label).toBe('0');
    });

    it('removes just that one target when toggled off again', () => {
      const store = useGraphStore.getState();
      store.toggleTableTransitionTarget('node-0', '0', 'node-1');
      store.toggleTableTransitionTarget('node-0', '0', 'node-1');
      expect(useGraphStore.getState().edges).toHaveLength(0);
    });
  });

  describe('setStructuredTransition', () => {
    beforeEach(() => {
      useGraphStore.getState().setAutomatonType('PDA');
      useGraphStore.getState().addNode(0, 0);
      useGraphStore.getState().addNode(200, 0);
    });

    it('appends a brand-new transition when no previous location is given', () => {
      useGraphStore.getState().setStructuredTransition({ source: 'node-0', target: 'node-1', transitionText: 'a, Z -> A Z' });
      const edges = useGraphStore.getState().edges;
      expect(edges).toHaveLength(1);
      expect(edges[0].data?.label).toBe('a, Z -> A Z');
    });

    it('moves a transition to a new target, preserving its sibling on the old edge', () => {
      const store = useGraphStore.getState();
      store.setStructuredTransition({ source: 'node-0', target: 'node-0', transitionText: 'a, Z -> A Z' });
      store.setStructuredTransition({ source: 'node-0', target: 'node-0', transitionText: 'b, A -> ε' });

      store.setStructuredTransition({
        source: 'node-0', target: 'node-1', transitionText: 'a, Z -> A Z',
        previous: { edgeId: useGraphStore.getState().edges[0].id, transitionIndex: 0 },
      });

      const edges = useGraphStore.getState().edges;
      const selfLoop = edges.find(e => e.source === 'node-0' && e.target === 'node-0');
      const moved = edges.find(e => e.source === 'node-0' && e.target === 'node-1');
      expect(selfLoop?.data?.label).toBe('b, A -> ε');
      expect(moved?.data?.label).toBe('a, Z -> A Z');
    });

    it('removes the edge entirely once its last transition is cleared', () => {
      const store = useGraphStore.getState();
      store.setStructuredTransition({ source: 'node-0', target: 'node-1', transitionText: 'a, Z -> A Z' });
      const edgeId = useGraphStore.getState().edges[0].id;

      store.setStructuredTransition({ source: 'node-0', target: 'node-1', transitionText: '', previous: { edgeId, transitionIndex: 0 } });
      expect(useGraphStore.getState().edges).toHaveLength(0);
    });
  });

  describe('insertSubmachineOnEdge', () => {
    const node = (id: string, x: number, isStart = false, isAccept = false) => ({
      id, type: 'state', position: { x, y: 0 }, data: { label: id, isStart, isAccept },
    });

    const setupHostDiagram = () => {
      useGraphStore.setState({
        nodes: [node('A', 0, true), node('B', 200)],
        edges: [{ id: 'hostEdge', source: 'A', target: 'B', type: 'transition', data: { label: '0 -> 1, R' } }],
      });
    };

    const submachine = {
      id: 'sm-1',
      name: 'Increment',
      automatonType: 'TM' as const,
      nodes: [node('m0', 0, true), node('m1', 100), node('m2', 200, false, true)],
      edges: [
        { id: 'me0', source: 'm0', target: 'm1', type: 'transition', data: { label: '0 -> 0, R' } },
        { id: 'me1', source: 'm1', target: 'm2', type: 'transition', data: { label: '1 -> 1, R' } },
      ],
      createdAt: new Date().toISOString(),
    };

    it('redirects the chosen edge into the submachine entry, and merges its exit state into the original target', () => {
      setupHostDiagram();
      useGraphStore.getState().insertSubmachineOnEdge('hostEdge', submachine);

      const { nodes, edges } = useGraphStore.getState();
      // m2 (the submachine's exit) is never cloned as a node — only entry (m0) and the
      // internal state (m1) are, alongside the original A and B.
      expect(nodes).toHaveLength(4);
      expect(nodes.some(n => n.id === 'A')).toBe(true);
      expect(nodes.some(n => n.id === 'B')).toBe(true);

      // The original edge is redirected (same id, new target) to the cloned entry
      // state, preserving the original transition label.
      const entryEdge = edges.find(e => e.source === 'A');
      expect(entryEdge?.id).toBe('hostEdge');
      expect(entryEdge?.data?.label).toBe('0 -> 1, R');
      expect(entryEdge?.target).not.toBe('B');

      // The cloned internal edge that originally targeted the exit state (m2) now
      // targets B directly — no invented pass-through transition.
      const mergedEdge = edges.find(e => e.target === 'B');
      expect(mergedEdge?.data?.label).toBe('1 -> 1, R');

      // The cloned entry/internal nodes carry fresh ids, not the submachine's raw ids.
      expect(nodes.some(n => n.id === 'm0')).toBe(false);
      expect(nodes.some(n => n.id === 'm1')).toBe(false);
    });

    it('supports undo back to the pre-splice diagram', () => {
      setupHostDiagram();
      useGraphStore.getState().insertSubmachineOnEdge('hostEdge', submachine);
      expect(useGraphStore.getState().nodes).toHaveLength(4);

      useGraphStore.getState().undo();
      const { nodes, edges } = useGraphStore.getState();
      expect(nodes).toHaveLength(2);
      expect(edges).toHaveLength(1);
      expect(edges[0].id).toBe('hostEdge');
    });
  });
});
