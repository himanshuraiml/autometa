import { Github, Send, X } from 'lucide-react';
import { Button } from '@autometa/ui';
import type { TaskAssignment } from '@autometa/github-service';

interface TaskWorkspaceHeaderProps {
  assignment: TaskAssignment;
  onSubmit: () => void;
  onExit: () => void;
}

/** Banner shown above the canvas while an assignment task is active. */
export const TaskWorkspaceHeader = ({ assignment, onSubmit, onExit }: TaskWorkspaceHeaderProps) => {
  const { frontmatter } = assignment;

  return (
    <div className="h-11 shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex items-center justify-between px-6 text-[var(--text-main)]">
      <div className="flex items-center gap-3 min-w-0">
        <Github className="w-3.5 h-3.5 text-[var(--color-ui-accent)] shrink-0" />
        <span className="text-xs font-bold truncate">{frontmatter.title}</span>
        <span className="text-[10px] text-[var(--text-muted)] truncate hidden sm:inline">{frontmatter.course}</span>
        <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
          {frontmatter.type} · Max {frontmatter.max_states} states · {frontmatter.allowed_alphabet.join(', ')}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button onClick={onSubmit} className="!px-3 !py-1.5 text-xs flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5" /> Submit
        </Button>
        <button
          onClick={onExit}
          title="Exit assignment (canvas is left as-is)"
          className="text-[var(--text-muted)] hover:text-[var(--text-main)] bg-transparent border-none cursor-pointer p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
