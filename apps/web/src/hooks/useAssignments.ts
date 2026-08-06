import { useCallback, useState } from 'react';
import {
  getRepoReadme,
  getFileContent,
  parseTaskFrontmatter,
  submitSolutionFile,
  buildSolutionFileContent,
  SOLUTION_FILE_NAME,
  GithubApiError,
  FrontmatterParseError,
} from '@autometa/github-service';
import type { TaskAssignment } from '@autometa/github-service';
import { migrateAutomatonSchema } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';

const TRACKED_REPOS_KEY = 'autometa_github_tracked_repos';

export interface TrackedRepoState {
  ownerRepo: string;
  status: 'loading' | 'ready' | 'error';
  assignment?: TaskAssignment;
  error?: string;
}

const loadTrackedRepos = (): string[] => {
  try {
    const raw = localStorage.getItem(TRACKED_REPOS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const saveTrackedRepos = (repos: string[]) => {
  localStorage.setItem(TRACKED_REPOS_KEY, JSON.stringify(repos));
};

const errorMessage = (err: unknown): string => {
  if (err instanceof FrontmatterParseError || err instanceof GithubApiError) return err.message;
  return err instanceof Error ? err.message : 'Could not load this assignment.';
};

/**
 * Tracks GitHub Classroom assignment repos the student has pasted in
 * (there is no GitHub/Classroom API to list "my assigned repos"), fetches
 * each repo's README frontmatter, and submits solutions via the Contents API.
 */
export function useAssignments(token: string | null) {
  const [tracked, setTracked] = useState<TrackedRepoState[]>(() =>
    loadTrackedRepos().map((ownerRepo) => ({ ownerRepo, status: 'loading' as const }))
  );
  const [selected, setSelected] = useState<TaskAssignment | null>(null);

  const loadOne = useCallback(
    async (ownerRepo: string): Promise<TrackedRepoState> => {
      if (!token) return { ownerRepo, status: 'error', error: 'Not signed in to GitHub.' };
      const [owner, repo] = ownerRepo.split('/');
      if (!owner || !repo) return { ownerRepo, status: 'error', error: 'Expected "owner/repo".' };

      try {
        const readme = await getRepoReadme(token, owner, repo);
        if (!readme) return { ownerRepo, status: 'error', error: 'Repo has no README.md.' };
        const frontmatter = parseTaskFrontmatter(readme.content);

        let starterAutomaton: Automaton | undefined;
        if (frontmatter.starter_file) {
          const starter = await getFileContent(token, owner, repo, frontmatter.starter_file);
          if (starter) {
            try {
              starterAutomaton = migrateAutomatonSchema(JSON.parse(starter.content));
            } catch {
              // Starter file present but unreadable — assignment still loads without it.
            }
          }
        }

        const assignment: TaskAssignment = { owner, repo, frontmatter, readmeSha: readme.sha, starterAutomaton };
        return { ownerRepo, status: 'ready', assignment };
      } catch (err) {
        return { ownerRepo, status: 'error', error: errorMessage(err) };
      }
    },
    [token]
  );

  const addRepo = useCallback(
    async (ownerRepo: string) => {
      const trimmed = ownerRepo.trim();
      if (!trimmed || tracked.some((t) => t.ownerRepo === trimmed)) return;

      setTracked((prev) => [...prev, { ownerRepo: trimmed, status: 'loading' }]);
      const result = await loadOne(trimmed);
      setTracked((prev) => prev.map((t) => (t.ownerRepo === trimmed ? result : t)));
      saveTrackedRepos([...loadTrackedRepos().filter((r) => r !== trimmed), trimmed]);
    },
    [tracked, loadOne]
  );

  const removeRepo = useCallback((ownerRepo: string) => {
    setTracked((prev) => prev.filter((t) => t.ownerRepo !== ownerRepo));
    saveTrackedRepos(loadTrackedRepos().filter((r) => r !== ownerRepo));
    setSelected((prev) => (prev && `${prev.owner}/${prev.repo}` === ownerRepo ? null : prev));
  }, []);

  const refresh = useCallback(async () => {
    const repos = tracked.map((t) => t.ownerRepo);
    setTracked(repos.map((ownerRepo) => ({ ownerRepo, status: 'loading' as const })));
    const results = await Promise.all(repos.map(loadOne));
    setTracked(results);
  }, [tracked, loadOne]);

  const select = useCallback((assignment: TaskAssignment | null) => setSelected(assignment), []);

  const submitSolution = useCallback(
    async (assignment: TaskAssignment, automaton: Automaton) => {
      if (!token) throw new Error('Not signed in to GitHub.');
      const content = buildSolutionFileContent(automaton);
      return submitSolutionFile(
        token,
        assignment.owner,
        assignment.repo,
        SOLUTION_FILE_NAME,
        content,
        'Submit solution via Autometa'
      );
    },
    [token]
  );

  return { tracked, selected, addRepo, removeRepo, refresh, select, submitSolution };
}

export type UseAssignments = ReturnType<typeof useAssignments>;
