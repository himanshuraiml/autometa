import { useCallback, useState } from 'react';
import { ApiError, createComment, deleteComment, listComments } from '../utils/apiClient';
import type { CommentDTO } from '../utils/apiClient';

export interface CommentTarget {
  project_id?: number;
  exercise_id?: number;
  attempt_id?: number;
}

/** Comment thread attached to a project, exercise, or attempt (teacher feedback / collaboration discussion). */
export function useComments(target: CommentTarget) {
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listComments(target);
      setComments(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load comments.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.project_id, target.exercise_id, target.attempt_id]);

  const addComment = useCallback(
    async (profileId: number, body: string) => {
      const created = await createComment({ profile_id: profileId, body, ...target });
      setComments(prev => [...prev, created]);
      return created;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target.project_id, target.exercise_id, target.attempt_id]
  );

  const removeComment = useCallback(async (id: number) => {
    await deleteComment(id);
    setComments(prev => prev.filter(c => c.id !== id));
  }, []);

  return { comments, loading, error, refresh, addComment, removeComment };
}

export type UseComments = ReturnType<typeof useComments>;
