import { describe, it, expect } from 'vitest';
import { regexToDfa, stringListToDfa, brzozowskiMinimize } from '../fa';
import { classifyChomskyHierarchy } from '../csh';
import { simulateDFA } from '@autometa/simulation-engine';

describe('New Engine Conversions and Chomsky Hierarchy', () => {
  it('regexToDfa converts regular expressions directly to minimal DFA', () => {
    const dfa = regexToDfa('(a|b)*abb');
    expect(dfa.nodes.length).toBeGreaterThan(0);
    expect(simulateDFA(dfa, 'abb').accepted).toBe(true);
    expect(simulateDFA(dfa, 'ab').accepted).toBe(false);
  });

  it('stringListToDfa constructs minimal DFA for finite word set', () => {
    const dfa = stringListToDfa(['cat', 'car', 'card']);
    expect(simulateDFA(dfa, 'cat').accepted).toBe(true);
    expect(simulateDFA(dfa, 'car').accepted).toBe(true);
    expect(simulateDFA(dfa, 'card').accepted).toBe(true);
    expect(simulateDFA(dfa, 'cart').accepted).toBe(false);
  });

  it('brzozowskiMinimize produces equivalent minimal DFA', () => {
    const original = regexToDfa('a*b*');
    const minDfa = brzozowskiMinimize(original);
    expect(simulateDFA(minDfa, 'aabb').accepted).toBe(true);
    expect(simulateDFA(minDfa, 'ba').accepted).toBe(false);
  });

  it('classifyChomskyHierarchy classifies grammars across all 4 levels', () => {
    const regRes = classifyChomskyHierarchy({ S: ['a S', 'b'] });
    expect(regRes.level).toBe('Type-3 (Regular)');

    const cfgRes = classifyChomskyHierarchy({ S: ['a S b', 'ε'] });
    expect(cfgRes.level).toBe('Type-2 (Context-Free)');

    const cshRes = classifyChomskyHierarchy({ 'a S': ['a b S'], S: ['a b'] });
    expect(cshRes.level).toBe('Type-1 (Context-Sensitive)');

    const type0Res = classifyChomskyHierarchy({ 'a S b': ['a'], S: ['a b'] });
    expect(type0Res.level).toBe('Type-0 (Unrestricted)');
  });
});
