import { useState, useEffect, useCallback } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import type { UpdateStatus, UpdateProgress } from '../components/AutoUpdaterModal';

export const CURRENT_APP_VERSION = '0.2.3';

export function useAutoUpdater() {
  const [isOpen, setIsOpen] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [progress, setProgress] = useState<UpdateProgress>({
    downloaded: 0,
    total: 0,
    percentage: 0,
  });

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const checkForUpdates = useCallback(async (manual = false) => {
    if (!isTauri) {
      if (manual) {
        setIsOpen(true);
        setStatus('up-to-date');
      }
      return;
    }

    try {
      setStatus('checking');
      setErrorMessage(undefined);
      if (manual) setIsOpen(true);

      const { check: checkTauriUpdate } = await import('@tauri-apps/plugin-updater');
      const foundUpdate = await checkTauriUpdate();

      if (foundUpdate) {
        setUpdate(foundUpdate);
        setStatus('available');
        setIsOpen(true);
      } else {
        setUpdate(null);
        setStatus('up-to-date');
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
      if (manual) setIsOpen(true);
    }
  }, [isTauri]);

  const downloadAndInstall = useCallback(async () => {
    if (!update) return;

    try {
      setStatus('downloading');
      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            totalBytes = event.data.contentLength || 0;
            setProgress({ downloaded: 0, total: totalBytes, percentage: 0 });
            break;
          case 'Progress':
            downloadedBytes += event.data.chunkLength;
            const pct = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
            setProgress({ downloaded: downloadedBytes, total: totalBytes, percentage: pct });
            break;
          case 'Finished':
            setProgress({ downloaded: totalBytes || downloadedBytes, total: totalBytes || downloadedBytes, percentage: 100 });
            break;
        }
      });

      setStatus('ready');
    } catch (err) {
      console.error('Failed to download update:', err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [update]);

  const relaunchApp = useCallback(async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      console.error('Failed to restart application:', err);
      setErrorMessage('Could not automatically restart. Please close and re-open Autometa.');
      setStatus('error');
    }
  }, []);

  // Automatic check on application launch when running inside desktop shell
  useEffect(() => {
    if (isTauri) {
      // Delay slightly on startup to let app render first
      const timer = setTimeout(() => {
        checkForUpdates(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isTauri, checkForUpdates]);

  return {
    isTauri,
    isOpen,
    setIsOpen,
    update,
    status,
    errorMessage,
    progress,
    checkForUpdates: () => checkForUpdates(true),
    downloadAndInstall,
    relaunchApp,
    currentVersion: CURRENT_APP_VERSION,
  };
}
