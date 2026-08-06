import { describe, expect, it } from 'vitest';
import { validateAssignmentSubmission } from '../assignmentValidation';
import type { Automaton } from '@autometa/simulation-engine';
import type { TaskFrontmatter } from '@autometa/github-service';

const frontmatter: TaskFrontmatter = {
  id: 'task-1',
  title: 'Odd number of b',
  course: 'CS301',
  type: 'DFA',
  max_states: 2,
  allowed_alphabet: ['a', 'b'],
  test_cases: [{ input: 'b', expected: true }],
};

const automaton = (nodeIds: string[], edgeSymbols: string[][]): Automaton => ({
  nodes: nodeIds.map((id) => ({ id, label: id, isStart: id === nodeIds[0], isAccept: false })),
  edges: edgeSymbols.map((symbols, i) => ({ id: `e${i}`, source: nodeIds[0], target: nodeIds[0], symbols })),
});

describe('validateAssignmentSubmission', () => {
  it('reports no issues for a submission within constraints', () => {
    const issues = validateAssignmentSubmission(automaton(['q0', 'q1'], [['a'], ['b']]), 'DFA', frontmatter);
    expect(issues).toEqual([]);
  });

  it('flags an automaton type mismatch', () => {
    const issues = validateAssignmentSubmission(automaton(['q0'], [['a']]), 'NFA', frontmatter);
    expect(issues.some((i) => i.includes('expects a DFA'))).toBe(true);
  });

  it('flags exceeding max_states', () => {
    const issues = validateAssignmentSubmission(automaton(['q0', 'q1', 'q2'], [['a']]), 'DFA', frontmatter);
    expect(issues.some((i) => i.includes('allows at most 2'))).toBe(true);
  });

  it('flags symbols outside the allowed alphabet', () => {
    const issues = validateAssignmentSubmission(automaton(['q0'], [['c']]), 'DFA', frontmatter);
    expect(issues.some((i) => i.includes('outside the allowed alphabet'))).toBe(true);
    expect(issues.some((i) => i.includes('c'))).toBe(true);
  });

  it('does not flag epsilon transitions as out-of-alphabet symbols', () => {
    const issues = validateAssignmentSubmission(automaton(['q0'], [['ε']]), 'DFA', frontmatter);
    expect(issues.some((i) => i.includes('outside the allowed alphabet'))).toBe(false);
  });
});
