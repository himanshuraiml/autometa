import { describe, it, expect } from 'vitest';
import * as live from '../index';
import * as vendored from '../../../../docs/classroom-template/grading/simulation-engine.generated.mjs';
import type { Automaton } from '../index';

/**
 * The Classroom grading template vendors a standalone build of this
 * package's source (see docs/classroom-template/README.md) because a
 * student's CI can't `npm install` this private, unpublished package. This
 * test fails the moment someone edits simulation semantics here without
 * regenerating that vendored copy (`bun run build:grading-template`),
 * turning silent drift into a merge blocker.
 */
describe('grading template stays in sync with the live simulation engine', () => {
  it('exports the same simulator functions', () => {
    for (const name of ['simulateDFA', 'simulateNFA', 'simulatePDA', 'simulateTuringMachine', 'migrateAutomatonSchema']) {
      expect(typeof (vendored as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('matches on a DFA (odd number of b\'s)', () => {
    const dfa: Automaton = {
      nodes: [
        { id: 'q0', label: 'q0', isStart: true, isAccept: false },
        { id: 'q1', label: 'q1', isStart: false, isAccept: true },
      ],
      edges: [
        { id: 'e0', source: 'q0', target: 'q1', symbols: ['b'] },
        { id: 'e1', source: 'q1', target: 'q0', symbols: ['b'] },
        { id: 'e2', source: 'q0', target: 'q0', symbols: ['a'] },
        { id: 'e3', source: 'q1', target: 'q1', symbols: ['a'] },
      ],
    };
    for (const input of ['ab', 'abb', '']) {
      expect(vendored.simulateDFA(dfa, input)).toEqual(live.simulateDFA(dfa, input));
    }
  });

  it('matches on an NFA with an epsilon transition', () => {
    const nfa: Automaton = {
      nodes: [
        { id: 'q0', label: 'q0', isStart: true, isAccept: false },
        { id: 'q1', label: 'q1', isStart: false, isAccept: false },
        { id: 'q2', label: 'q2', isStart: false, isAccept: true },
      ],
      edges: [
        { id: 'e0', source: 'q0', target: 'q1', symbols: ['ε'] },
        { id: 'e1', source: 'q1', target: 'q2', symbols: ['a'] },
        { id: 'e2', source: 'q0', target: 'q0', symbols: ['b'] },
      ],
    };
    for (const input of ['a', 'b', 'ba']) {
      expect(vendored.simulateNFA(nfa, input)).toEqual(live.simulateNFA(nfa, input));
    }
  });

  it('matches on a PDA (a^n b^n)', () => {
    const pda: Automaton = {
      nodes: [
        { id: 'p0', label: 'p0', isStart: true, isAccept: false },
        { id: 'p1', label: 'p1', isStart: false, isAccept: false },
        { id: 'p2', label: 'p2', isStart: false, isAccept: true },
      ],
      edges: [
        { id: 'e1', source: 'p0', target: 'p0', symbols: ['a, Z -> A Z'] },
        { id: 'e2', source: 'p0', target: 'p0', symbols: ['a, A -> A A'] },
        { id: 'e3', source: 'p0', target: 'p1', symbols: ['b, A -> ε'] },
        { id: 'e4', source: 'p1', target: 'p1', symbols: ['b, A -> ε'] },
        { id: 'e5', source: 'p1', target: 'p2', symbols: ['ε, Z -> Z'] },
      ],
    };
    for (const input of ['aabb', 'aab']) {
      expect(vendored.simulatePDA(pda, input)).toEqual(live.simulatePDA(pda, input));
    }
  });

  it('matches on a Turing machine (binary increment)', () => {
    const tm: Automaton = {
      nodes: [
        { id: 't0', label: 't0', isStart: true, isAccept: false },
        { id: 't1', label: 't1', isStart: false, isAccept: false },
        { id: 't2', label: 't2', isStart: false, isAccept: false },
        { id: 't3', label: 't3', isStart: false, isAccept: true },
      ],
      edges: [
        { id: 'e0', source: 't0', target: 't0', symbols: ['0 -> 0, R', '1 -> 1, R'] },
        { id: 'e1', source: 't0', target: 't1', symbols: ['_ -> _, L'] },
        { id: 'e2', source: 't1', target: 't2', symbols: ['0 -> 1, L'] },
        { id: 'e3', source: 't1', target: 't2', symbols: ['_ -> 1, L'] },
        { id: 'e4', source: 't1', target: 't1', symbols: ['1 -> 0, L'] },
        { id: 'e5', source: 't2', target: 't3', symbols: ['0 -> 0, R', '1 -> 1, R', '_ -> _, R'] },
      ],
    };
    for (const input of ['1011', '111']) {
      expect(vendored.simulateTuringMachine(tm, input)).toEqual(live.simulateTuringMachine(tm, input));
    }
  });

  it('matches migrateAutomatonSchema round-tripping', () => {
    const raw = { nodes: [{ id: 'q0', label: 'q0', isStart: true, isAccept: true }], edges: [] };
    expect(vendored.migrateAutomatonSchema(raw)).toEqual(live.migrateAutomatonSchema(raw));
  });
});
