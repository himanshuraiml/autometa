import { describe, it, expect } from 'vitest';
import { simulatePDA, simulateTuringMachine, simulatePDAAllBranches } from '../index';
import type { Automaton } from '../index';

describe('Advanced Automata Simulation - PDA & Turing Machine', () => {
  it('should accept a^n b^n on PDA', () => {
    // PDA for a^n b^n
    const pda: Automaton = {
      nodes: [
        { id: 'p0', label: 'p0', isStart: true, isAccept: false },
        { id: 'p1', label: 'p1', isStart: false, isAccept: false },
        { id: 'p2', label: 'p2', isStart: false, isAccept: true }
      ],
      edges: [
        { id: 'e1', source: 'p0', target: 'p0', symbols: ['a, Z -> A Z'] },
        { id: 'e2', source: 'p0', target: 'p0', symbols: ['a, A -> A A'] },
        { id: 'e3', source: 'p0', target: 'p1', symbols: ['b, A -> ε'] },
        { id: 'e4', source: 'p1', target: 'p1', symbols: ['b, A -> ε'] },
        { id: 'e5', source: 'p1', target: 'p2', symbols: ['ε, Z -> Z'] }
      ]
    };

    const resAccepted = simulatePDA(pda, 'aabb');
    expect(resAccepted.accepted).toBe(true);

    const resRejected = simulatePDA(pda, 'aab');
    expect(resRejected.accepted).toBe(false);
  });

  it('should increment binary tape values on Turing Machine', () => {
    // Turing Machine that increments a binary string (e.g. 1011 -> 1100)
    const tm: Automaton = {
      nodes: [
        { id: 't0', label: 't0', isStart: true, isAccept: false },
        { id: 't1', label: 't1', isStart: false, isAccept: false },
        { id: 't2', label: 't2', isStart: false, isAccept: false },
        { id: 't3', label: 't3', isStart: false, isAccept: true }
      ],
      edges: [
        { id: 'e0', source: 't0', target: 't0', symbols: ['0 -> 0, R', '1 -> 1, R'] },
        { id: 'e1', source: 't0', target: 't1', symbols: ['_ -> _, L'] },
        { id: 'e2', source: 't1', target: 't1', symbols: ['1 -> 0, L'] },
        { id: 'e3', source: 't1', target: 't2', symbols: ['0 -> 1, L', '_ -> 1, L'] },
        { id: 'e4', source: 't2', target: 't2', symbols: ['0 -> 0, L', '1 -> 1, L'] },
        { id: 'e5', source: 't2', target: 't3', symbols: ['_ -> _, R'] }
      ]
    };

    const res = simulateTuringMachine(tm, '1011');
    expect(res.accepted).toBe(true);

    // Grab the tape state from the last event
    const lastEvent: any = res.events[res.events.length - 1];
    expect(lastEvent.tape[0]).toBe('1');
    expect(lastEvent.tape[1]).toBe('1');
    expect(lastEvent.tape[2]).toBe('0');
    expect(lastEvent.tape[3]).toBe('0');
  });

  it('halts immediately in an explicit reject state', () => {
    const result = simulateTuringMachine({
      nodes: [{ id: 'q0', label: 'q0', isStart: true, isAccept: false, isReject: true }],
      edges: []
    }, '101');
    expect(result.accepted).toBe(false);
    expect(result.events.at(-1)?.event).toBe('reject');
  });

  it('simulatePDAAllBranches explores every nondeterministic path, not just the first success', () => {
    // From r0, two edges both match input 'a' (genuine nondeterministic branching):
    // one lands on a non-accepting state, the other on an accepting one.
    const pda: Automaton = {
      nodes: [
        { id: 'r0', label: 'r0', isStart: true, isAccept: false },
        { id: 'r1', label: 'r1', isStart: false, isAccept: false },
        { id: 'r2', label: 'r2', isStart: false, isAccept: true },
      ],
      edges: [
        { id: 'e1', source: 'r0', target: 'r1', symbols: ['a, ε -> ε'] },
        { id: 'e2', source: 'r0', target: 'r2', symbols: ['a, ε -> ε'] },
      ],
    };

    const branches = simulatePDAAllBranches(pda, 'a');
    expect(branches).toHaveLength(2);
    expect(branches.filter(b => b.accepted)).toHaveLength(1);
    expect(branches.filter(b => !b.accepted)).toHaveLength(1);

    // simulatePDA itself is unaffected — still returns a single best/last path.
    const single = simulatePDA(pda, 'a');
    expect(single.accepted).toBe(true);
  });

  it('supports empty-stack acceptance mode alongside the default final-state mode', () => {
    // Single self-loop that pops the initial stack symbol without pushing anything back.
    const pda: Automaton = {
      nodes: [{ id: 's0', label: 's0', isStart: true, isAccept: false }],
      edges: [{ id: 'e1', source: 's0', target: 's0', symbols: ['a, Z -> ε'] }],
    };

    expect(simulatePDA(pda, 'a', 'Z', 'final-state').accepted).toBe(false);
    expect(simulatePDA(pda, 'a', 'Z', 'empty-stack').accepted).toBe(true);

    const branches = simulatePDAAllBranches(pda, 'a', 'Z', 'empty-stack');
    expect(branches.some(b => b.accepted)).toBe(true);
  });
});
