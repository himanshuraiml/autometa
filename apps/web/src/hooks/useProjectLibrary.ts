import { useCallback, useState } from 'react';
import {
  ApiError,
  cloneProject,
  createProjectVersion,
  deleteProjectVersion,
  listProjectVersions,
  listProjects,
  updateProject,
} from '../utils/apiClient';
import type { ProjectDTO, ProjectVersionDTO, ProjectVisibility } from '../utils/apiClient';

export interface ProjectLibraryFilters {
  visibility?: ProjectVisibility;
  owner_profile_id?: number;
  is_favorite?: boolean;
  tag?: string;
}

/** Project library: browse public/private/favorite projects, tag, clone, and manage version history. */
export function useProjectLibrary() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [versionsByProject, setVersionsByProject] = useState<Record<number, ProjectVersionDTO[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (filters?: ProjectLibraryFilters) => {
    setLoading(true);
    try {
      const list = await listProjects(filters);
      setProjects(list);
      setError(null);
      return list;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load projects.');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const setTags = useCallback(async (id: number, tags: string[]) => {
    const updated = await updateProject(id, { tags_json: JSON.stringify(tags) });
    setProjects(prev => prev.map(p => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const setVisibility = useCallback(async (id: number, visibility: ProjectVisibility) => {
    const updated = await updateProject(id, { visibility });
    setProjects(prev => prev.map(p => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const toggleFavorite = useCallback(async (project: ProjectDTO) => {
    const updated = await updateProject(project.id, { is_favorite: !project.is_favorite });
    setProjects(prev => prev.map(p => (p.id === project.id ? updated : p)));
    return updated;
  }, []);

  const clone = useCallback(async (id: number, ownerProfileId?: number) => {
    const cloned = await cloneProject(id, ownerProfileId);
    setProjects(prev => [cloned, ...prev]);
    return cloned;
  }, []);

  const loadVersions = useCallback(async (projectId: number) => {
    const versions = await listProjectVersions(projectId);
    setVersionsByProject(prev => ({ ...prev, [projectId]: versions }));
    return versions;
  }, []);

  const saveVersion = useCallback(
    async (projectId: number, label: string, nodesJson: string, edgesJson: string, nodeCounter: number) => {
      const version = await createProjectVersion(projectId, {
        label,
        nodes_json: nodesJson,
        edges_json: edgesJson,
        node_counter: nodeCounter,
      });
      setVersionsByProject(prev => ({ ...prev, [projectId]: [version, ...(prev[projectId] ?? [])] }));
      return version;
    },
    []
  );

  const removeVersion = useCallback(async (projectId: number, versionId: number) => {
    await deleteProjectVersion(projectId, versionId);
    setVersionsByProject(prev => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).filter(v => v.id !== versionId),
    }));
  }, []);

  return {
    projects,
    versionsByProject,
    loading,
    error,
    refresh,
    setTags,
    setVisibility,
    toggleFavorite,
    clone,
    loadVersions,
    saveVersion,
    removeVersion,
  };
}

export type UseProjectLibrary = ReturnType<typeof useProjectLibrary>;
