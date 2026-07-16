import { describe, expect, it } from 'vitest';
import { eliminateLeftRecursion, leftFactorGrammar } from '../cfg';

describe('grammar rewrites', () => {
  it('eliminates direct left recursion', () => {
    const result = eliminateLeftRecursion({ E: ['E + T', 'T'] });
    expect(result.E).toEqual(['T E\'']);
    expect(result["E'"]).toEqual(['+ T E\'', 'ε']);
  });
  it('left-factors shared prefixes', () => {
    const result = leftFactorGrammar({ S: ['a A', 'a B', 'b'] });
    expect(result.S).toContain('a S_F');
    expect(result.S_F).toEqual(['A', 'B']);
  });
});
