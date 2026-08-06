import { Github, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@autometa/ui';
import type { UseGithubAuth } from '../hooks/useGithubAuth';

interface GitHubAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  auth: UseGithubAuth;
}

/** GitHub sign-in via OAuth Device Flow — same shell convention as ProjectsModal. */
export const GitHubAuthModal = ({ isOpen, onClose, auth }: GitHubAuthModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b1220] border border-white/5 max-w-md w-full rounded-2xl p-6 flex flex-col gap-6 shadow-2xl" role="dialog" aria-label="Connect GitHub">
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <h3 className="font-extrabold text-sm tracking-widest text-slate-100 uppercase flex items-center gap-2">
            <Github className="w-4 h-4 text-[#00e5a3]" /> GitHub
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer text-sm">
            CLOSE
          </button>
        </div>

        {auth.status === 'idle' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-400">
              Connect your GitHub account to browse and submit Classroom assignments from inside Autometa.
            </p>
            <Button onClick={() => auth.startLogin()} className="flex items-center justify-center gap-2">
              <Github className="w-4 h-4" /> Connect GitHub
            </Button>
          </div>
        )}

        {(auth.status === 'awaiting_code' || auth.status === 'polling') && auth.deviceCode && (
          <div className="flex flex-col gap-3 items-center text-center">
            <p className="text-xs text-slate-400">
              Enter this code at{' '}
              <a
                href={auth.deviceCode.verification_uri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00e5a3] hover:underline inline-flex items-center gap-1"
              >
                {auth.deviceCode.verification_uri.replace(/^https?:\/\//, '')} <ExternalLink className="w-3 h-3" />
              </a>
            </p>
            <div className="text-2xl font-mono font-bold tracking-[0.3em] text-white bg-black/40 border border-white/10 rounded-lg px-4 py-3 w-full">
              {auth.deviceCode.user_code}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for authorization…
            </div>
            <Button variant="secondary" onClick={auth.cancelLogin} className="w-full">
              Cancel
            </Button>
          </div>
        )}

        {auth.status === 'authorized' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-300">
              Connected as <span className="font-bold text-[#00e5a3]">{auth.username ?? 'GitHub user'}</span>
            </p>
            <Button variant="secondary" onClick={auth.logout} className="w-full">
              Disconnect
            </Button>
          </div>
        )}

        {auth.status === 'error' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[var(--color-rose,#f43f5e)]">{auth.error ?? 'Something went wrong.'}</p>
            <Button onClick={() => auth.startLogin()} className="w-full">
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
