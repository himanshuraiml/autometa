import { describe, expect, it } from 'vitest';
import { deriveContextSensitive, parseUnrestrictedGrammar } from '../unrestricted';

// Same a^n b^n c^n grammar as phase4-unrestricted.test.ts — every production here
// happens to already be non-contracting (|lhs| <= |rhs| in each), so it's a
// genuine Type-1 grammar, not just Type-0.
const ANBNCN_SOURCE = `
S -> a S B c
S -> a b c
c B -> B c
b B -> b b
`;

describe('deriveContextSensitive', () => {
  it('finds a derivation for a genuine context-sensitive grammar', () => {
    const grammar = parseUnrestrictedGrammar(ANBNCN_SOURCE, 'S');
    const outcome = deriveContextSensitive(grammar, ['a', 'a', 'b', 'b', 'c', 'c'], 5000);
    expect(outcome.kind).toBe('found');
    if (outcome.kind === 'found') {
      expect(outcome.steps[outcome.steps.length - 1].after).toEqual(['a', 'a', 'b', 'b', 'c', 'c']);
    }
  });

  it('reports not-found (not invalid-grammar) for a string outside the language', () => {
    const grammar = parseUnrestrictedGrammar(ANBNCN_SOURCE, 'S');
    const outcome = deriveContextSensitive(grammar, ['a', 'a', 'b', 'b', 'b', 'c', 'c'], 5000);
    expect(outcome.kind).toBe('not-found');
  });

  it('rejects a grammar with a genuinely contracting production', () => {
    // A B -> a shrinks 2 symbols to 1 — not non-contracting.
    const grammar = parseUnrestrictedGrammar('S -> A B\nA B -> a', 'S');
    const outcome = deriveContextSensitive(grammar, ['a'], 1000);
    expect(outcome.kind).toBe('invalid-grammar');
    if (outcome.kind === 'invalid-grammar') {
      expect(outcome.reason).toContain('A B');
    }
  });

  it('allows the standard S -> ε exception when S never appears on any right-hand side', () => {
    const grammar = parseUnrestrictedGrammar('S -> A B\nA B -> a b\nS -> ε', 'S');
    const outcome = deriveContextSensitive(grammar, ['a', 'b'], 1000);
    expect(outcome.kind).not.toBe('invalid-grammar');
  });

  it('still rejects S -> ε as contracting when S appears on some right-hand side', () => {
    const grammar = parseUnrestrictedGrammar('S -> A S\nA -> a\nS -> ε', 'S');
    const outcome = deriveContextSensitive(grammar, ['a'], 1000);
    expect(outcome.kind).toBe('invalid-grammar');
  });
});
