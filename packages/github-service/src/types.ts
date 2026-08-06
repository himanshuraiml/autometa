import type { Automaton, BatchTestableType } from '@autometa/simulation-engine';

export type TaskAutomatonType = BatchTestableType;

export interface TaskTestCase {
  input: string;
  expected: boolean;
  label?: string;
}

export interface TaskFrontmatter {
  id: string;
  title: string;
  course: string;
  type: TaskAutomatonType;
  max_states: number;
  allowed_alphabet: string[];
  starter_file?: string;
  test_cases: TaskTestCase[];
}

export interface TaskAssignment {
  owner: string;
  repo: string;
  frontmatter: TaskFrontmatter;
  readmeSha: string;
  starterAutomaton?: Automaton;
}

export class GithubApiError extends Error {
  readonly status: number | null;
  readonly detail: string | null;

  constructor(message: string, status: number | null = null, detail: string | null = null) {
    super(message);
    this.name = 'GithubApiError';
    this.status = status;
    this.detail = detail;
  }
}

export class FrontmatterParseError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'FrontmatterParseError';
    this.field = field;
  }
}

export class ShaConflictError extends Error {
  constructor(message = 'Could not submit: the file kept changing on GitHub between attempts.') {
    super(message);
    this.name = 'ShaConflictError';
  }
}
