import { describe, expect, it } from 'vitest';
import { combineDFA, complementDFA } from '../fa';
import { simulateDFA } from '@autometa/simulation-engine';

const endsIn = (symbol: string) => ({
  nodes: [{ id: 's', label: 's', isStart: true, isAccept: false }, { id: 'f', label: 'f', isStart: false, isAccept: true }],
  edges: [{ id: 's0', source: 's', target: 's', symbols: [symbol === '0' ? '1' : '0'] }, { id: 'sf', source: 's', target: 'f', symbols: [symbol] }, { id: 'f0', source: 'f', target: 's', symbols: [symbol === '0' ? '1' : '0'] }, { id: 'ff', source: 'f', target: 'f', symbols: [symbol] }],
});

describe('DFA language operations', () => {
  it('builds an intersection product', () => {
    const machine = combineDFA(endsIn('0'), endsIn('1'), 'intersection');
    expect(simulateDFA(machine, '0').accepted).toBe(false);
    expect(simulateDFA(machine, '01').accepted).toBe(false);
  });

  it('complements incomplete DFAs using a sink state', () => {
    const complement = complementDFA({ nodes: [{ id: 's', label: 's', isStart: true, isAccept: true }, { id: 'u', label: 'u', isStart: false, isAccept: false }], edges: [{ id: 'zero', source: 's', target: 's', symbols: ['0'] }, { id: 'one', source: 'u', target: 'u', symbols: ['1'] }] });
    expect(simulateDFA(complement, '').accepted).toBe(false);
    expect(simulateDFA(complement, '1').accepted).toBe(true);
  });
});
