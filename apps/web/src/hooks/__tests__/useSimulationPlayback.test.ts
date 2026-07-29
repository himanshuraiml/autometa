import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useSimulationPlayback } from '../useSimulationPlayback';
import { useGraphStore } from '../../store/useGraphStore';

// This project doesn't set vitest's `globals: true`, so @testing-library/react's
// automatic afterEach(cleanup) registration (which relies on detecting a global
// `afterEach`) never fires — without this, unmounted-in-spirit `renderHook`
// instances from earlier tests stay subscribed to the store and race the
// current test's assertions.
afterEach(cleanup);

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

describe('useSimulationPlayback auto-stop on canvas edit', () => {
  beforeEach(() => {
    resetStore();
    useGraphStore.getState().addNode(0, 0);
    useGraphStore.getState().toggleAccept('node-0');
  });

  it('does not stop the simulation when only its own visual updates touch nodes/edges', () => {
    const { result } = renderHook(() => useSimulationPlayback({ automatonType: 'DFA' }));

    act(() => result.current.setInputString(''));
    act(() => result.current.startSimulation());
    expect(result.current.timeline).not.toBeNull();

    // Mirrors exactly what updateVisualStates touches during playback —
    // glow/scale only, no structural change.
    act(() => {
      useGraphStore.setState(state => ({
        nodes: state.nodes.map(n => ({ ...n, data: { ...n.data, glow: 1, scale: 1.2 } })),
      }));
    });

    expect(result.current.timeline).not.toBeNull();
  });

  it('stops the simulation when the user actually edits the graph', () => {
    const { result } = renderHook(() => useSimulationPlayback({ automatonType: 'DFA' }));

    act(() => result.current.setInputString(''));
    act(() => result.current.startSimulation());
    expect(result.current.timeline).not.toBeNull();

    act(() => {
      useGraphStore.getState().addNode(100, 100);
    });

    expect(result.current.timeline).toBeNull();
  });

  it('stops the simulation when a node is relabeled', () => {
    const { result } = renderHook(() => useSimulationPlayback({ automatonType: 'DFA' }));

    act(() => result.current.setInputString(''));
    act(() => result.current.startSimulation());
    expect(result.current.timeline).not.toBeNull();

    act(() => {
      useGraphStore.getState().updateNodeLabel('node-0', 'renamed');
    });

    expect(result.current.timeline).toBeNull();
  });
});
