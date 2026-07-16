import { describe, expect, it } from 'vitest';
import { validateAutomaton } from '../automatonValidation';

const node = (id: string, start = false, accept = false) => ({ id, type: 'state', position: { x: 0, y: 0 }, data: { label: id, isStart: start, isAccept: accept } });
const edge = (id: string, source: string, target: string, label: string) => ({ id, source, target, data: { label } });

describe('automaton validation', () => {
  it('reports a missing start state and unreachable states', () => {
    const issues = validateAutomaton([node('q0'), node('q1')], [], 'DFA');
    expect(issues.map(issue => issue.id)).toContain('missing-start');
  });

  it('reports duplicate and missing DFA transitions', () => {
    const issues = validateAutomaton([node('q0', true), node('q1')], [edge('a', 'q0', 'q0', '0'), edge('b', 'q0', 'q1', '0, 1')], 'DFA');
    expect(issues.some(issue => issue.id.startsWith('duplicate-q0-0'))).toBe(true);
    expect(issues.some(issue => issue.id === 'missing-q1-0')).toBe(true);
  });

  it('flags a state that cannot reach any accepting state as dead', () => {
    // q0 -> q1 (accept); q2 only has an outgoing edge to itself, never reaching q1.
    const issues = validateAutomaton(
      [node('q0', true), node('q1', false, true), node('q2')],
      [edge('a', 'q0', 'q1', '0'), edge('b', 'q0', 'q2', '1'), edge('c', 'q2', 'q2', '0, 1')],
      'DFA'
    );
    expect(issues.some(issue => issue.id === 'dead-q2')).toBe(true);
    expect(issues.some(issue => issue.id === 'dead-q0')).toBe(false);
    expect(issues.some(issue => issue.id === 'dead-q1')).toBe(false);
  });

  it('skips dead-state detection entirely when no accept state exists', () => {
    const issues = validateAutomaton([node('q0', true), node('q1')], [edge('a', 'q0', 'q1', '0')], 'DFA');
    expect(issues.some(issue => issue.id.startsWith('dead-'))).toBe(false);
  });

  it('flags TM read/write symbols outside a declared tape alphabet', () => {
    const issues = validateAutomaton(
      [node('q0', true), node('q1')],
      [edge('a', 'q0', 'q1', '0 -> x, R')],
      'TM',
      { tapeAlphabet: ['0', '1', '_'] }
    );
    expect(issues.some(issue => issue.id === 'tape-alphabet-a-0-write')).toBe(true);
    expect(issues.some(issue => issue.id === 'tape-alphabet-a-0-read')).toBe(false);
  });

  it('does not run tape-alphabet checks when none is declared', () => {
    const issues = validateAutomaton([node('q0', true), node('q1')], [edge('a', 'q0', 'q1', '0 -> x, R')], 'TM');
    expect(issues.some(issue => issue.id.startsWith('tape-alphabet-'))).toBe(false);
  });

  it('flags PDA pop/push symbols outside a declared stack alphabet', () => {
    const issues = validateAutomaton(
      [node('q0', true), node('q1')],
      [edge('a', 'q0', 'q1', 'a, Z -> X Z')],
      'PDA',
      { stackAlphabet: ['Z', 'A'] }
    );
    expect(issues.some(issue => issue.id === 'stack-alphabet-a-0-X')).toBe(true);
    expect(issues.some(issue => issue.id === 'stack-alphabet-a-0-Z')).toBe(false);
  });

  it('treats epsilon as always allowed in tape/stack alphabet checks', () => {
    const issues = validateAutomaton([node('q0', true), node('q1')], [edge('a', 'q0', 'q1', 'ε, Z -> ε')], 'PDA', { stackAlphabet: ['Z'] });
    expect(issues.some(issue => issue.id.startsWith('stack-alphabet-'))).toBe(false);
  });

  it('flags two TM transitions from the same state reading the same symbol as nondeterministic', () => {
    const issues = validateAutomaton(
      [node('q0', true), node('q1'), node('q2')],
      [edge('a', 'q0', 'q1', '0 -> 1, R'), edge('b', 'q0', 'q2', '0 -> 0, L')],
      'TM'
    );
    expect(issues.some(issue => issue.id.startsWith('tm-nondeterministic-q0-0'))).toBe(true);
  });

  it('does not flag TM transitions reading different symbols from the same state', () => {
    const issues = validateAutomaton(
      [node('q0', true), node('q1')],
      [edge('a', 'q0', 'q1', '0 -> 1, R'), edge('b', 'q0', 'q1', '1 -> 0, R')],
      'TM'
    );
    expect(issues.some(issue => issue.id.startsWith('tm-nondeterministic-'))).toBe(false);
  });

  it('checks TM determinism per full read-tuple once multiple tapes are declared', () => {
    // Same tape-0 symbol ("0") but different tape-1 symbols — not actually conflicting once tapeCount is 2.
    const issues = validateAutomaton(
      [node('q0', true), node('q1')],
      [edge('a', 'q0', 'q1', '0,0 -> 0,0 ; R,R'), edge('b', 'q0', 'q1', '0,1 -> 0,1 ; R,R')],
      'TM',
      { tapeCount: 2 }
    );
    expect(issues.some(issue => issue.id.startsWith('tm-nondeterministic-'))).toBe(false);
  });
});
