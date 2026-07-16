import { describe, expect, it } from 'vitest';
import { deriveUnrestricted, parseUnrestrictedGrammar, formatSententialForm } from '../unrestricted';

// Classic non-context-free grammar for { a^n b^n c^n : n >= 1 } — needs genuine
// Type-0 rewriting (cB -> Bc, bB -> bb) that no CFG can express.
const ANBNCN_SOURCE = `
S -> a S B c
S -> a b c
c B -> B c
b B -> b b
`;

describe('unrestricted (Type-0) grammars', () => {
  it('parses productions and infers terminals/nonterminals by case', () => {
    const grammar = parseUnrestrictedGrammar(ANBNCN_SOURCE, 'S');
    expect(grammar.productions).toHaveLength(4);
    expect(grammar.nonterminals).toEqual(['B', 'S']);
    expect(grammar.terminals).toEqual(['a', 'b', 'c']);
  });

  it('rejects a production missing "->"', () => {
    expect(() => parseUnrestrictedGrammar('S a', 'S')).toThrow();
  });

  it('rejects a production with no nonterminal on the left', () => {
    expect(() => parseUnrestrictedGrammar('a -> b', 'S')).toThrow();
  });

  it('finds a derivation for aabbcc within the a^n b^n c^n language', () => {
    const grammar = parseUnrestrictedGrammar(ANBNCN_SOURCE, 'S');
    const result = deriveUnrestricted(grammar, ['a', 'a', 'b', 'b', 'c', 'c'], 5000);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps[result.steps.length - 1].after).toEqual(['a', 'a', 'b', 'b', 'c', 'c']);
      // Every intermediate step actually applied its claimed production at its claimed position.
      for (const step of result.steps) {
        expect(step.before.slice(step.position, step.position + step.production.lhs.length)).toEqual(step.production.lhs);
      }
    }
  });

  it('reports "not found within bound" (not a false rejection) for a string outside the language', () => {
    const grammar = parseUnrestrictedGrammar(ANBNCN_SOURCE, 'S');
    const result = deriveUnrestricted(grammar, ['a', 'a', 'b', 'b', 'b', 'c', 'c'], 5000);
    expect(result.found).toBe(false);
    if (!result.found) expect(result.exploredCount).toBeGreaterThan(0);
  });

  it('formats sentential forms, rendering the empty form as epsilon', () => {
    expect(formatSententialForm(['a', 'S', 'c'])).toBe('a S c');
    expect(formatSententialForm([])).toBe('ε');
  });
});
