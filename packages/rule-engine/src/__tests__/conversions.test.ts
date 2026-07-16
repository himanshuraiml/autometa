import { describe, expect, it } from 'vitest';
import { dfaToRegex } from '../fa';
import { cfgToPDA } from '../cfg';

describe('additional conversions', () => {
  it('converts a DFA to a non-empty regular expression', () => {
    const regex = dfaToRegex({ nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }, { id: 'f', label: 'f', isStart: false, isAccept: true }], edges: [{ id: 'sf', source: 's', target: 'f', symbols: ['a'] }, { id: 'ff', source: 'f', target: 'f', symbols: ['a'] }] });
    expect(regex).toContain('a');
  });

  it('converts a CFG to the standard expand-and-match PDA shape', () => {
    const pda = cfgToPDA({ S: ['a S b', 'ε'] }, 'S');
    expect(pda.nodes).toHaveLength(3);
    expect(pda.edges.map(edge => edge.symbols[0])).toContain('ε, S -> a S b');
  });
});
