import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// apiClient probes `window` for the Tauri bridge at request time; give the
// node test environment a bare window with no __TAURI_INTERNALS__ so the
// client behaves like plain web dev (no auth token).
vi.stubGlobal('window', {});

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { ApiError, listProjects, createProject } from '../apiClient';

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('apiClient', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns parsed JSON and sends JSON headers', async () => {
    fetchMock.mockResolvedValueOnce(okJson([{ id: 1, name: 'P' }]));

    const projects = await listProjects();

    expect(projects).toEqual([{ id: 1, name: 'P' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/projects');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('maps HTTP errors to ApiError with status and backend detail, without retrying', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Project not found' }), { status: 404 }),
    );

    const err = await listProjects().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).detail).toBe('Project not found');
    expect((err as ApiError).isConnectionError).toBe(false);
    // HTTP-level failures are not transient: no retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries idempotent GETs on connection failure, then reports a connection error', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const pending = listProjects().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5000); // covers the 500ms + 1000ms backoffs
    const err = await pending;

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isConnectionError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3); // first try + 2 retries
  });

  it('never retries non-idempotent POSTs', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const err = await createProject({
      name: 'X', automaton_type: 'DFA', nodes_json: '[]', edges_json: '[]', node_counter: 0,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serializes the POST body', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: 7 }));

    await createProject({
      name: 'Body', automaton_type: 'NFA', nodes_json: '[]', edges_json: '[]', node_counter: 3,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ name: 'Body', automaton_type: 'NFA', node_counter: 3 });
  });
});
