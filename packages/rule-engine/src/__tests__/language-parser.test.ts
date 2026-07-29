import { describe, it, expect } from 'vitest';
import { parseLanguageToDfa } from '../language-parser';
import { simulateDFA } from '@autometa/simulation-engine';

describe('parseLanguageToDfa (Set-Builder & Natural Language to DFA)', () => {
  it('parses set-builder notation "L = { w ∈ {0,1}* | w ends with 01 }"', () => {
    const res = parseLanguageToDfa('L = { w ∈ {0,1}* | w ends with 01 }');
    expect(res.regex).toBe('(0|1)*01');
    expect(simulateDFA(res.dfa, '1001').accepted).toBe(true);
    expect(simulateDFA(res.dfa, '0101').accepted).toBe(true);
    expect(simulateDFA(res.dfa, '1010').accepted).toBe(false);
    expect(simulateDFA(res.dfa, '010').accepted).toBe(false);
  });

  it('parses natural language "Strings ending with 01 over {0,1}"', () => {
    const res = parseLanguageToDfa('Strings ending with 01 over {0,1}');
    expect(simulateDFA(res.dfa, '001').accepted).toBe(true);
    expect(simulateDFA(res.dfa, '000').accepted).toBe(false);
  });

  it('parses "starts with 10"', () => {
    const res = parseLanguageToDfa('starts with 10');
    expect(simulateDFA(res.dfa, '10110').accepted).toBe(true);
    expect(simulateDFA(res.dfa, '01011').accepted).toBe(false);
  });

  it('parses "contains 101"', () => {
    const res = parseLanguageToDfa('contains 101');
    expect(simulateDFA(res.dfa, '0010100').accepted).toBe(true);
    expect(simulateDFA(res.dfa, '00100').accepted).toBe(false);
  });

  it('parses "does not contain 11"', () => {
    const res = parseLanguageToDfa('does not contain 11');
    expect(simulateDFA(res.dfa, '101010').accepted).toBe(true);
    expect(simulateDFA(res.dfa, '101101').accepted).toBe(false);
  });

  it('parses finite word set "cat, car, card"', () => {
    const res = parseLanguageToDfa('cat, car, card');
    expect(simulateDFA(res.dfa, 'cat').accepted).toBe(true);
    expect(simulateDFA(res.dfa, 'car').accepted).toBe(true);
    expect(simulateDFA(res.dfa, 'cart').accepted).toBe(false);
  });
});
