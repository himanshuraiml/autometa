import { describe, expect, it } from 'vitest';
import { nfaToRegularGrammar, regularGrammarToNfa } from '../grammar-fa';
import { simulateDFA, simulateNFA } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';
import { cykParse } from '../cfg';

// Accepts binary strings ending in "1"
const endsInOne: Automaton = {
  nodes: [{ id: 'q0', label: 'q0', isStart: true, isAccept: false }, { id: 'q1', label: 'q1', isStart: false, isAccept: true }],
  edges: [
    { id: 'e1', source: 'q0', target: 'q0', symbols: ['0'] },
    { id: 'e2', source: 'q0', target: 'q1', symbols: ['1'] },
    { id: 'e3', source: 'q1', target: 'q0', symbols: ['0'] },
    { id: 'e4', source: 'q1', target: 'q1', symbols: ['1'] },
  ],
};

describe('nfaToRegularGrammar', () => {
  it('produces a right-linear grammar accepting the same language (checked via CYK)', () => {
    const grammar = nfaToRegularGrammar(endsInOne);
    const startSymbol = Object.keys(grammar)[0];
    // cykParse doesn't handle the empty string, so only non-empty words are compared here.
    ['1', '01', '10', '111', '0'].forEach(word => {
      expect(cykParse(grammar, startSymbol, word)).toBe(simulateDFA(endsInOne, word).accepted);
    });
  });

  it('gives ε-transitions as unit productions', () => {
    const withEpsilon: Automaton = {
      nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }, { id: 'f', label: 'f', isStart: false, isAccept: true }],
      edges: [{ id: 'e', source: 's', target: 'f', symbols: ['ε'] }],
    };
    const grammar = nfaToRegularGrammar(withEpsilon);
    const [startSymbol, targetSymbol] = Object.keys(grammar);
    expect(grammar[startSymbol]).toContain(targetSymbol);
  });
});

describe('regularGrammarToNfa', () => {
  it('round-trips through nfaToRegularGrammar to an equivalent machine', () => {
    const grammar = nfaToRegularGrammar(endsInOne);
    const startSymbol = Object.keys(grammar)[0];
    const rebuilt = regularGrammarToNfa(grammar, startSymbol);
    ['1', '01', '10', '111', '0', '000'].forEach(word => {
      expect(simulateNFA(rebuilt, word).accepted).toBe(simulateDFA(endsInOne, word).accepted);
    });
  });

  it('builds a machine directly from a hand-written right-linear grammar', () => {
    // S -> a A | a, A -> b S | ε  (accepts strings of a's and b's alternating, starting and ending with a)
    const machine = regularGrammarToNfa({ S: ['a A', 'a'], A: ['b S', 'ε'] }, 'S');
    expect(simulateNFA(machine, 'a').accepted).toBe(true);
    expect(simulateNFA(machine, 'ab').accepted).toBe(false);
    expect(simulateNFA(machine, 'aba').accepted).toBe(true);
  });

  it('rejects a grammar that is not right-linear', () => {
    // Left-linear shape (nonterminal before the terminal) is not right-linear.
    expect(() => regularGrammarToNfa({ S: ['A a'], A: ['a'] }, 'S')).toThrow(/right-linear/i);
  });
});
