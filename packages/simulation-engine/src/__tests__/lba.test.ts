import { describe, it, expect } from 'vitest';
import { simulateTuringMachine, simulateLBA } from '../index';
import type { Automaton } from '../index';

describe('LBA (bounded-tape Turing machine simulation)', () => {
  it('accepts a machine that never needs to leave the input-bounded region', () => {
    const tm: Automaton = {
      nodes: [{ id: 'q0', label: 'q0', isStart: true, isAccept: true }],
      edges: []
    };
    expect(simulateLBA(tm, 'ab').accepted).toBe(true);
  });

  it('an ordinary unbounded TM can accept by reading one cell past the input, while the LBA-bounded version of the same machine rejects that same run', () => {
    const tm: Automaton = {
      nodes: [
        { id: 'q0', label: 'q0', isStart: true, isAccept: false },
        { id: 'q1', label: 'q1', isStart: false, isAccept: true }
      ],
      edges: [
        { id: 'e0', source: 'q0', target: 'q0', symbols: ['a -> a, R', 'b -> b, R'] },
        { id: 'e1', source: 'q0', target: 'q1', symbols: ['_ -> _, S'] }
      ]
    };

    // Unbounded: reads 'a' (R), 'b' (R), then the blank one cell past the
    // input at index 2 — accepts from q1.
    expect(simulateTuringMachine(tm, 'ab').accepted).toBe(true);

    // Same machine, same input, but the move from index 1 to index 2 leaves
    // the input-length-bounded tape (valid indices are only 0 and 1) — the
    // LBA convention halts and rejects instead of continuing.
    expect(simulateLBA(tm, 'ab').accepted).toBe(false);
  });

  it('rejects a leftward move past index 0 under the LBA bound', () => {
    const tm: Automaton = {
      nodes: [
        { id: 'q0', label: 'q0', isStart: true, isAccept: false },
        { id: 'q1', label: 'q1', isStart: false, isAccept: true }
      ],
      edges: [{ id: 'e0', source: 'q0', target: 'q1', symbols: ['a -> a, L'] }]
    };
    expect(simulateTuringMachine(tm, 'a').accepted).toBe(true);
    expect(simulateLBA(tm, 'a').accepted).toBe(false);
  });
});
