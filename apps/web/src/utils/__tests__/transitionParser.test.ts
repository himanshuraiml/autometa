import { describe, expect, it } from 'vitest';
import { toAutomatonWithDiagnostics } from '../flowAutomaton';
import {
  parseTransitionLabel,
  parsePdaTransitionParts, formatPdaTransitionParts,
  parseTmTransitionParts, formatTmTransitionParts,
} from '../transitionParser';

describe('transition parsing', () => {
  it('keeps a complete Turing machine transition together', () => {
    expect(parseTransitionLabel('0 -> 1, R', 'TM').transitions).toEqual(['0 -> 1, R']);
  });

  it('parses multiple PDA transitions without splitting their fields', () => {
    expect(parseTransitionLabel('a, Z -> A Z, b, A -> ε', 'PDA').transitions)
      .toEqual(['a, Z -> A Z', 'b, A -> ε']);
  });

  it('continues to split DFA and Mealy alternatives', () => {
    expect(parseTransitionLabel('0, 1', 'DFA').transitions).toEqual(['0', '1']);
    expect(parseTransitionLabel('0/1, 1/0', 'Mealy').transitions).toEqual(['0/1', '1/0']);
  });

  it('returns structured diagnostics for malformed typed transitions', () => {
    const result = toAutomatonWithDiagnostics([], [{ id: 'e1', source: 'a', target: 'b', data: { label: '0 -> 1, sideways' } }], 'TM');
    expect(result.issues).toEqual([{ edgeId: 'e1', message: 'Invalid TM transition. Expected read -> write, L/R/S.' }]);
  });

  it('splits a PDA transition into its read/pop/push fields and back', () => {
    expect(parsePdaTransitionParts('a, Z -> A Z')).toEqual({ read: 'a', pop: 'Z', push: 'A Z' });
    expect(formatPdaTransitionParts({ read: 'a', pop: 'Z', push: 'A Z' })).toBe('a, Z -> A Z');
  });

  it('renders blank PDA fields as epsilon', () => {
    expect(formatPdaTransitionParts({ read: '', pop: '', push: '' })).toBe('ε, ε -> ε');
  });

  it('splits a TM transition into its read/write/direction fields and back', () => {
    expect(parseTmTransitionParts('0 -> 1, R')).toEqual({ read: '0', write: '1', direction: 'R' });
    expect(formatTmTransitionParts({ read: '0', write: '1', direction: 'R' })).toBe('0 -> 1, R');
  });

  it('renders blank TM read/write fields as epsilon', () => {
    expect(formatTmTransitionParts({ read: '', write: '', direction: 'L' })).toBe('ε -> ε, L');
  });
});
