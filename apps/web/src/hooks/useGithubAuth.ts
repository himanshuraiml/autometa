import { useCallback, useRef, useState } from 'react';
import {
  requestDeviceCode,
  pollDeviceToken,
  getAuthenticatedUser,
  GithubApiError,
} from '@autometa/github-service';
import type { DeviceCodeResponse } from '@autometa/github-service';
import { getSecret, setSecret } from '../utils/secretStore';

export type GithubAuthStatus = 'idle' | 'awaiting_code' | 'polling' | 'authorized' | 'error';

/**
 * GitHub sign-in via OAuth Device Flow, matching how `gh` (GitHub's own CLI)
 * authenticates a trusted first-party tool — no client secret, token stored
 * in the OS keychain via secretStore (see [[keychain-secret-flow]]), not
 * localStorage/plugin-store.
 */
export function useGithubAuth(clientId: string | undefined) {
  const [token, setToken] = useState<string | null>(() => getSecret('autometa_github_token') || null);
  const [username, setUsername] = useState<string | null>(null);
  const [status, setStatus] = useState<GithubAuthStatus>(token ? 'authorized' : 'idle');
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const finishWithToken = useCallback(async (accessToken: string) => {
    setToken(accessToken);
    await setSecret('autometa_github_token', accessToken);
    setStatus('authorized');
    setDeviceCode(null);
    try {
      const user = await getAuthenticatedUser(accessToken);
      setUsername(user.login);
    } catch {
      // Non-fatal: sign-in already succeeded, just couldn't fetch the display name.
    }
  }, []);

  const schedulePoll = useCallback(
    (code: DeviceCodeResponse, intervalSec: number) => {
      clearPoll();
      pollTimer.current = setTimeout(async () => {
        if (cancelled.current) return;
        try {
          const result = await pollDeviceToken(clientId!, code.device_code);
          if (cancelled.current) return;
          switch (result.status) {
            case 'authorized':
              await finishWithToken(result.accessToken);
              break;
            case 'authorization_pending':
              setStatus('polling');
              schedulePoll(code, intervalSec);
              break;
            case 'slow_down':
              setStatus('polling');
              schedulePoll(code, result.intervalSec);
              break;
            case 'expired_token':
              setStatus('error');
              setError('That code expired before it was entered. Try connecting again.');
              break;
            case 'access_denied':
              setStatus('error');
              setError('GitHub sign-in was denied.');
              break;
            case 'error':
              setStatus('error');
              setError(result.message);
              break;
          }
        } catch (err) {
          if (cancelled.current) return;
          setStatus('error');
          setError(err instanceof Error ? err.message : 'Could not reach GitHub.');
        }
      }, intervalSec * 1000);
    },
    [clientId, clearPoll, finishWithToken]
  );

  const startLogin = useCallback(async () => {
    if (!clientId) {
      setStatus('error');
      setError('GitHub sign-in is not configured for this build.');
      return;
    }
    cancelled.current = false;
    setError(null);
    try {
      const code = await requestDeviceCode(clientId);
      setDeviceCode(code);
      setStatus('awaiting_code');
      schedulePoll(code, code.interval);
    } catch (err) {
      setStatus('error');
      setError(err instanceof GithubApiError ? err.message : 'Could not start GitHub sign-in.');
    }
  }, [clientId, schedulePoll]);

  const cancelLogin = useCallback(() => {
    cancelled.current = true;
    clearPoll();
    setStatus(token ? 'authorized' : 'idle');
    setDeviceCode(null);
  }, [clearPoll, token]);

  const logout = useCallback(async () => {
    cancelled.current = true;
    clearPoll();
    await setSecret('autometa_github_token', '');
    setToken(null);
    setUsername(null);
    setStatus('idle');
    setDeviceCode(null);
    setError(null);
  }, [clearPoll]);

  return { token, username, status, deviceCode, error, startLogin, cancelLogin, logout };
}

export type UseGithubAuth = ReturnType<typeof useGithubAuth>;
