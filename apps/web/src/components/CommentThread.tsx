import { useEffect, useState } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@autometa/ui';
import type { UseComments } from '../hooks/useComments';
import type { UseProfile } from '../hooks/useProfile';

interface CommentThreadProps {
  comments: UseComments;
  profile: UseProfile;
}

/** Small comment thread: teacher feedback on an attempt, or discussion on a shared project. */
export const CommentThread = ({ comments, profile }: CommentThreadProps) => {
  const [body, setBody] = useState('');

  useEffect(() => {
    comments.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.activeProfileId || !body.trim()) return;
    await comments.addComment(profile.activeProfileId, body.trim());
    setBody('');
  };

  const nameFor = (profileId: number) => profile.profiles.find(p => p.id === profileId)?.name ?? `Profile #${profileId}`;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
        <MessageSquare className="w-3.5 h-3.5" /> Comments ({comments.comments.length})
      </span>
      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
        {comments.comments.map(c => (
          <div key={c.id} className="bg-black/30 border border-white/5 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold text-[#00e5a3]">{nameFor(c.profile_id)}</p>
              <p className="text-xs text-slate-300 leading-relaxed">{c.body}</p>
            </div>
            <button
              onClick={() => comments.removeComment(c.id)}
              className="text-slate-500 hover:text-red-400 bg-transparent border-none cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5a3]/50 rounded"
              aria-label="Delete comment"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {comments.comments.length === 0 && <p className="text-xs text-slate-500">No comments yet.</p>}
      </div>
      {profile.activeProfileId !== null && (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/40"
          />
          <Button type="submit" className="!bg-white/5 !text-[#00e5a3] !text-xs !py-1.5 !px-3">
            Post
          </Button>
        </form>
      )}
    </div>
  );
};
