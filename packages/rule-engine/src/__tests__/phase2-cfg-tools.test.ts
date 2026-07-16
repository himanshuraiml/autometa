import { describe, expect, it } from 'vitest';
import {
  cfgToCNF, cfgToCNFSteps, cfgToGNF, cfgToGNFSteps, cfgToPDA, cfgToPDASteps,
  eliminateLeftRecursion, eliminateLeftRecursionSteps, leftFactorGrammar, leftFactorGrammarSteps,
  removeEpsilonProductions, removeUnitProductions, removeUselessSymbols, classifyGrammar,
  cykParse, cykParseTable,
} from '../cfg';
import type { CFGRules } from '../cfg';

const startsWithTerminal = (production: string) => {
  const first = production.trim().split(/\s+/)[0];
  return /^[a-z0-9]/.test(first);
};

describe('cfgToGNF (fixed-point substitution)', () => {
  it('produces only terminal-leading productions for a grammar requiring multi-level substitution', () => {
    // S -> A B, A -> C D, C -> E F, E -> a, F -> b, D -> c, B -> d
    // Old one-shot substitution left S's production starting with a nonterminal (C).
    const grammar: CFGRules = { S: ['A B'], A: ['C D'], C: ['E F'], E: ['a'], F: ['b'], D: ['c'], B: ['d'] };
    const gnf = cfgToGNF(grammar);
    Object.values(gnf).flat().forEach(prod => expect(startsWithTerminal(prod)).toBe(true));
  });

  it('preserves the language (cross-checked via CYK on both forms)', () => {
    const grammar: CFGRules = { S: ['A B'], A: ['C D'], C: ['E F'], E: ['a'], F: ['b'], D: ['c'], B: ['d'] };
    const gnf = cfgToGNF(grammar);
    ['afbcd'.slice(0, 0), 'abcd', 'a', 'abc', 'abcde'].forEach(word => {
      expect(cykParse(gnf, 'S', word)).toBe(cykParse(grammar, 'S', word));
    });
  });

  it('throws a clear error instead of looping forever on a cyclic CNF dependency', () => {
    // A -> A B (direct left recursion surviving into CNF) cannot be resolved by pure substitution.
    const grammar: CFGRules = { A: ['A B', 'a'], B: ['b'] };
    expect(() => cfgToGNF(grammar)).toThrow(/cyclic/i);
  });

  it('cfgToGNFSteps traces one step per nonterminal and matches cfgToGNF on the final result', () => {
    const grammar: CFGRules = { S: ['a S', 'b'] };
    const { steps, result } = cfgToGNFSteps(grammar);
    expect(result).toEqual(cfgToGNF(grammar));
    expect(steps.length).toBeGreaterThan(1);
  });
});

describe('cfgToCNFSteps', () => {
  it('matches cfgToCNF on the final result and traces every stage', () => {
    const grammar: CFGRules = { S: ['a S b', 'ε'] };
    const { steps, result } = cfgToCNFSteps(grammar);
    expect(result).toEqual(cfgToCNF(grammar));
    expect(steps.map(step => step.description)).toEqual([
      'Original grammar',
      'Remove ε-productions',
      'Remove unit productions (A → B)',
      'Isolate terminals in mixed/long productions',
      'Binarize productions with more than two symbols',
    ]);
  });
});

describe('cfgToPDASteps', () => {
  it('matches cfgToPDA on the final automaton', () => {
    const grammar: CFGRules = { S: ['a S b', 'ε'] };
    const { steps, result } = cfgToPDASteps(grammar, 'S');
    expect(result).toEqual(cfgToPDA(grammar, 'S'));
    expect(steps.length).toBeGreaterThan(1);
    expect(steps[0].automaton.nodes).toHaveLength(3);
  });
});

describe('eliminateLeftRecursionSteps / leftFactorGrammarSteps', () => {
  it('matches the plain-result functions', () => {
    const leftRecursive: CFGRules = { E: ['E + T', 'T'] };
    expect(eliminateLeftRecursionSteps(leftRecursive).result).toEqual(eliminateLeftRecursion(leftRecursive));

    const factorable: CFGRules = { S: ['a A', 'a B', 'b'] };
    expect(leftFactorGrammarSteps(factorable).result).toEqual(leftFactorGrammar(factorable));
  });

  it('records one step per nonterminal processed for left recursion', () => {
    const { steps } = eliminateLeftRecursionSteps({ E: ['E + T', 'T'], T: ['a'] });
    expect(steps.length).toBe(3); // original + E + T
  });
});

describe('removeEpsilonProductions / removeUnitProductions', () => {
  it('removeEpsilonProductions generates the with/without-nullable-symbol combinations and drops ε itself', () => {
    // A is nullable, so "A B" expands to both "A B" (A present) and "B" (A dropped) — the
    // standard ε-removal combinatorics, not terminal substitution (that's a separate step).
    const result = removeEpsilonProductions({ S: ['A B'], A: ['a', 'ε'], B: ['b'] });
    expect(result.S.sort()).toEqual(['A B', 'B']);
    expect(result.A).toEqual(['a']);
  });

  it('removeUnitProductions inlines the target nonterminal\'s productions', () => {
    const result = removeUnitProductions({ S: ['A'], A: ['a', 'b'] });
    expect(result.S.sort()).toEqual(['a', 'b']);
  });
});

describe('removeUselessSymbols', () => {
  it('drops non-generating and unreachable nonterminals', () => {
    // A/B can never generate a terminal string (they only refer to each other); C is
    // generating (C -> c) but unreachable, since S never refers to it.
    const grammar: CFGRules = { S: ['a'], A: ['B'], B: ['A'], C: ['c'] };
    const result = removeUselessSymbols(grammar, 'S');
    expect(result.A).toBeUndefined();
    expect(result.B).toBeUndefined();
    expect(result.C).toBeUndefined();
    expect(result.S).toEqual(['a']);
  });
});

describe('classifyGrammar', () => {
  it('recognizes right-linear grammars', () => {
    expect(classifyGrammar({ S: ['a S', 'b'] })).toBe('right-linear');
  });

  it('recognizes left-linear grammars', () => {
    expect(classifyGrammar({ S: ['S a', 'b'] })).toBe('left-linear');
  });

  it('falls back to context-free when a production has nonterminals on both sides', () => {
    expect(classifyGrammar({ S: ['A a A'], A: ['a'] })).toBe('context-free');
  });
});

describe('cykParseTable', () => {
  it('agrees with cykParse and exposes the full DP table', () => {
    const grammar: CFGRules = { S: ['a S b', 'ε'] };
    const { accepted, table } = cykParseTable(grammar, 'S', 'aabb');
    expect(accepted).toBe(cykParse(grammar, 'S', 'aabb'));
    expect(table.length).toBe(4); // one row per substring length 1..4
    expect(table[3][0].nonTerminals).toContain('S'); // full-string cell contains S when accepted
  });

  it('returns an empty table for the empty word', () => {
    expect(cykParseTable({ S: ['a'] }, 'S', '')).toEqual({ accepted: false, table: [] });
  });
});
