import { describe, expect, it } from 'vitest';
import { computeFirstAndFollow, generateLL1Table, findDerivationTrees, findAmbiguousStringInLanguage, generateLeftmostParseTree } from '../parsing';

describe('computeFirstAndFollow nullable set', () => {
  it('reports nullable nonterminals explicitly', () => {
    const { nullable } = computeFirstAndFollow({ S: ['a A'], A: ['b', 'ε'] }, 'S');
    expect(nullable.has('A')).toBe(true);
    expect(nullable.has('S')).toBe(false);
  });
});

describe('generateLL1Table conflicts', () => {
  it('reports no conflicts for an unambiguous grammar', () => {
    const { table, conflicts } = generateLL1Table({ S: ['a A'], A: ['b', 'ε'] }, 'S');
    expect(conflicts).toEqual([]);
    expect(table['S']['a']).toEqual(['a A']);
  });

  it('collects every colliding production per cell instead of overwriting', () => {
    const { table, conflicts } = generateLL1Table({ S: ['A', 'B'], A: ['a'], B: ['a'] }, 'S');
    expect(table['S']['a']).toEqual(['A', 'B']);
    expect(conflicts).toHaveLength(1);
  });

  it('suggests eliminating left recursion when a colliding production directly left-recurses', () => {
    const { conflicts } = generateLL1Table({ S: ['S a', 'a'] }, 'S');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatch(/eliminate left recursion/i);
  });

  it('suggests left-factoring when colliding productions share a common prefix', () => {
    const { conflicts } = generateLL1Table({ S: ['a A', 'a B'], A: ['x'], B: ['y'] }, 'S');
    expect(conflicts.some(c => /left-factor/i.test(c))).toBe(true);
  });
});

describe('findDerivationTrees', () => {
  it('agrees with generateLeftmostParseTree at limit 1', () => {
    const grammar = { S: ['a S b', 'ε'] };
    const [first] = findDerivationTrees(grammar, 'S', 'aabb', 1);
    expect(first).toEqual(generateLeftmostParseTree(grammar, 'S', 'aabb'));
  });

  it('finds two distinct derivation trees for an ambiguous grammar', () => {
    const results = findDerivationTrees({ S: ['S S', 'a'] }, 'S', 'aaa', 2);
    expect(results).toHaveLength(2);
    expect(results[0].path).not.toEqual(results[1].path);
    expect(results[0].tree).not.toEqual(results[1].tree);
  });
});

describe('findAmbiguousStringInLanguage', () => {
  it('finds "aaa" as the shortest ambiguous string for the classic S -> SS | a grammar', () => {
    const result = findAmbiguousStringInLanguage({ S: ['S S', 'a'] }, 'S');
    expect(result).not.toBeNull();
    expect(result?.input).toBe('aaa');
    expect(result?.derivations).toHaveLength(2);
  });

  it('returns null for an unambiguous grammar', () => {
    const result = findAmbiguousStringInLanguage({ S: ['a S b', 'ε'] }, 'S');
    expect(result).toBeNull();
  });

  it('returns null when the grammar has no terminals to sweep', () => {
    expect(findAmbiguousStringInLanguage({ S: ['ε'] }, 'S')).toBeNull();
  });
});
