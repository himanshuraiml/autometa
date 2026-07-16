import { useCallback, useEffect, useState } from 'react';
import { ApiError, createProfile, deleteProfile, listProfiles } from '../utils/apiClient';
import type { ProfileDTO, ProfileRole } from '../utils/apiClient';

const ACTIVE_PROFILE_KEY = 'autometa_active_profile_id';

/**
 * Lightweight local "accounts" — no passwords, just a name + role scoping
 * Phase 5 progress/authoring data on the local DB (see
 * docs/phase-5-7-implementation.md for the accounts-model decision).
 */
export function useProfile() {
  const [profiles, setProfiles] = useState<ProfileDTO[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(ACTIVE_PROFILE_KEY);
    return stored ? Number(stored) : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listProfiles();
      setProfiles(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load profiles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveProfileId = useCallback((id: number | null) => {
    setActiveProfileIdState(id);
    if (id === null) localStorage.removeItem(ACTIVE_PROFILE_KEY);
    else localStorage.setItem(ACTIVE_PROFILE_KEY, String(id));
  }, []);

  const addProfile = useCallback(
    async (name: string, role: ProfileRole) => {
      const created = await createProfile({ name, role });
      setProfiles(prev => [...prev, created]);
      setActiveProfileId(created.id);
      return created;
    },
    [setActiveProfileId]
  );

  const removeProfile = useCallback(
    async (id: number) => {
      await deleteProfile(id);
      setProfiles(prev => prev.filter(p => p.id !== id));
      setActiveProfileIdState(current => {
        if (current !== id) return current;
        localStorage.removeItem(ACTIVE_PROFILE_KEY);
        return null;
      });
    },
    []
  );

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null;

  return {
    profiles,
    activeProfile,
    activeProfileId,
    setActiveProfileId,
    addProfile,
    removeProfile,
    loading,
    error,
    refresh,
  };
}

export type UseProfile = ReturnType<typeof useProfile>;
