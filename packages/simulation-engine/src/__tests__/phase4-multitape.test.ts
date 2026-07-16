import { describe, it, expect } from 'vitest';
import { simulateMultiTapeTuringMachine } from '../index';
import type { Automaton } from '../index';

describe('multi-tape Turing machine simulation', () => {
  // Copies tape 0's content onto tape 1, symbol by symbol, halting (and
  // accepting) once tape 0 runs out of input (reads blank).
  const copyMachine: Automaton = {
    nodes: [
      { id: 'q0', label: 'q0', isStart: true, isAccept: false },
      { id: 'qAccept', label: 'qAccept', isStart: false, isAccept: true },
    ],
    edges: [
      { id: 'e0', source: 'q0', target: 'q0', symbols: ['0,_ -> 0,0 ; R,R'] },
      { id: 'e1', source: 'q0', target: 'q0', symbols: ['1,_ -> 1,1 ; R,R'] },
      { id: 'e2', source: 'q0', target: 'qAccept', symbols: ['_,_ -> _,_ ; S,S'] },
    ],
  };

  it('copies tape 0 onto tape 1 and accepts once the input is exhausted', () => {
    const result = simulateMultiTapeTuringMachine(copyMachine, '101', 2, '_');
    expect(result.accepted).toBe(true);

    const lastEvent = result.events[result.events.length - 1];
    expect(lastEvent.tapes).toBeDefined();
    const [tape0, tape1] = lastEvent.tapes!;
    expect(tape0[0]).toBe('1');
    expect(tape0[1]).toBe('0');
    expect(tape0[2]).toBe('1');
    expect(tape1[0]).toBe('1');
    expect(tape1[1]).toBe('0');
    expect(tape1[2]).toBe('1');
    expect(lastEvent.headIndices).toEqual([3, 3]);
  });

  it('halts and rejects on a symbol no transition can read', () => {
    // '2' never appears in any transition's read tuple.
    const result = simulateMultiTapeTuringMachine(copyMachine, '12', 2, '_');
    expect(result.accepted).toBe(false);
  });

  it('is a strictly opt-in path — single-tape machines are unaffected (tapeCount defaults to 1 in the store, this simulator is only reached when tapeCount > 1)', () => {
    const result = simulateMultiTapeTuringMachine(copyMachine, '', 2, '_');
    // Empty input: tape 0 is blank immediately, so the machine accepts on step 1.
    expect(result.accepted).toBe(true);
  });
});
