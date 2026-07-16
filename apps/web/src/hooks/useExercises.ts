import { useCallback, useState } from 'react';
import { generateExercise, wrapGrammar } from '@autometa/rule-engine';
import type { Difficulty, ExerciseAutomatonType, GeneratedExercise } from '@autometa/rule-engine';
import { ApiError, createExercise, deleteExercise, listExercises, updateExercise } from '../utils/apiClient';
import type { ExerciseDTO, ExercisePayload } from '../utils/apiClient';

export interface ExerciseFilters {
  automaton_type?: string;
  difficulty?: string;
  created_by?: number;
}

/** Converts a freshly generated exercise into the opaque-JSON shape the backend stores. */
const toPayload = (generated: GeneratedExercise, createdBy?: number): ExercisePayload => ({
  title: generated.title,
  automaton_type: generated.automatonType,
  difficulty: generated.difficulty,
  learning_objective: generated.learningObjective,
  description: generated.description,
  reference_nodes_json: generated.automaton ? JSON.stringify(generated.automaton.nodes) : undefined,
  reference_edges_json: generated.automaton ? JSON.stringify(generated.automaton.edges) : undefined,
  reference_regex: generated.regex,
  reference_rules_json: generated.rules
    ? JSON.stringify(wrapGrammar(generated.rules, generated.startSymbol ?? 'S'))
    : undefined,
  alphabet_json: JSON.stringify(generated.alphabet),
  sample_tests_json: JSON.stringify(generated.sampleTests),
  hints_json: JSON.stringify(generated.hints),
  is_ai_generated: true,
  created_by: createdBy,
});

/**
 * Exercise browsing + generation. Generation itself is instant and fully
 * client-side (packages/rule-engine/src/exerciseGenerator.ts) — the backend
 * only persists the result, matching how grading/simulation already work.
 */
export function useExercises() {
  const [exercises, setExercises] = useState<ExerciseDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (filters?: ExerciseFilters) => {
    setLoading(true);
    try {
      const list = await listExercises(filters);
      setExercises(list);
      setError(null);
      return list;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load exercises.');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const generateAndSave = useCallback(
    async (
      type: ExerciseAutomatonType,
      difficulty: Difficulty,
      learningObjective: string | undefined,
      createdBy?: number
    ) => {
      const generated = generateExercise(type, difficulty, learningObjective);
      const created = await createExercise(toPayload(generated, createdBy));
      setExercises(prev => [created, ...prev]);
      return created;
    },
    []
  );

  const saveManualExercise = useCallback(async (payload: ExercisePayload) => {
    const created = await createExercise(payload);
    setExercises(prev => [created, ...prev]);
    return created;
  }, []);

  const editExercise = useCallback(async (id: number, payload: Partial<ExercisePayload>) => {
    const updated = await updateExercise(id, payload);
    setExercises(prev => prev.map(e => (e.id === id ? updated : e)));
    return updated;
  }, []);

  const removeExercise = useCallback(async (id: number) => {
    await deleteExercise(id);
    setExercises(prev => prev.filter(e => e.id !== id));
  }, []);

  return {
    exercises,
    loading,
    error,
    refresh,
    generateAndSave,
    saveManualExercise,
    editExercise,
    removeExercise,
  };
}

export type UseExercises = ReturnType<typeof useExercises>;
