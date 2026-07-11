import { describe, it, expect } from 'vitest';
import { nfaToDfa, minimizeDFA } from '../index';
import type { Automaton } from '@autometa/simulation-engine';

describe('Rule Engine - Finite Automata Algorithms', () => {
  it('should convert NFA to DFA using subset construction', () => {
    // NFA for language matching (a|b)*abb
    // States: q0 (start), q1, q2, q3 (accept)
    // Transitions:
    // q0 -> q0 on a, b
    // q0 -> q1 on a
    // q1 -> q2 on b
    // q2 -> q3 on b
    const nfa: Automaton = {
      nodes: [
        { id: 'q0', label: 'q0', isStart: true, isAccept: false },
        { id: 'q1', label: 'q1', isStart: false, isAccept: false },
        { id: 'q2', label: 'q2', isStart: false, isAccept: false },
        { id: 'q3', label: 'q3', isStart: false, isAccept: true }
      ],
      edges: [
        { id: 'e1', source: 'q0', target: 'q0', symbols: ['a', 'b'] },
        { id: 'e2', source: 'q0', target: 'q1', symbols: ['a'] },
        { id: 'e3', source: 'q1', target: 'q2', symbols: ['b'] },
        { id: 'e4', source: 'q2', target: 'q3', symbols: ['b'] }
      ]
    };

    const dfa = nfaToDfa(nfa);
    
    // The DFA start state should be the epsilon closure of q0, which is just {q0}
    const startNode = dfa.nodes.find(n => n.isStart);
    expect(startNode).toBeDefined();
    expect(startNode?.label).toBe('{q0}');
    
    // There should be at least one accept state in the DFA (any state containing q3)
    const acceptNodes = dfa.nodes.filter(n => n.isAccept);
    expect(acceptNodes.length).toBeGreaterThan(0);
  });

  it('should minimize a DFA using Myhill-Nerode table-filling', () => {
    // Non-minimized DFA:
    // States: A (start, accept), B (accept), C, D, E
    // A and B are equivalent accepting states, C and D are equivalent non-accepting states.
    // Transition table:
    // State  on 0  on 1
    // A (s)   B     C
    // B       A     D
    // C       D     E
    // D       C     E
    // E       E     E
    const dfa: Automaton = {
      nodes: [
        { id: 'A', label: 'A', isStart: true, isAccept: true },
        { id: 'B', label: 'B', isStart: false, isAccept: true },
        { id: 'C', label: 'C', isStart: false, isAccept: false },
        { id: 'D', label: 'D', isStart: false, isAccept: false },
        { id: 'E', label: 'E', isStart: false, isAccept: false }
      ],
      edges: [
        { id: 'e1', source: 'A', target: 'B', symbols: ['0'] },
        { id: 'e2', source: 'A', target: 'C', symbols: ['1'] },
        { id: 'e3', source: 'B', target: 'A', symbols: ['0'] },
        { id: 'e4', source: 'B', target: 'D', symbols: ['1'] },
        { id: 'e5', source: 'C', target: 'D', symbols: ['0'] },
        { id: 'e6', source: 'C', target: 'E', symbols: ['1'] },
        { id: 'e7', source: 'D', target: 'C', symbols: ['0'] },
        { id: 'e8', source: 'D', target: 'E', symbols: ['1'] },
        { id: 'e9', source: 'E', target: 'E', symbols: ['0', '1'] }
      ]
    };

    const minDfa = minimizeDFA(dfa);
    
    // Minimized DFA should have 2 states (A+B, C+D+E)
    expect(minDfa.nodes.length).toBe(2);
  });
});
