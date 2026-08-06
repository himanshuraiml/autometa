import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { submitSolutionFile } from '../restClient';
import { ShaConflictError, GithubApiError } from '../types';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const notFound = () => jsonResponse({ message: 'Not Found' }, 404);
const existingFile = (sha: string) => jsonResponse({ content: btoa('old content'), sha });
const putSuccess = (sha: string) => jsonResponse({ content: { sha }, commit: { html_url: 'https://github.com/o/r/commit/x' } });
const conflict = () => jsonResponse({ message: 'sha mismatch' }, 409);

describe('submitSolutionFile', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('omits sha on the PUT when the file does not exist yet', async () => {
    fetchMock.mockResolvedValueOnce(notFound()); // GET (probe for existing sha)
    fetchMock.mockResolvedValueOnce(putSuccess('new-sha')); // PUT

    const result = await submitSolutionFile('token', 'owner', 'repo', 'solution.autometa', '{}', 'Submit');

    expect(result).toEqual({ sha: 'new-sha', commitUrl: 'https://github.com/o/r/commit/x' });
    const putCall = fetchMock.mock.calls[1];
    const putBody = JSON.parse(putCall[1].body);
    expect(putBody.sha).toBeUndefined();
  });

  it('includes the current sha on the PUT when the file already exists', async () => {
    fetchMock.mockResolvedValueOnce(existingFile('current-sha'));
    fetchMock.mockResolvedValueOnce(putSuccess('updated-sha'));

    const result = await submitSolutionFile('token', 'owner', 'repo', 'solution.autometa', '{}', 'Submit');

    expect(result.sha).toBe('updated-sha');
    const putBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(putBody.sha).toBe('current-sha');
  });

  it('refetches the sha and retries once after a single 409, then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(existingFile('stale-sha')); // initial GET
    fetchMock.mockResolvedValueOnce(conflict()); // first PUT: stale
    fetchMock.mockResolvedValueOnce(existingFile('fresh-sha')); // refetch GET
    fetchMock.mockResolvedValueOnce(putSuccess('updated-sha')); // second PUT: succeeds

    const result = await submitSolutionFile('token', 'owner', 'repo', 'solution.autometa', '{}', 'Submit');

    expect(result.sha).toBe('updated-sha');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const secondPutBody = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(secondPutBody.sha).toBe('fresh-sha');
  });

  it('throws ShaConflictError after exhausting retries on a persistent 409, without looping forever', async () => {
    fetchMock.mockResolvedValueOnce(existingFile('sha-0')); // initial GET
    fetchMock.mockResolvedValueOnce(conflict()); // PUT attempt 1
    fetchMock.mockResolvedValueOnce(existingFile('sha-1')); // refetch
    fetchMock.mockResolvedValueOnce(conflict()); // PUT attempt 2
    fetchMock.mockResolvedValueOnce(existingFile('sha-2')); // refetch
    fetchMock.mockResolvedValueOnce(conflict()); // PUT attempt 3 (final)

    await expect(
      submitSolutionFile('token', 'owner', 'repo', 'solution.autometa', '{}', 'Submit')
    ).rejects.toBeInstanceOf(ShaConflictError);
    expect(fetchMock).toHaveBeenCalledTimes(6); // 1 initial GET + 3x(PUT [+ refetch except last])
  });

  it('surfaces non-409 failures as GithubApiError with the backend detail', async () => {
    fetchMock.mockResolvedValueOnce(notFound());
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Bad credentials' }, 401));

    const err = await submitSolutionFile('token', 'owner', 'repo', 'solution.autometa', '{}', 'Submit').catch((e) => e);

    expect(err).toBeInstanceOf(GithubApiError);
    expect((err as GithubApiError).status).toBe(401);
    expect((err as GithubApiError).detail).toBe('Bad credentials');
  });
});
