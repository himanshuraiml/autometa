/**
 * Typed client for the Autometa backend sidecar.
 *
 * - Base URL comes from VITE_API_BASE_URL (defaults to the local sidecar).
 * - When running inside Tauri, a per-launch bearer token is fetched once from
 *   the shell (which generated it and passed it to the sidecar) and attached
 *   to every request. In plain web dev the backend runs without a token.
 * - Every request has a timeout; connection-level failures on idempotent
 *   requests are retried with backoff.
 */

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

/** Long enough for local Ollama generation, which can be slow on first load. */
const LLM_TIMEOUT_MS = 240_000;
const CRUD_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly status: number | null;
  readonly detail: string | null;

  constructor(message: string, status: number | null = null, detail: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }

  /** True when the backend simply wasn't reachable (down, not yet started). */
  get isConnectionError(): boolean {
    return this.status === null;
  }
}

let cachedToken: string | null | undefined;

async function getAuthToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  if (!('__TAURI_INTERNALS__' in window)) {
    cachedToken = null;
    return cachedToken;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    cachedToken = (await invoke<string>('get_backend_token')) || null;
  } catch {
    // Older shell without the command, or web build served through Tauri dev.
    cachedToken = null;
  }
  return cachedToken;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
  /** Extra attempts after the first, only used on connection-level failures. */
  retries?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = CRUD_TIMEOUT_MS } = options;
  // Never auto-retry non-idempotent requests: a timed-out POST may have
  // already been applied by the server.
  const retries = options.retries ?? (method === 'GET' ? 2 : 0);

  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        const detail = typeof errBody?.detail === 'string' ? errBody.detail : null;
        throw new ApiError(
          detail || `Request failed (HTTP ${response.status})`,
          response.status,
          detail,
        );
      }
      return (await response.json()) as T;
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError) throw err; // HTTP errors are not transient
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const reason = lastError instanceof Error && lastError.name === 'AbortError'
    ? 'The request timed out.'
    : 'The backend is not reachable.';
  throw new ApiError(`Could not reach the Autometa backend at ${API_BASE_URL}. ${reason}`);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectVisibility = 'private' | 'public';

export interface ProjectDTO {
  id: number;
  name: string;
  automaton_type: string;
  nodes_json: string;
  edges_json: string;
  node_counter: number;
  metadata_json?: string;
  tags_json: string;
  visibility: ProjectVisibility;
  is_favorite: boolean;
  owner_profile_id?: number | null;
  cloned_from_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectPayload {
  name: string;
  automaton_type: string;
  nodes_json: string;
  edges_json: string;
  node_counter: number;
  metadata_json?: string;
  tags_json?: string;
  visibility?: ProjectVisibility;
  is_favorite?: boolean;
  owner_profile_id?: number;
}

export const listProjects = (options?: {
  limit?: number;
  offset?: number;
  visibility?: ProjectVisibility;
  owner_profile_id?: number;
  is_favorite?: boolean;
  tag?: string;
}) => {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.offset !== undefined) params.set('offset', String(options.offset));
  if (options?.visibility) params.set('visibility', options.visibility);
  if (options?.owner_profile_id !== undefined) params.set('owner_profile_id', String(options.owner_profile_id));
  if (options?.is_favorite !== undefined) params.set('is_favorite', String(options.is_favorite));
  if (options?.tag) params.set('tag', options.tag);
  const query = params.toString();
  return request<ProjectDTO[]>(`/api/projects${query ? `?${query}` : ''}`);
};

export const createProject = (payload: ProjectPayload) =>
  request<ProjectDTO>('/api/projects', { method: 'POST', body: payload });

export const updateProject = (id: number, payload: Partial<ProjectPayload>) =>
  request<ProjectDTO>(`/api/projects/${id}`, { method: 'PUT', body: payload });

export const cloneProject = (id: number, ownerProfileId?: number) =>
  request<ProjectDTO>(
    `/api/projects/${id}/clone${ownerProfileId !== undefined ? `?owner_profile_id=${ownerProfileId}` : ''}`,
    { method: 'POST' }
  );

// ---------------------------------------------------------------------------
// Project versions
// ---------------------------------------------------------------------------

export interface ProjectVersionDTO {
  id: number;
  project_id: number;
  label: string;
  nodes_json: string;
  edges_json: string;
  node_counter: number;
  created_at: string;
}

export const createProjectVersion = (
  projectId: number,
  payload: { label: string; nodes_json: string; edges_json: string; node_counter: number }
) => request<ProjectVersionDTO>(`/api/projects/${projectId}/versions`, { method: 'POST', body: { project_id: projectId, ...payload } });

export const listProjectVersions = (projectId: number) =>
  request<ProjectVersionDTO[]>(`/api/projects/${projectId}/versions`);

export const deleteProjectVersion = (projectId: number, versionId: number) =>
  request<{ ok: boolean }>(`/api/projects/${projectId}/versions/${versionId}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export interface CommentDTO {
  id: number;
  profile_id: number;
  project_id?: number | null;
  exercise_id?: number | null;
  attempt_id?: number | null;
  body: string;
  created_at: string;
}

export const createComment = (payload: {
  profile_id: number;
  project_id?: number;
  exercise_id?: number;
  attempt_id?: number;
  body: string;
}) => request<CommentDTO>('/api/comments', { method: 'POST', body: payload });

export const listComments = (filter: { project_id?: number; exercise_id?: number; attempt_id?: number }) => {
  const params = new URLSearchParams();
  if (filter.project_id !== undefined) params.set('project_id', String(filter.project_id));
  if (filter.exercise_id !== undefined) params.set('exercise_id', String(filter.exercise_id));
  if (filter.attempt_id !== undefined) params.set('attempt_id', String(filter.attempt_id));
  return request<CommentDTO[]>(`/api/comments?${params.toString()}`);
};

export const deleteComment = (id: number) => request<{ ok: boolean }>(`/api/comments/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// AI endpoints
// ---------------------------------------------------------------------------

export interface LLMRouting {
  provider?: string;
  api_key?: string;
  model?: string;
  base_url?: string;
}

export interface ChatPayload extends LLMRouting {
  prompt: string;
  mode: string;
  context?: Record<string, unknown>;
}

export const chatWithTutor = (payload: ChatPayload) =>
  request<{ response: string }>('/api/tutor/chat', {
    method: 'POST',
    body: payload,
    timeoutMs: LLM_TIMEOUT_MS,
  });

export interface GradePayload extends LLMRouting {
  description: string;
  automaton_type: string;
  nodes: { id: string; label: string; isStart: boolean; isAccept: boolean }[];
  edges: { id: string; source: string; target: string; label: string }[];
  alphabet: string[];
  simulation_runs: { input: string; accepted: boolean }[];
}

export const gradeAutomaton = (payload: GradePayload) =>
  request<{ response: string }>('/api/tutor/grade', {
    method: 'POST',
    body: payload,
    timeoutMs: LLM_TIMEOUT_MS,
  });

export interface LessonPayload extends LLMRouting {
  topic: string;
  audience?: string;
  duration?: string;
  difficulty?: string;
  teaching_style?: string;
  include_quizzes: boolean;
  generate_narration: boolean;
}

/** Shape is validated server-side (LessonResponse); callers re-check slides. */
export const generateLessonRequest = (payload: LessonPayload) =>
  request<Record<string, any>>('/api/tutor/lesson', {
    method: 'POST',
    body: payload,
    timeoutMs: LLM_TIMEOUT_MS,
  });

// ---------------------------------------------------------------------------
// Profiles — lightweight local "accounts" (see docs/phase-5-7-implementation.md)
// ---------------------------------------------------------------------------

export type ProfileRole = 'student' | 'instructor';

export interface ProfileDTO {
  id: number;
  name: string;
  role: ProfileRole;
  created_at: string;
}

export const createProfile = (payload: { name: string; role: ProfileRole }) =>
  request<ProfileDTO>('/api/profiles', { method: 'POST', body: payload });

export const listProfiles = () => request<ProfileDTO[]>('/api/profiles');

export const deleteProfile = (id: number) =>
  request<{ ok: boolean }>(`/api/profiles/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export interface ExerciseDTO {
  id: number;
  title: string;
  automaton_type: string;
  difficulty: string;
  learning_objective: string;
  description: string;
  reference_nodes_json?: string | null;
  reference_edges_json?: string | null;
  reference_regex?: string | null;
  reference_rules_json?: string | null;
  alphabet_json: string;
  sample_tests_json: string;
  hints_json: string;
  rubric?: string | null;
  is_ai_generated: boolean;
  created_by?: number | null;
  deadline?: string | null;
  max_attempts?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ExercisePayload {
  title: string;
  automaton_type: string;
  difficulty: string;
  learning_objective: string;
  description: string;
  reference_nodes_json?: string;
  reference_edges_json?: string;
  reference_regex?: string;
  reference_rules_json?: string;
  alphabet_json: string;
  sample_tests_json: string;
  hints_json: string;
  rubric?: string;
  is_ai_generated: boolean;
  created_by?: number;
  deadline?: string;
  max_attempts?: number;
}

export const createExercise = (payload: ExercisePayload) =>
  request<ExerciseDTO>('/api/exercises', { method: 'POST', body: payload });

export const listExercises = (options?: {
  automaton_type?: string;
  difficulty?: string;
  created_by?: number;
  limit?: number;
  offset?: number;
}) => {
  const params = new URLSearchParams();
  if (options?.automaton_type) params.set('automaton_type', options.automaton_type);
  if (options?.difficulty) params.set('difficulty', options.difficulty);
  if (options?.created_by !== undefined) params.set('created_by', String(options.created_by));
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.offset !== undefined) params.set('offset', String(options.offset));
  const query = params.toString();
  return request<ExerciseDTO[]>(`/api/exercises${query ? `?${query}` : ''}`);
};

export const getExercise = (id: number) => request<ExerciseDTO>(`/api/exercises/${id}`);

export const updateExercise = (id: number, payload: Partial<ExercisePayload>) =>
  request<ExerciseDTO>(`/api/exercises/${id}`, { method: 'PUT', body: payload });

export const deleteExercise = (id: number) =>
  request<{ ok: boolean }>(`/api/exercises/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export interface AttemptDTO {
  id: number;
  exercise_id: number;
  profile_id: number;
  attempt_number: number;
  submitted_nodes_json?: string | null;
  submitted_edges_json?: string | null;
  submitted_regex?: string | null;
  submitted_rules_json?: string | null;
  passed: boolean;
  score: number;
  counterexample?: string | null;
  expected?: string | null;
  actual?: string | null;
  message: string;
  feedback?: string | null;
  hints_used: number;
  created_at: string;
}

export interface AttemptPayload {
  exercise_id: number;
  profile_id: number;
  attempt_number: number;
  submitted_nodes_json?: string;
  submitted_edges_json?: string;
  submitted_regex?: string;
  submitted_rules_json?: string;
  passed: boolean;
  score: number;
  counterexample?: string;
  expected?: string;
  actual?: string;
  message: string;
  feedback?: string;
  hints_used: number;
}

export const createAttempt = (payload: AttemptPayload) =>
  request<AttemptDTO>('/api/attempts', { method: 'POST', body: payload });

export const listAttempts = (options?: {
  exercise_id?: number;
  profile_id?: number;
  limit?: number;
  offset?: number;
}) => {
  const params = new URLSearchParams();
  if (options?.exercise_id !== undefined) params.set('exercise_id', String(options.exercise_id));
  if (options?.profile_id !== undefined) params.set('profile_id', String(options.profile_id));
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.offset !== undefined) params.set('offset', String(options.offset));
  const query = params.toString();
  return request<AttemptDTO[]>(`/api/attempts${query ? `?${query}` : ''}`);
};

export interface AttemptStats {
  attempts_total: number;
  exercises_attempted: number;
  exercises_passed: number;
}

export const getAttemptStats = (profileId: number) =>
  request<AttemptStats>(`/api/attempts/stats?profile_id=${profileId}`);

// ---------------------------------------------------------------------------
// Lesson paths
// ---------------------------------------------------------------------------

export interface LessonPathDTO {
  id: number;
  title: string;
  description: string;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

export type LessonPathStepType = 'topic' | 'exercise';

export interface LessonPathStepDTO {
  id: number;
  lesson_path_id: number;
  position: number;
  step_type: LessonPathStepType;
  title: string;
  description: string;
  exercise_id?: number | null;
}

export interface PathProgressDTO {
  id: number;
  lesson_path_id: number;
  profile_id: number;
  current_step_index: number;
  completed_steps_json: string;
  updated_at: string;
}

export const createLessonPath = (payload: { title: string; description: string; created_by?: number }) =>
  request<LessonPathDTO>('/api/lesson-paths', { method: 'POST', body: payload });

export const listLessonPaths = () => request<LessonPathDTO[]>('/api/lesson-paths');

export const getLessonPath = (id: number) => request<LessonPathDTO>(`/api/lesson-paths/${id}`);

export const updateLessonPath = (id: number, payload: { title?: string; description?: string }) =>
  request<LessonPathDTO>(`/api/lesson-paths/${id}`, { method: 'PUT', body: payload });

export const deleteLessonPath = (id: number) =>
  request<{ ok: boolean }>(`/api/lesson-paths/${id}`, { method: 'DELETE' });

export const createLessonPathStep = (
  pathId: number,
  payload: {
    lesson_path_id: number;
    position: number;
    step_type: LessonPathStepType;
    title: string;
    description?: string;
    exercise_id?: number;
  }
) => request<LessonPathStepDTO>(`/api/lesson-paths/${pathId}/steps`, { method: 'POST', body: payload });

export const listLessonPathSteps = (pathId: number) =>
  request<LessonPathStepDTO[]>(`/api/lesson-paths/${pathId}/steps`);

export const deleteLessonPathStep = (pathId: number, stepId: number) =>
  request<{ ok: boolean }>(`/api/lesson-paths/${pathId}/steps/${stepId}`, { method: 'DELETE' });

export const upsertPathProgress = (
  pathId: number,
  payload: { lesson_path_id: number; profile_id: number; current_step_index: number; completed_steps_json: string }
) => request<PathProgressDTO>(`/api/lesson-paths/${pathId}/progress`, { method: 'PUT', body: payload });

export const getPathProgress = (pathId: number, profileId: number) =>
  request<PathProgressDTO>(`/api/lesson-paths/${pathId}/progress?profile_id=${profileId}`);
