import { describe, expect, it } from 'vitest';
import { findLanguageCounterexample } from '../fa';

describe('language equivalence', () => {
  it('recognizes equivalent DFA and ε-NFA machines', () => {
    const dfa = { nodes: [{ id: 'a', label: 'a', isStart: true, isAccept: true }], edges: [{ id: 'aa', source: 'a', target: 'a', symbols: ['0'] }] };
    const nfa = { nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }, { id: 'f', label: 'f', isStart: false, isAccept: true }], edges: [{ id: 'sf', source: 's', target: 'f', symbols: ['ε'] }, { id: 'ff', source: 'f', target: 'f', symbols: ['0'] }] };
    expect(findLanguageCounterexample(dfa, nfa)).toEqual({ equivalent: true });
  });

  it('returns the shortest distinguishing string', () => {
    const acceptsZero = { nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }, { id: 'f', label: 'f', isStart: false, isAccept: true }], edges: [{ id: 'sf', source: 's', target: 'f', symbols: ['0'] }] };
    const rejectsAll = { nodes: [{ id: 'q', label: 'q', isStart: true, isAccept: false }], edges: [{ id: 'qq', source: 'q', target: 'q', symbols: ['0'] }] };
    expect(findLanguageCounterexample(acceptsZero, rejectsAll)).toEqual({ equivalent: false, counterexample: '0' });
  });
});
