import { useCallback, useState } from 'react';
import {
  ApiError,
  createLessonPath,
  createLessonPathStep,
  deleteLessonPath,
  deleteLessonPathStep,
  getPathProgress,
  listLessonPathSteps,
  listLessonPaths,
  updateLessonPath,
  upsertPathProgress,
} from '../utils/apiClient';
import type { LessonPathDTO, LessonPathStepDTO, LessonPathStepType, PathProgressDTO } from '../utils/apiClient';

/** Lesson paths: ordered topic/exercise sequences, e.g. "DFA -> NFA -> subset construction -> minimization -> regex". */
export function useLessonPaths() {
  const [paths, setPaths] = useState<LessonPathDTO[]>([]);
  const [stepsByPath, setStepsByPath] = useState<Record<number, LessonPathStepDTO[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listLessonPaths();
      setPaths(list);
      setError(null);
      return list;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load lesson paths.');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSteps = useCallback(async (pathId: number) => {
    const steps = await listLessonPathSteps(pathId);
    setStepsByPath(prev => ({ ...prev, [pathId]: steps }));
    return steps;
  }, []);

  const addPath = useCallback(async (title: string, description: string, createdBy?: number) => {
    const created = await createLessonPath({ title, description, created_by: createdBy });
    setPaths(prev => [created, ...prev]);
    return created;
  }, []);

  const renamePath = useCallback(async (id: number, title: string, description: string) => {
    const updated = await updateLessonPath(id, { title, description });
    setPaths(prev => prev.map(p => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const removePath = useCallback(async (id: number) => {
    await deleteLessonPath(id);
    setPaths(prev => prev.filter(p => p.id !== id));
    setStepsByPath(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const addStep = useCallback(
    async (
      pathId: number,
      step: { position: number; step_type: LessonPathStepType; title: string; description?: string; exercise_id?: number }
    ) => {
      const created = await createLessonPathStep(pathId, { lesson_path_id: pathId, ...step });
      setStepsByPath(prev => ({
        ...prev,
        [pathId]: [...(prev[pathId] ?? []), created].sort((a, b) => a.position - b.position),
      }));
      return created;
    },
    []
  );

  const removeStep = useCallback(async (pathId: number, stepId: number) => {
    await deleteLessonPathStep(pathId, stepId);
    setStepsByPath(prev => ({ ...prev, [pathId]: (prev[pathId] ?? []).filter(s => s.id !== stepId) }));
  }, []);

  const saveProgress = useCallback(
    (pathId: number, profileId: number, currentStepIndex: number, completedSteps: number[]) =>
      upsertPathProgress(pathId, {
        lesson_path_id: pathId,
        profile_id: profileId,
        current_step_index: currentStepIndex,
        completed_steps_json: JSON.stringify(completedSteps),
      }),
    []
  );

  const loadProgress = useCallback(async (pathId: number, profileId: number): Promise<PathProgressDTO | null> => {
    try {
      return await getPathProgress(pathId, profileId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, []);

  return {
    paths,
    stepsByPath,
    loading,
    error,
    refresh,
    loadSteps,
    addPath,
    renamePath,
    removePath,
    addStep,
    removeStep,
    saveProgress,
    loadProgress,
  };
}

export type UseLessonPaths = ReturnType<typeof useLessonPaths>;
