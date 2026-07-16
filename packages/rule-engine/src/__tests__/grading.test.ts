import { describe, expect, it } from 'vitest';
import type { Automaton } from '@autometa/simulation-engine';
import { gradeSubmission, type SampleTest } from '../grading';
import { generateExercise } from '../exerciseGenerator';

const dfaAcceptsEvenAs = (): Automaton => ({
  nodes: [
    { id: 'q0', label: 'q0', isStart: true, isAccept: true },
    { id: 'q1', label: 'q1', isStart: false, isAccept: false },
  ],
  edges: [
    { id: 'e0', source: 'q0', target: 'q1', symbols: ['a'] },
    { id: 'e1', source: 'q1', target: 'q0', symbols: ['a'] },
    { id: 'e2', source: 'q0', target: 'q0', symbols: ['b'] },
    { id: 'e3', source: 'q1', target: 'q1', symbols: ['b'] },
  ],
});

const dfaAcceptsAll = (): Automaton => ({
  nodes: [{ id: 'q0', label: 'q0', isStart: true, isAccept: true }],
  edges: [
    { id: 'e0', source: 'q0', target: 'q0', symbols: ['a'] },
    { id: 'e1', source: 'q0', target: 'q0', symbols: ['b'] },
  ],
});

const sampleTests: SampleTest[] = ['', 'a', 'aa', 'aaa', 'b', 'ab', 'aab'].map(input => ({
  input,
  expectedAccept: input.split('').filter(c => c === 'a').length % 2 === 0,
}));

describe('gradeSubmission — DFA/NFA (exact equivalence)', () => {
  it('passes an equivalent submission', () => {
    const result = gradeSubmission('DFA', { automaton: dfaAcceptsEvenAs() }, { automaton: dfaAcceptsEvenAs() }, sampleTests);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it('fails a non-equivalent submission with a real counterexample', () => {
    const result = gradeSubmission('DFA', { automaton: dfaAcceptsEvenAs() }, { automaton: dfaAcceptsAll() }, sampleTests);
    expect(result.passed).toBe(false);
    expect(result.counterexample).toBeDefined();
    // the reference rejects a single "a"; the (wrong) all-accepting submission accepts it
    expect(result.expected).toBe('reject');
    expect(result.actual).toBe('accept');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThan(1);
  });

  it('reports missing automatons instead of throwing', () => {
    expect(gradeSubmission('DFA', {}, { automaton: dfaAcceptsAll() }, []).passed).toBe(false);
    expect(gradeSubmission('DFA', { automaton: dfaAcceptsAll() }, {}, []).passed).toBe(false);
  });
});

describe('gradeSubmission — Regex (compiled to NFA, then exact equivalence)', () => {
  it('passes an equivalent regex written differently', () => {
    const result = gradeSubmission('Regex', { regex: '(a|b)*ab' }, { regex: '(a|b)*a(b|b)' }, []);
    expect(result.passed).toBe(true);
  });

  it('fails a regex matching a different language', () => {
    const result = gradeSubmission('Regex', { regex: '(a|b)*ab' }, { regex: '(a|b)*ba' }, []);
    expect(result.passed).toBe(false);
    expect(result.counterexample).toBeDefined();
  });

  it('reports a parse error without throwing', () => {
    const result = gradeSubmission('Regex', { regex: '(a|b)*ab' }, { regex: '(a|b' }, []);
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/could not parse/i);
  });
});

describe('gradeSubmission — CFG (CYK over the sample-test battery)', () => {
  const anbn = { S: ['a b', 'a S b'] };
  const wrongGrammar = { S: ['a b', 'a S'] }; // drops the trailing b's requirement

  it('passes an equivalent grammar with different non-terminal naming', () => {
    const equivalent = { T: ['a b', 'a T b'] };
    const tests: SampleTest[] = [
      { input: 'ab', expectedAccept: true },
      { input: 'aabb', expectedAccept: true },
      { input: 'aaabbb', expectedAccept: true },
      { input: 'aab', expectedAccept: false },
      { input: 'abb', expectedAccept: false },
      { input: 'ba', expectedAccept: false },
    ];
    const result = gradeSubmission('CFG', { rules: anbn, startSymbol: 'S' }, { rules: equivalent, startSymbol: 'T' }, tests);
    expect(result.passed).toBe(true);
  });

  it('fails a grammar that generates the wrong language', () => {
    const tests: SampleTest[] = [
      { input: 'ab', expectedAccept: true },
      { input: 'aabb', expectedAccept: true },
      { input: 'aab', expectedAccept: false },
    ];
    const result = gradeSubmission('CFG', { rules: anbn, startSymbol: 'S' }, { rules: wrongGrammar, startSymbol: 'S' }, tests);
    expect(result.passed).toBe(false);
    expect(result.counterexample).toBeDefined();
  });
});

describe('gradeSubmission — PDA/TM (battery comparison)', () => {
  it('grades a generated PDA exercise: identical automaton passes, empty automaton fails', () => {
    const exercise = generateExercise('PDA', 'beginner', 'stack-based recognition', 1);
    const passing = gradeSubmission('PDA', {}, { automaton: exercise.automaton }, exercise.sampleTests);
    expect(passing.passed).toBe(true);
    expect(passing.score).toBe(1);

    const empty: Automaton = { nodes: [{ id: 'q0', label: 'q0', isStart: true, isAccept: false }], edges: [] };
    const failing = gradeSubmission('PDA', {}, { automaton: empty }, exercise.sampleTests);
    expect(failing.passed).toBe(false);
    expect(failing.counterexample).toBeDefined();
  });

  it('grades a generated TM exercise: identical automaton passes, wrong-parity automaton fails', () => {
    const exercise = generateExercise('TM', 'beginner', undefined, 2); // k=2, even length
    const passing = gradeSubmission('TM', {}, { automaton: exercise.automaton }, exercise.sampleTests);
    expect(passing.passed).toBe(true);

    const oddLengthTm = generateExercise('TM', 'intermediate', undefined, 2).automaton!; // k=3, wrong parity
    const failing = gradeSubmission('TM', {}, { automaton: oddLengthTm }, exercise.sampleTests);
    expect(failing.passed).toBe(false);
  });
});
