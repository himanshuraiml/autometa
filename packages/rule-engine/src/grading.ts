import type { Automaton } from '@autometa/simulation-engine';
import { runBatchTests, simulateNFA } from '@autometa/simulation-engine';
import type { BatchTestableType } from '@autometa/simulation-engine';
import { findLanguageCounterexample } from './fa';
import { regexToNfa } from './regex';
import { cykParse } from './cfg';
import type { CFGRules } from './cfg';

export type ExerciseAutomatonType = 'DFA' | 'NFA' | 'Regex' | 'CFG' | 'PDA' | 'TM';

/** One behavior probe: an input string and whether the reference solution accepts it. */
export interface SampleTest {
  input: string;
  expectedAccept: boolean;
}

export interface GradingResult {
  passed: boolean;
  /** 0..1 fraction correct — 1 whenever `passed` is true. */
  score: number;
  counterexample?: string;
  expected?: 'accept' | 'reject';
  actual?: 'accept' | 'reject';
  message: string;
}

export interface GradingReference {
  /** DFA/NFA/PDA/TM reference or submission. */
  automaton?: Automaton;
  /** Regex reference or submission. */
  regex?: string;
  /** CFG reference or submission. */
  rules?: CFGRules;
  startSymbol?: string;
}

const label = (accepted: boolean): 'accept' | 'reject' => (accepted ? 'accept' : 'reject');
const display = (input: string) => (input === '' ? 'ε (empty string)' : input);

/**
 * Grades a DFA/NFA/regex-derived NFA by exact language equivalence
 * (`findLanguageCounterexample` is a BFS over the product automaton, so the
 * counterexample it returns — if any — is real, not a sampling artifact).
 * The sample-test battery is only used to compute a partial-credit score
 * once we already know the submission is wrong.
 */
const gradeByEquivalence = (
  reference: Automaton,
  submitted: Automaton,
  sampleTests: SampleTest[]
): GradingResult => {
  const result = findLanguageCounterexample(reference, submitted);
  if (result.equivalent) {
    return {
      passed: true,
      score: 1,
      message: 'Your solution accepts exactly the same language as the reference solution.',
    };
  }

  const counterexample = result.counterexample ?? '';
  const expectedAccepted = simulateNFA(reference, counterexample).accepted;
  const actualAccepted = simulateNFA(submitted, counterexample).accepted;
  const score =
    sampleTests.length === 0
      ? 0
      : sampleTests.filter(t => simulateNFA(submitted, t.input).accepted === t.expectedAccept).length /
        sampleTests.length;

  return {
    passed: false,
    score,
    counterexample: display(counterexample),
    expected: label(expectedAccepted),
    actual: label(actualAccepted),
    message: `Your solution disagrees with the reference on input "${display(counterexample)}" — expected to ${label(expectedAccepted)} it, but your solution would ${label(actualAccepted)} it.`,
  };
};

/**
 * Grades by running the submission against a fixed sample-test battery and
 * diffing against each test's expected accept/reject — used where exact
 * equivalence isn't available (CFG membership, PDA/TM acceptance).
 */
const gradeByBattery = (
  submittedRun: (input: string) => boolean,
  sampleTests: SampleTest[]
): GradingResult => {
  if (sampleTests.length === 0) {
    return { passed: true, score: 1, message: 'No sample tests were defined for this exercise.' };
  }

  let correct = 0;
  let firstMismatch: { input: string; expected: boolean; actual: boolean } | undefined;
  for (const test of sampleTests) {
    const actual = submittedRun(test.input);
    if (actual === test.expectedAccept) {
      correct++;
    } else if (!firstMismatch) {
      firstMismatch = { input: test.input, expected: test.expectedAccept, actual };
    }
  }

  const score = correct / sampleTests.length;
  if (!firstMismatch) {
    return { passed: true, score: 1, message: 'Your solution matches the expected behavior on every sample test.' };
  }

  return {
    passed: false,
    score,
    counterexample: display(firstMismatch.input),
    expected: label(firstMismatch.expected),
    actual: label(firstMismatch.actual),
    message: `Your solution disagrees with the expected behavior on input "${display(firstMismatch.input)}" — expected to ${label(firstMismatch.expected)} it, but your solution would ${label(firstMismatch.actual)} it. (${correct}/${sampleTests.length} sample tests passed.)`,
  };
};

/**
 * Grades a student's automaton/grammar by behavior, not diagram shape.
 * DFA/NFA/Regex get an exact language-equivalence check; CFG/PDA/TM (where
 * exact equivalence is undecidable or unavailable) are graded against the
 * exercise's sample-test battery instead.
 */
export const gradeSubmission = (
  type: ExerciseAutomatonType,
  reference: GradingReference,
  submitted: GradingReference,
  sampleTests: SampleTest[]
): GradingResult => {
  switch (type) {
    case 'DFA':
    case 'NFA': {
      if (!reference.automaton || !submitted.automaton) {
        return { passed: false, score: 0, message: 'Missing an automaton to grade.' };
      }
      return gradeByEquivalence(reference.automaton, submitted.automaton, sampleTests);
    }

    case 'Regex': {
      if (!reference.regex || !submitted.regex) {
        return { passed: false, score: 0, message: 'Missing a regex to grade.' };
      }
      let referenceNfa: Automaton;
      let submittedNfa: Automaton;
      try {
        referenceNfa = regexToNfa(reference.regex);
        submittedNfa = regexToNfa(submitted.regex);
      } catch (err) {
        return { passed: false, score: 0, message: `Could not parse the regex: ${(err as Error).message}` };
      }
      return gradeByEquivalence(referenceNfa, submittedNfa, sampleTests);
    }

    case 'CFG': {
      if (!submitted.rules) {
        return { passed: false, score: 0, message: 'Missing a grammar to grade.' };
      }
      const startSymbol = submitted.startSymbol || reference.startSymbol || 'S';
      const rules = submitted.rules;
      return gradeByBattery(input => cykParse(rules, startSymbol, input), sampleTests);
    }

    case 'PDA':
    case 'TM': {
      if (!submitted.automaton) {
        return { passed: false, score: 0, message: 'Missing an automaton to grade.' };
      }
      const batchType: BatchTestableType = type;
      const results = runBatchTests(submitted.automaton, batchType, sampleTests.map(t => t.input));
      const accepted = new Map(results.map(r => [r.input, r.accepted]));
      return gradeByBattery(input => accepted.get(input) ?? false, sampleTests);
    }
  }
};
