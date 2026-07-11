import { describe, it, expect } from 'vitest';
import { simulateMealy, simulateMoore } from '../index';
import type { Automaton } from '../index';

describe('Transducer Simulation - Mealy & Moore Machines', () => {
  it('should compute 1s complement output on a Mealy Machine', () => {
    // Mealy machine for binary negation (0 -> 1, 1 -> 0)
    // States: q0 (start)
    // Transitions: q0 -> q0 on 0/1 and 1/0
    const mealy: Automaton = {
      nodes: [
        { id: 'q0', label: 'q0', isStart: true, isAccept: false }
      ],
      edges: [
        { id: 'e1', source: 'q0', target: 'q0', symbols: ['0/1', '1/0'] }
      ]
    };

    const result = simulateMealy(mealy, '0110');
    expect(result.outputString).toBe('1001');
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('should compute state remainder modulo 3 on a Moore Machine', () => {
    // Moore machine for Modulo 3 binary representation (read MSB first)
    // States: 
    // - s0 (remainder 0, start, outputs 0)
    // - s1 (remainder 1, outputs 1)
    // - s2 (remainder 2, outputs 2)
    // Transitions:
    // s0 on 0 -> s0, on 1 -> s1
    // s1 on 0 -> s2, on 1 -> s0
    // s2 on 0 -> s1, on 1 -> s2
    const moore: Automaton = {
      nodes: [
        { id: 's0', label: 's0/0', isStart: true, isAccept: false },
        { id: 's1', label: 's1/1', isStart: false, isAccept: false },
        { id: 's2', label: 's2/2', isStart: false, isAccept: false }
      ],
      edges: [
        { id: 'e00', source: 's0', target: 's0', symbols: ['0'] },
        { id: 'e01', source: 's0', target: 's1', symbols: ['1'] },
        { id: 'e10', source: 's1', target: 's2', symbols: ['0'] },
        { id: 'e11', source: 's1', target: 's0', symbols: ['1'] },
        { id: 'e20', source: 's2', target: 's1', symbols: ['0'] },
        { id: 'e21', source: 's2', target: 's2', symbols: ['1'] }
      ]
    };

    // Input "10" is binary 2. 
    // Moore outputs: start state output (0), then transitions:
    // s0 -> s1 (outputs 1), then s1 -> s2 (outputs 2).
    // Total output: "012"
    const result = simulateMoore(moore, '10');
    expect(result.outputString).toBe('012');
  });
});
