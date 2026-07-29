import { describe, it, expect } from 'vitest';
import { pdaToCFG } from '../pda-cfg';
import type { Automaton } from '@autometa/simulation-engine';

describe('pdaToCFG conversion', () => {
  it('converts a simple single-state PDA into CFG rules', () => {
    const pda: Automaton = {
      nodes: [{ id: 'q0', label: 'q0', isStart: true, isAccept: true }],
      edges: [
        { id: 'e1', source: 'q0', target: 'q0', symbols: ['a, Z -> A Z'] },
        { id: 'e2', source: 'q0', target: 'q0', symbols: ['b, A -> ε'] }
      ]
    };

    const rules = pdaToCFG(pda, 'Z');
    expect(rules['S']).toBeDefined();
    expect(rules['S']).toContain('[q0,Z,q0]');
    expect(rules['[q0,A,q0]']).toContain('b');
  });
});
