import { GithubApiError, ShaConflictError } from './types';

const API_BASE_URL = 'https://api.github.com';
const MAX_SUBMIT_ATTEMPTS = 3;

const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
};

const fromBase64 = (b64: string): string => {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

export const githubFetch = async (token: string, path: string, init: RequestInit = {}): Promise<Response> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
  };
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
};

const throwForResponse = async (response: Response, fallbackMessage: string): Promise<never> => {
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const detail = typeof body?.message === 'string' ? body.message : null;
  throw new GithubApiError(detail || fallbackMessage, response.status, detail);
};

export interface GithubUser {
  login: string;
  avatarUrl: string;
}

export const getAuthenticatedUser = async (token: string): Promise<GithubUser> => {
  const response = await githubFetch(token, '/user');
  if (!response.ok) return throwForResponse(response, 'Could not fetch the authenticated GitHub user.');
  const data = (await response.json()) as { login: string; avatar_url: string };
  return { login: data.login, avatarUrl: data.avatar_url };
};

export interface RepoFileContent {
  content: string;
  sha: string;
}

export const getRepoReadme = async (token: string, owner: string, repo: string): Promise<RepoFileContent | null> => {
  const response = await githubFetch(token, `/repos/${owner}/${repo}/readme`);
  if (response.status === 404) return null;
  if (!response.ok) return throwForResponse(response, `Could not fetch README for ${owner}/${repo}.`);
  const data = (await response.json()) as { content: string; sha: string };
  return { content: fromBase64(data.content), sha: data.sha };
};

export const getFileContent = async (
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<RepoFileContent | null> => {
  const response = await githubFetch(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`);
  if (response.status === 404) return null;
  if (!response.ok) return throwForResponse(response, `Could not fetch ${path} from ${owner}/${repo}.`);
  const data = (await response.json()) as { content: string; sha: string };
  return { content: fromBase64(data.content), sha: data.sha };
};

export interface SubmitResult {
  sha: string;
  commitUrl: string;
}

/**
 * Creates or updates a file via the Contents API. Handles the sha-conflict
 * race (someone/something else committed to the same path between our GET
 * and PUT — e.g. a prior submit attempt whose response we never saw) by
 * refetching the sha and retrying, bounded so a persistent conflict fails
 * loudly instead of looping forever.
 */
export const submitSolutionFile = async (
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string
): Promise<SubmitResult> => {
  let sha: string | undefined = (await getFileContent(token, owner, repo, path))?.sha;

  for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
    const response = await githubFetch(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: toBase64(content), ...(sha ? { sha } : {}) }),
    });

    if (response.ok) {
      const data = (await response.json()) as { content: { sha: string }; commit: { html_url: string } };
      return { sha: data.content.sha, commitUrl: data.commit.html_url };
    }

    if (response.status === 409 && attempt < MAX_SUBMIT_ATTEMPTS) {
      sha = (await getFileContent(token, owner, repo, path))?.sha;
      continue;
    }

    if (response.status === 409) {
      throw new ShaConflictError();
    }

    return throwForResponse(response, `Could not submit ${path} to ${owner}/${repo}.`);
  }

  throw new ShaConflictError();
};
