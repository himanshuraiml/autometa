import { useCallback, useMemo, useState } from 'react';
import { gradeSubmission, migrateGrammar, wrapGrammar } from '@autometa/rule-engine';
import type { CFGRules, ExerciseAutomatonType, GradingResult, SampleTest } from '@autometa/rule-engine';
import type { AutomatonNode, AutomatonEdge } from '@autometa/simulation-engine';
import { ApiError, createAttempt } from '../utils/apiClient';
import type { AttemptPayload, ExerciseDTO } from '../utils/apiClient';

export interface PracticeSubmission {
  nodes?: AutomatonNode[];
  edges?: AutomatonEdge[];
  regex?: string;
  rules?: CFGRules;
  startSymbol?: string;
}

interface UsePracticeArgs {
  profileId: number | null;
}

/**
 * Drives one practice session: prompt -> progressive hints -> attempt ->
 * grade -> retry/next. Grading runs client-side via `gradeSubmission`
 * (packages/rule-engine/src/grading.ts); this hook only wires the exercise's
 * stored reference/sample-tests into that call and persists the outcome.
 */
export function usePractice({ profileId }: UsePracticeArgs) {
  const [activeExercise, setActiveExercise] = useState<ExerciseDTO | null>(null);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [lastResult, setLastResult] = useState<GradingResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startExercise = useCallback((exercise: ExerciseDTO) => {
    setActiveExercise(exercise);
    setHintsRevealed(0);
    setAttemptCount(0);
    setLastResult(null);
    setError(null);
  }, []);

  const clearExercise = useCallback(() => setActiveExercise(null), []);

  const revealNextHint = useCallback(() => setHintsRevealed(n => n + 1), []);

  const maxAttemptsReached = useMemo(() => {
    if (!activeExercise?.max_attempts) return false;
    return attemptCount >= activeExercise.max_attempts;
  }, [activeExercise, attemptCount]);

  const submit = useCallback(
    async (submission: PracticeSubmission): Promise<GradingResult | null> => {
      if (!activeExercise || maxAttemptsReached) return null;
      setSubmitting(true);
      setError(null);
      try {
        const type = activeExercise.automaton_type as ExerciseAutomatonType;
        const sampleTests: SampleTest[] = JSON.parse(activeExercise.sample_tests_json || '[]');
        const referenceRules = activeExercise.reference_rules_json
          ? migrateGrammar(JSON.parse(activeExercise.reference_rules_json))
          : null;

        const reference = {
          automaton:
            activeExercise.reference_nodes_json && activeExercise.reference_edges_json
              ? {
                  nodes: JSON.parse(activeExercise.reference_nodes_json),
                  edges: JSON.parse(activeExercise.reference_edges_json),
                }
              : undefined,
          regex: activeExercise.reference_regex ?? undefined,
          rules: referenceRules?.rules,
          startSymbol: referenceRules?.startSymbol,
        };

        const submitted = {
          automaton: submission.nodes && submission.edges ? { nodes: submission.nodes, edges: submission.edges } : undefined,
          regex: submission.regex,
          rules: submission.rules,
          startSymbol: submission.startSymbol,
        };

        const result = gradeSubmission(type, reference, submitted, sampleTests);
        setLastResult(result);
        const nextAttemptNumber = attemptCount + 1;
        setAttemptCount(nextAttemptNumber);

        if (profileId !== null) {
          const payload: AttemptPayload = {
            exercise_id: activeExercise.id,
            profile_id: profileId,
            attempt_number: nextAttemptNumber,
            submitted_nodes_json: submission.nodes ? JSON.stringify(submission.nodes) : undefined,
            submitted_edges_json: submission.edges ? JSON.stringify(submission.edges) : undefined,
            submitted_regex: submission.regex,
            submitted_rules_json: submission.rules ? JSON.stringify(wrapGrammar(submission.rules, submission.startSymbol ?? 'S')) : undefined,
            passed: result.passed,
            score: result.score,
            counterexample: result.counterexample,
            expected: result.expected,
            actual: result.actual,
            message: result.message,
            hints_used: hintsRevealed,
          };
          await createAttempt(payload);
        }

        return result;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not grade this submission.');
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [activeExercise, attemptCount, hintsRevealed, maxAttemptsReached, profileId]
  );

  return {
    activeExercise,
    startExercise,
    clearExercise,
    hintsRevealed,
    revealNextHint,
    attemptCount,
    maxAttemptsReached,
    lastResult,
    submitting,
    error,
    submit,
  };
}

export type UsePractice = ReturnType<typeof usePractice>;
