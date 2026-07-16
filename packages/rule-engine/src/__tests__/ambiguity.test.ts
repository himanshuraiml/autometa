import { describe, expect, it } from 'vitest';
import { generateLeftmostDerivations } from '../parsing';

describe('ambiguity evidence', () => {
  it('finds two leftmost derivations for an ambiguous grammar', () => {
    const paths = generateLeftmostDerivations({ S: ['S S', 'a'] }, 'S', 'aaa', 2);
    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toEqual(paths[1]);
  });
});
