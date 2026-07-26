import React from 'react';
import { Download, RefreshCw, CheckCircle2, AlertCircle, Sparkles, ShieldCheck, X } from 'lucide-react';
import { Button } from '@autometa/ui';
import type { Update } from '@tauri-apps/plugin-updater';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error';

export interface UpdateProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

interface AutoUpdaterModalProps {
  isOpen: boolean;
  onClose: () => void;
  update: Update | null;
  status: UpdateStatus;
  errorMessage?: string;
  progress: UpdateProgress;
  onCheckForUpdates: () => Promise<void>;
  onDownloadAndInstall: () => Promise<void>;
  onRelaunch: () => Promise<void>;
  currentVersion: string;
}

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const AutoUpdaterModal: React.FC<AutoUpdaterModalProps> = ({
  isOpen,
  onClose,
  update,
  status,
  errorMessage,
  progress,
  onCheckForUpdates,
  onDownloadAndInstall,
  onRelaunch,
  currentVersion,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg overflow-hidden border border-white/10 rounded-2xl bg-[#0f1117] text-white shadow-2xl">
        {/* Header decoration */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#00e5a3] via-blue-500 to-purple-600" />
        
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#00e5a3]/10 text-[#00e5a3] border border-[#00e5a3]/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-wide text-white">Application Updater</h2>
              <p className="text-xs text-gray-400">Autometa Desktop • Current v{currentVersion}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={status === 'downloading'}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {status === 'checking' && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
              <RefreshCw className="w-10 h-10 text-[#00e5a3] animate-spin" />
              <p className="text-sm font-medium text-gray-300">Checking for available updates...</p>
            </div>
          )}

          {status === 'up-to-date' && (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">You're up to date!</h3>
                <p className="text-xs text-gray-400 mt-1">Autometa v{currentVersion} is currently the latest version.</p>
              </div>
            </div>
          )}

          {status === 'available' && update && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#00e5a3]">New Version Available</span>
                  <div className="text-lg font-bold text-white mt-0.5">v{update.version}</div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified Release
                </div>
              </div>

              {update.body && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-gray-400">Release Notes</label>
                  <div className="max-h-48 overflow-y-auto p-3 text-xs font-mono text-gray-300 bg-black/50 border border-white/10 rounded-xl whitespace-pre-wrap leading-relaxed">
                    {update.body}
                  </div>
                </div>
              )}
            </div>
          )}

          {status === 'downloading' && (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-gray-300">
                  <Download className="w-4 h-4 text-[#00e5a3] animate-bounce" />
                  Downloading update payload...
                </span>
                <span className="font-mono text-[#00e5a3]">{progress.percentage}%</span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-3 bg-black/60 border border-white/10 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-[#00e5a3] to-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] font-mono text-gray-400">
                <span>{formatBytes(progress.downloaded)} downloaded</span>
                <span>{progress.total > 0 ? formatBytes(progress.total) : 'Calculating...'}</span>
              </div>
            </div>
          )}

          {status === 'ready' && (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <div className="p-3 bg-[#00e5a3]/10 text-[#00e5a3] rounded-full border border-[#00e5a3]/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Update ready to install</h3>
                <p className="text-xs text-gray-400 mt-1">
                  The update has been downloaded and verified. Restart the app now to complete installation.
                </p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-red-400 text-sm font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Update Check Failed
              </div>
              <p className="text-xs text-red-300 font-mono break-words">
                {errorMessage || 'Unable to download or verify update package.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 p-4 bg-black/40 border-t border-white/10">
          {(status === 'idle' || status === 'up-to-date' || status === 'error') && (
            <>
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onClose}>
                Close
              </Button>
              <Button variant="primary" className="px-3 py-1.5 text-xs flex items-center gap-2" onClick={onCheckForUpdates}>
                <RefreshCw className="w-3.5 h-3.5" />
                Check Again
              </Button>
            </>
          )}

          {status === 'available' && (
            <>
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onClose}>
                Remind Me Later
              </Button>
              <Button variant="primary" className="px-3 py-1.5 text-xs flex items-center gap-2" onClick={onDownloadAndInstall}>
                <Download className="w-3.5 h-3.5" />
                Update Now
              </Button>
            </>
          )}

          {status === 'ready' && (
            <Button variant="primary" className="w-full px-3 py-1.5 text-xs flex items-center justify-center gap-2" onClick={onRelaunch}>
              <RefreshCw className="w-3.5 h-3.5" />
              Restart Application Now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
