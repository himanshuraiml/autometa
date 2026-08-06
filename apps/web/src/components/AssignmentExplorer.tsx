import { useState } from 'react';
import { Github, Plus, RefreshCw, X, ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@autometa/ui';
import type { UseGithubAuth } from '../hooks/useGithubAuth';
import type { UseAssignments, TrackedRepoState } from '../hooks/useAssignments';
import type { TaskAssignment } from '@autometa/github-service';

interface AssignmentExplorerProps {
  auth: UseGithubAuth;
  assignments: UseAssignments;
  onOpenInEditor: (assignment: TaskAssignment) => void;
  onConnectGithub: () => void;
}

const AssignmentCard = ({
  tracked,
  onOpenInEditor,
  onRemove,
}: {
  tracked: TrackedRepoState;
  onOpenInEditor: (assignment: TaskAssignment) => void;
  onRemove: (ownerRepo: string) => void;
}) => (
  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col gap-2">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[10px] text-slate-500 font-mono truncate">{tracked.ownerRepo}</div>
        {tracked.status === 'ready' && tracked.assignment && (
          <h3 className="text-sm font-bold text-white truncate">{tracked.assignment.frontmatter.title}</h3>
        )}
      </div>
      <button
        onClick={() => onRemove(tracked.ownerRepo)}
        className="text-slate-500 hover:text-white bg-transparent border-none cursor-pointer p-1 shrink-0"
        aria-label={`Stop tracking ${tracked.ownerRepo}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>

    {tracked.status === 'loading' && (
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
      </div>
    )}

    {tracked.status === 'error' && (
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-rose,#f43f5e)]">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {tracked.error}
      </div>
    )}

    {tracked.status === 'ready' && tracked.assignment && (
      <>
        <p className="text-[11px] text-slate-400">{tracked.assignment.frontmatter.course}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="bg-[#00e5a3]/10 text-[#00e5a3] border border-[#00e5a3]/20 text-[10px] font-bold px-2 py-0.5 rounded">
            {tracked.assignment.frontmatter.type}
          </span>
          <span className="text-[10px] text-slate-500">Max {tracked.assignment.frontmatter.max_states} states</span>
        </div>
        <Button onClick={() => onOpenInEditor(tracked.assignment!)} className="mt-1 flex items-center justify-center gap-1.5 !text-xs">
          Open in Editor <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </>
    )}
  </div>
);

/** Full-page view for browsing GitHub Classroom assignment repos. */
export const AssignmentExplorer = ({ auth, assignments, onOpenInEditor, onConnectGithub }: AssignmentExplorerProps) => {
  const [newRepo, setNewRepo] = useState('');

  const handleAdd = () => {
    if (!newRepo.trim()) return;
    assignments.addRepo(newRepo.trim());
    setNewRepo('');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#050811]">
      <header className="h-16 w-full bg-[#050811] flex items-center justify-between px-8 border-b border-white/10 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <Github className="w-5 h-5 text-[#00e5a3]" />
          <span className="text-sm font-black uppercase tracking-widest text-slate-100">Assignments</span>
        </div>
        {auth.status === 'authorized' ? (
          <span className="text-[11px] text-slate-400">
            Connected as <span className="text-[#00e5a3] font-bold">{auth.username ?? 'GitHub user'}</span>
          </span>
        ) : (
          <Button onClick={onConnectGithub} variant="secondary" className="!text-xs flex items-center gap-1.5">
            <Github className="w-3.5 h-3.5" /> Connect GitHub
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        {auth.status !== 'authorized' ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
            <Github className="w-8 h-8 text-slate-600" />
            <p className="text-xs text-slate-400 max-w-xs">
              Connect your GitHub account to browse Classroom assignment repos and submit solutions from Autometa.
            </p>
            <Button onClick={onConnectGithub} className="flex items-center gap-2">
              <Github className="w-4 h-4" /> Connect GitHub
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-3xl">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Add Assignment Repo</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRepo}
                  onChange={(e) => setNewRepo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="owner/repo — from your Classroom-generated repo URL"
                  aria-label="GitHub owner/repo"
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/20"
                />
                <Button onClick={handleAdd} className="flex items-center gap-1.5 !text-xs shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
                <Button variant="secondary" onClick={() => assignments.refresh()} className="flex items-center gap-1.5 !text-xs shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </Button>
              </div>
            </div>

            {assignments.tracked.length === 0 ? (
              <p className="text-xs text-slate-500">No assignment repos tracked yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {assignments.tracked.map((tracked) => (
                  <AssignmentCard
                    key={tracked.ownerRepo}
                    tracked={tracked}
                    onOpenInEditor={onOpenInEditor}
                    onRemove={assignments.removeRepo}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
