import { describe, it, expect } from 'vitest';
import { nfaToDfa, nfaToDfaSteps, minimizeDFA, minimizeDFASteps } from '../index';
import { getEpsilonClosure } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';

// ε-NFA for a(b|ε): q0 -a-> q1, q1 -ε-> q2, q1 -b-> q2 (q2 accepting)
const epsilonNfa: Automaton = {
  nodes: [
    { id: 'q0', label: 'q0', isStart: true, isAccept: false },
    { id: 'q1', label: 'q1', isStart: false, isAccept: false },
    { id: 'q2', label: 'q2', isStart: false, isAccept: true }
  ],
  edges: [
    { id: 'e1', source: 'q0', target: 'q1', symbols: ['a'] },
    { id: 'e2', source: 'q1', target: 'q2', symbols: ['ε'] },
    { id: 'e3', source: 'q1', target: 'q2', symbols: ['b'] }
  ]
};

const nonMinimalDfa: Automaton = {
  nodes: [
    { id: 'A', label: 'A', isStart: true, isAccept: true },
    { id: 'B', label: 'B', isStart: false, isAccept: true },
    { id: 'C', label: 'C', isStart: false, isAccept: false },
    { id: 'D', label: 'D', isStart: false, isAccept: false },
    { id: 'E', label: 'E', isStart: false, isAccept: false },
    // Unreachable state: must be excluded from the walkthrough trace.
    { id: 'X', label: 'X', isStart: false, isAccept: false }
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

describe('getEpsilonClosure (canonical, from simulation-engine)', () => {
  it('follows epsilon chains transitively', () => {
    const closure = getEpsilonClosure(epsilonNfa, new Set(['q1']));
    expect(closure).toEqual(new Set(['q1', 'q2']));
  });

  it('returns the input states when there are no epsilon edges', () => {
    const closure = getEpsilonClosure(epsilonNfa, new Set(['q0']));
    expect(closure).toEqual(new Set(['q0']));
  });
});

describe('nfaToDfaSteps', () => {
  it('produces one row per DFA state and a final DFA equivalent to nfaToDfa', () => {
    const walkthrough = nfaToDfaSteps(epsilonNfa);
    const plain = nfaToDfa(epsilonNfa);

    expect(walkthrough.rows.length).toBe(plain.nodes.length);
    expect(walkthrough.finalDfa.nodes.map(n => n.label).sort())
      .toEqual(plain.nodes.map(n => n.label).sort());
    expect(walkthrough.finalDfa.nodes.filter(n => n.isAccept).length)
      .toBe(plain.nodes.filter(n => n.isAccept).length);
  });

  it('excludes epsilon from the alphabet and applies closures in transitions', () => {
    const { alphabet, rows } = nfaToDfaSteps(epsilonNfa);
    expect(alphabet).toEqual(['a', 'b']);

    // From {q0} on 'a' we reach q1 and, via ε, q2 — the row must record the closure.
    const startRow = rows.find(r => r.stateId === 'p0')!;
    expect(new Set(startRow.transitions['a'].targetSubset)).toEqual(new Set(['q1', 'q2']));
  });

  it('returns an empty walkthrough when there is no start state', () => {
    const result = nfaToDfaSteps({ nodes: [], edges: [] });
    expect(result).toEqual({ alphabet: [], rows: [], finalDfa: { nodes: [], edges: [] } });
  });
});

describe('minimizeDFASteps', () => {
  it('marks accept/non-accept pairs in the base pass and matches minimizeDFA output', () => {
    const walkthrough = minimizeDFASteps(nonMinimalDfa);

    const basePair = walkthrough.pairs.find(p => p.pairKey === 'A,C')!;
    expect(basePair.marked).toBe(true);
    expect(basePair.step).toBe('base');

    expect(walkthrough.finalDfa.nodes.length).toBe(minimizeDFA(nonMinimalDfa).nodes.length);
  });

  it('only traces pairs among reachable states', () => {
    const { pairs } = minimizeDFASteps(nonMinimalDfa);
    expect(pairs.some(p => p.id1 === 'X' || p.id2 === 'X')).toBe(false);
    // 5 reachable states -> C(5,2) = 10 pairs
    expect(pairs.length).toBe(10);
  });

  it('records iterative markings with the pass number', () => {
    // Chain a^2 a*: (S0,S1) agree on acceptance but S0 -a-> S1 and S1 -a-> S2
    // lead to the base-marked pair (S1,S2), so (S0,S1) is marked iteratively.
    const chainDfa: Automaton = {
      nodes: [
        { id: 'S0', label: 'S0', isStart: true, isAccept: false },
        { id: 'S1', label: 'S1', isStart: false, isAccept: false },
        { id: 'S2', label: 'S2', isStart: false, isAccept: true }
      ],
      edges: [
        { id: 'c1', source: 'S0', target: 'S1', symbols: ['a'] },
        { id: 'c2', source: 'S1', target: 'S2', symbols: ['a'] },
        { id: 'c3', source: 'S2', target: 'S2', symbols: ['a'] }
      ]
    };

    const { pairs, iterations } = minimizeDFASteps(chainDfa);
    const iterative = pairs.filter(p => p.step === 'iterative');
    expect(iterative.map(p => p.pairKey)).toEqual(['S0,S1']);
    expect(iterations[0].pass).toBe(1);
    expect(iterations[0].markedThisPass).toContain('S0,S1');
  });

  it('returns an empty walkthrough when there is no start state', () => {
    const result = minimizeDFASteps({ nodes: [], edges: [] });
    expect(result).toEqual({ pairs: [], iterations: [], finalDfa: { nodes: [], edges: [] } });
  });
});
