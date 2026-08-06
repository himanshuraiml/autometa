import { describe, it, expect } from 'vitest';
import { parseTaskFrontmatter } from '../frontmatter';
import { FrontmatterParseError } from '../types';

const VALID_README = `---
id: "autometa-task-dfa-odd-b"
title: "DFA for Strings with Odd Number of 'b's"
course: "CS301 - Automata & Formal Languages"
type: "DFA"
max_states: 4
allowed_alphabet: ["a", "b"]
starter_file: "starter.autometa"
test_cases:
  - input: "ab"
    expected: true
  - input: "abb"
    expected: false
---

# Task: DFA for Strings with Odd Number of 'b's
`;

describe('parseTaskFrontmatter', () => {
  it('parses a valid frontmatter block into a TaskFrontmatter', () => {
    const result = parseTaskFrontmatter(VALID_README);
    expect(result).toEqual({
      id: 'autometa-task-dfa-odd-b',
      title: "DFA for Strings with Odd Number of 'b's",
      course: 'CS301 - Automata & Formal Languages',
      type: 'DFA',
      max_states: 4,
      allowed_alphabet: ['a', 'b'],
      starter_file: 'starter.autometa',
      test_cases: [
        { input: 'ab', expected: true, label: undefined },
        { input: 'abb', expected: false, label: undefined },
      ],
    });
  });

  it('throws a distinct error when there is no frontmatter block', () => {
    expect(() => parseTaskFrontmatter('# Just a heading, no frontmatter')).toThrow(/no YAML frontmatter/);
  });

  it('throws on malformed YAML', () => {
    const readme = '---\nid: ["unterminated\n---\nbody';
    expect(() => parseTaskFrontmatter(readme)).toThrow(FrontmatterParseError);
  });

  it.each(['id', 'title', 'course', 'type', 'max_states', 'allowed_alphabet', 'test_cases'])(
    'throws naming the field when "%s" is missing',
    (field) => {
      const lines = VALID_README.split('\n').filter((line) => !line.trim().startsWith(`${field}:`));
      const withoutField = field === 'test_cases'
        ? VALID_README.replace(/test_cases:\n(?: {2}- .*\n {4}.*\n?)+/, '')
        : lines.join('\n');

      let error: unknown;
      try {
        parseTaskFrontmatter(withoutField);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(FrontmatterParseError);
      expect((error as FrontmatterParseError).field).toBe(field);
    }
  );

  it('rejects an unknown automaton type', () => {
    const readme = VALID_README.replace('type: "DFA"', 'type: "REGEX"');
    expect(() => parseTaskFrontmatter(readme)).toThrow(/must be one of DFA, NFA, PDA, TM/);
  });

  it('rejects a non-positive max_states', () => {
    const readme = VALID_README.replace('max_states: 4', 'max_states: 0');
    expect(() => parseTaskFrontmatter(readme)).toThrow(/positive integer/);
  });
});
