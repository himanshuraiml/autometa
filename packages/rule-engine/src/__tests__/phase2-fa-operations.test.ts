import { describe, expect, it } from 'vitest';
import { combineDFA, combineDFASteps, dfaToRegex, dfaToRegexSteps, concatenateNFA, starNFA, reverseNFA } from '../fa';
import { simulateNFA } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';

const endsIn = (symbol: string): Automaton => ({
  nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }, { id: 'f', label: 'f', isStart: false, isAccept: true }],
  edges: [{ id: 's0', source: 's', target: 's', symbols: [symbol === '0' ? '1' : '0'] }, { id: 'sf', source: 's', target: 'f', symbols: [symbol] }, { id: 'f0', source: 'f', target: 's', symbols: [symbol === '0' ? '1' : '0'] }, { id: 'ff', source: 'f', target: 'f', symbols: [symbol] }],
});

// Accepts exactly "a"
const singleA: Automaton = {
  nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }, { id: 'f', label: 'f', isStart: false, isAccept: true }],
  edges: [{ id: 'sf', source: 's', target: 'f', symbols: ['a'] }],
};

// Accepts exactly "b"
const singleB: Automaton = {
  nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }, { id: 'f', label: 'f', isStart: false, isAccept: true }],
  edges: [{ id: 'sf', source: 's', target: 'f', symbols: ['b'] }],
};

describe('combineDFASteps', () => {
  it('produces one row per reachable product state and a final DFA matching combineDFA', () => {
    const walkthrough = combineDFASteps(endsIn('0'), endsIn('1'), 'intersection');
    const plain = combineDFA(endsIn('0'), endsIn('1'), 'intersection');
    expect(walkthrough.finalDfa).toEqual(plain);
    expect(walkthrough.rows.length).toBe(plain.nodes.length);
    expect(walkthrough.rows[0].leftLabel).toBe('s');
    expect(walkthrough.rows[0].rightLabel).toBe('s');
  });

  it('records every alphabet symbol as a transition on each row', () => {
    const { rows, alphabet } = combineDFASteps(endsIn('0'), endsIn('1'), 'union');
    expect(alphabet).toEqual(['0', '1']);
    rows.forEach(row => expect(Object.keys(row.transitions).sort()).toEqual(['0', '1']));
  });
});

describe('dfaToRegexSteps', () => {
  it('eliminates one state per step and matches dfaToRegex on the final result', () => {
    const dfa: Automaton = { nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }, { id: 'f', label: 'f', isStart: false, isAccept: true }], edges: [{ id: 'sf', source: 's', target: 'f', symbols: ['a'] }, { id: 'ff', source: 'f', target: 'f', symbols: ['a'] }] };
    const { steps, result } = dfaToRegexSteps(dfa);
    expect(result).toBe(dfaToRegex(dfa));
    expect(steps.length).toBe(dfa.nodes.length);
    expect(steps[0].removedState).toBeDefined();
  });

  it('returns no steps and ∅ when there are no accept states', () => {
    const dfa: Automaton = { nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }], edges: [] };
    expect(dfaToRegexSteps(dfa)).toEqual({ steps: [], result: '∅' });
  });
});

describe('concatenateNFA', () => {
  it('accepts only left-language followed by right-language', () => {
    const machine = concatenateNFA(singleA, singleB);
    expect(simulateNFA(machine, 'ab').accepted).toBe(true);
    expect(simulateNFA(machine, 'a').accepted).toBe(false);
    expect(simulateNFA(machine, 'b').accepted).toBe(false);
    expect(simulateNFA(machine, 'ba').accepted).toBe(false);
  });
});

describe('starNFA', () => {
  it('accepts the empty string and any number of repeats', () => {
    const machine = starNFA(singleA);
    expect(simulateNFA(machine, '').accepted).toBe(true);
    expect(simulateNFA(machine, 'a').accepted).toBe(true);
    expect(simulateNFA(machine, 'aaa').accepted).toBe(true);
    expect(simulateNFA(machine, 'aab').accepted).toBe(false);
  });
});

describe('reverseNFA', () => {
  it('accepts the reversal of every string in the original language', () => {
    // Accepts "ab" only
    const ab: Automaton = {
      nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }, { id: 'm', label: 'm', isStart: false, isAccept: false }, { id: 'f', label: 'f', isStart: false, isAccept: true }],
      edges: [{ id: 'sm', source: 's', target: 'm', symbols: ['a'] }, { id: 'mf', source: 'm', target: 'f', symbols: ['b'] }],
    };
    const reversed = reverseNFA(ab);
    expect(simulateNFA(reversed, 'ba').accepted).toBe(true);
    expect(simulateNFA(reversed, 'ab').accepted).toBe(false);
  });
});
