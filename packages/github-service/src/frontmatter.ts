import { parse as parseYaml } from 'yaml';
import { FrontmatterParseError } from './types';
import type { TaskFrontmatter, TaskTestCase } from './types';

const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const VALID_TYPES = new Set(['DFA', 'NFA', 'PDA', 'TM']);

const requireString = (data: Record<string, unknown>, field: string): string => {
  const value = data[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrontmatterParseError(`Task frontmatter is missing required field "${field}".`, field);
  }
  return value;
};

const requireStringArray = (data: Record<string, unknown>, field: string): string[] => {
  const value = data[field];
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string')) {
    throw new FrontmatterParseError(`Task frontmatter field "${field}" must be a non-empty list of strings.`, field);
  }
  return value;
};

const requireTestCases = (data: Record<string, unknown>): TaskTestCase[] => {
  const value = data.test_cases;
  if (!Array.isArray(value) || value.length === 0) {
    throw new FrontmatterParseError('Task frontmatter field "test_cases" must be a non-empty list.', 'test_cases');
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new FrontmatterParseError(`test_cases[${index}] must be an object with "input" and "expected".`, 'test_cases');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.input !== 'string') {
      throw new FrontmatterParseError(`test_cases[${index}].input must be a string.`, 'test_cases');
    }
    if (typeof record.expected !== 'boolean') {
      throw new FrontmatterParseError(`test_cases[${index}].expected must be a boolean.`, 'test_cases');
    }
    const label = typeof record.label === 'string' ? record.label : undefined;
    return { input: record.input, expected: record.expected, label };
  });
};

/**
 * Parses the YAML frontmatter block from a task README.md into a validated
 * TaskFrontmatter. Throws FrontmatterParseError naming the offending field
 * (or a general parse failure) rather than returning a partial result.
 */
export const parseTaskFrontmatter = (readmeContent: string): TaskFrontmatter => {
  const match = FRONTMATTER_BLOCK.exec(readmeContent);
  if (!match) {
    throw new FrontmatterParseError('README has no YAML frontmatter block (expected to start with "---").');
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch (err) {
    throw new FrontmatterParseError(`Could not parse task frontmatter as YAML: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new FrontmatterParseError('Task frontmatter did not parse to an object.');
  }
  const data = parsed as Record<string, unknown>;

  const id = requireString(data, 'id');
  const title = requireString(data, 'title');
  const course = requireString(data, 'course');
  const type = requireString(data, 'type');
  if (!VALID_TYPES.has(type)) {
    throw new FrontmatterParseError(`Task frontmatter field "type" must be one of DFA, NFA, PDA, TM (got "${type}").`, 'type');
  }

  const maxStates = data.max_states;
  if (typeof maxStates !== 'number' || !Number.isInteger(maxStates) || maxStates <= 0) {
    throw new FrontmatterParseError('Task frontmatter field "max_states" must be a positive integer.', 'max_states');
  }

  const allowedAlphabet = requireStringArray(data, 'allowed_alphabet');
  const testCases = requireTestCases(data);
  const starterFile = typeof data.starter_file === 'string' ? data.starter_file : undefined;

  return {
    id,
    title,
    course,
    type: type as TaskFrontmatter['type'],
    max_states: maxStates,
    allowed_alphabet: allowedAlphabet,
    starter_file: starterFile,
    test_cases: testCases,
  };
};
