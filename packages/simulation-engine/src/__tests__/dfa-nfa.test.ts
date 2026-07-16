import { describe, it, expect } from 'vitest';
import { simulateDFA, simulateNFA, isEpsilon } from '../index';
import type { Automaton } from '../index';

// DFA over {a, b} accepting strings that end with "ab".
const endsWithAb: Automaton = {
  nodes: [
    { id: 'q0', label: 'q0', isStart: true, isAccept: false },
    { id: 'q1', label: 'q1', isStart: false, isAccept: false },
    { id: 'q2', label: 'q2', isStart: false, isAccept: true }
  ],
  edges: [
    { id: 'e1', source: 'q0', target: 'q1', symbols: ['a'] },
    { id: 'e2', source: 'q0', target: 'q0', symbols: ['b'] },
    { id: 'e3', source: 'q1', target: 'q1', symbols: ['a'] },
    { id: 'e4', source: 'q1', target: 'q2', symbols: ['b'] },
    { id: 'e5', source: 'q2', target: 'q1', symbols: ['a'] },
    { id: 'e6', source: 'q2', target: 'q0', symbols: ['b'] }
  ]
};

describe('simulateDFA', () => {
  it('accepts exactly the strings ending in "ab"', () => {
    for (const input of ['ab', 'aab', 'bab', 'abab']) {
      expect(simulateDFA(endsWithAb, input).accepted, input).toBe(true);
    }
    for (const input of ['', 'a', 'b', 'ba', 'abba']) {
      expect(simulateDFA(endsWithAb, input).accepted, input).toBe(false);
    }
  });

  it('accepts the empty string when the start state accepts', () => {
    const dfa: Automaton = {
      nodes: [{ id: 'q0', label: 'q0', isStart: true, isAccept: true }],
      edges: []
    };
    expect(simulateDFA(dfa, '').accepted).toBe(true);
  });

  it('rejects when a symbol has no outgoing transition', () => {
    const result = simulateDFA(endsWithAb, 'ac');
    expect(result.accepted).toBe(false);
    expect(result.events.at(-1)?.event).toBe('reject');
  });

  it('rejects when no start state exists', () => {
    const noStart: Automaton = {
      nodes: [{ id: 'q0', label: 'q0', isStart: false, isAccept: true }],
      edges: []
    };
    expect(simulateDFA(noStart, 'a').accepted).toBe(false);
  });

  it('matches symbols case-sensitively', () => {
    const dfa: Automaton = {
      nodes: [
        { id: 'q0', label: 'q0', isStart: true, isAccept: false },
        { id: 'q1', label: 'q1', isStart: false, isAccept: true }
      ],
      edges: [{ id: 'e1', source: 'q0', target: 'q1', symbols: ['A'] }]
    };
    expect(simulateDFA(dfa, 'A').accepted).toBe(true);
    expect(simulateDFA(dfa, 'a').accepted).toBe(false);
  });

  it('emits a coherent event stream for an accepted run', () => {
    const { events } = simulateDFA(endsWithAb, 'ab');
    expect(events[0]).toMatchObject({ event: 'enter_state', stateId: 'q0' });
    expect(events.filter(e => e.event === 'transition')).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ event: 'accept', stateId: 'q2' });
  });
});

// ε-NFA accepting a* b: q0 --ε--> q1, q0 loops on a, q1 --b--> q2.
const epsilonNfa: Automaton = {
  nodes: [
    { id: 'q0', label: 'q0', isStart: true, isAccept: false },
    { id: 'q1', label: 'q1', isStart: false, isAccept: false },
    { id: 'q2', label: 'q2', isStart: false, isAccept: true }
  ],
  edges: [
    { id: 'e1', source: 'q0', target: 'q0', symbols: ['a'] },
    { id: 'e2', source: 'q0', target: 'q1', symbols: ['ε'] },
    { id: 'e3', source: 'q1', target: 'q2', symbols: ['b'] }
  ]
};

describe('simulateNFA', () => {
  it('follows epsilon transitions from the start closure', () => {
    expect(simulateNFA(epsilonNfa, 'b').accepted).toBe(true);
    expect(simulateNFA(epsilonNfa, 'aab').accepted).toBe(true);
    expect(simulateNFA(epsilonNfa, 'ba').accepted).toBe(false);
    expect(simulateNFA(epsilonNfa, '').accepted).toBe(false);
  });

  it('explores nondeterministic branches in parallel', () => {
    // Accepts both "a" and "ab" via different branches.
    const nfa: Automaton = {
      nodes: [
        { id: 'q0', label: 'q0', isStart: true, isAccept: false },
        { id: 'q1', label: 'q1', isStart: false, isAccept: true },
        { id: 'q2', label: 'q2', isStart: false, isAccept: false },
        { id: 'q3', label: 'q3', isStart: false, isAccept: true }
      ],
      edges: [
        { id: 'e1', source: 'q0', target: 'q1', symbols: ['a'] },
        { id: 'e2', source: 'q0', target: 'q2', symbols: ['a'] },
        { id: 'e3', source: 'q2', target: 'q3', symbols: ['b'] }
      ]
    };
    expect(simulateNFA(nfa, 'a').accepted).toBe(true);
    expect(simulateNFA(nfa, 'ab').accepted).toBe(true);
    expect(simulateNFA(nfa, 'b').accepted).toBe(false);
    expect(simulateNFA(nfa, 'abb').accepted).toBe(false);
  });

  it('treats every epsilon spelling the same way', () => {
    for (const spelling of ['', 'ε', 'epsilon', 'λ', 'lambda', 'Epsilon', ' ε ']) {
      expect(isEpsilon(spelling), JSON.stringify(spelling)).toBe(true);
    }
    expect(isEpsilon('a')).toBe(false);

    for (const spelling of ['epsilon', 'λ', 'lambda']) {
      const nfa: Automaton = {
        nodes: [
          { id: 'q0', label: 'q0', isStart: true, isAccept: false },
          { id: 'q1', label: 'q1', isStart: false, isAccept: true }
        ],
        edges: [{ id: 'e1', source: 'q0', target: 'q1', symbols: [spelling] }]
      };
      expect(simulateNFA(nfa, '').accepted, spelling).toBe(true);
    }
  });

  it('rejects when all branches die out', () => {
    const result = simulateNFA(epsilonNfa, 'c');
    expect(result.accepted).toBe(false);
    expect(result.events.at(-1)?.event).toBe('reject');
  });
});
