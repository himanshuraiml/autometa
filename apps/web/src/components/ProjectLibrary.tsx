import React, { useEffect, useRef, useState } from 'react';
import { Library, Star, Copy, Share2, Upload, History, Tag as TagIcon, Trash2 } from 'lucide-react';
import { Button } from '@autometa/ui';
import { createProject } from '../utils/apiClient';
import type { ProjectDTO } from '../utils/apiClient';
import { createSharePackage, downloadSharePackage, parseSharePackage, READ_ONLY_TAG } from '../utils/shareFormat';
import type { UseProjectLibrary } from '../hooks/useProjectLibrary';
import type { UseProfile } from '../hooks/useProfile';
import { useComments } from '../hooks/useComments';
import { CommentThread } from './CommentThread';
import { useToast } from './ToastProvider';

interface ProjectLibraryProps {
  library: UseProjectLibrary;
  profile: UseProfile;
  onOpenProject: (project: ProjectDTO) => void;
}

type Tab = 'public' | 'mine' | 'favorites';

const ProjectCard = ({
  project,
  library,
  profile,
  onOpenProject,
}: {
  project: ProjectDTO;
  library: UseProjectLibrary;
  profile: UseProfile;
  onOpenProject: (project: ProjectDTO) => void;
}) => {
  const [expanded, setExpanded] = useState<'versions' | 'comments' | null>(null);
  const [tagInput, setTagInput] = useState('');
  const tags: string[] = JSON.parse(project.tags_json || '[]');
  const versions = library.versionsByProject[project.id];
  const comments = useComments({ project_id: project.id });
  const isReadOnly = tags.includes(READ_ONLY_TAG);

  const handleExpandVersions = async () => {
    if (expanded === 'versions') {
      setExpanded(null);
      return;
    }
    setExpanded('versions');
    if (!versions) await library.loadVersions(project.id);
  };

  const handleShare = async () => {
    const readOnly = window.confirm('Share as read-only? Click Cancel to share as editable.');
    const versionList = versions ?? (await library.loadVersions(project.id));
    downloadSharePackage(createSharePackage(project, versionList, readOnly));
  };

  const handleAddTag = async () => {
    const tag = tagInput.trim();
    if (!tag || tags.includes(tag)) return;
    await library.setTags(project.id, [...tags, tag]);
    setTagInput('');
  };

  const handleRemoveTag = async (tag: string) => {
    await library.setTags(project.id, tags.filter(t => t !== tag));
  };

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            {project.name}
            {isReadOnly && <span className="text-[9px] font-black uppercase tracking-widest text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-full">read-only</span>}
          </h3>
          <p className="text-[10px] text-slate-500">{project.automaton_type} · {project.visibility}</p>
        </div>
        <button
          onClick={() => library.toggleFavorite(project)}
          aria-label={project.is_favorite ? 'Unfavorite' : 'Favorite'}
          className="bg-transparent border-none cursor-pointer text-slate-400 hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5a3]/50 rounded"
        >
          <Star className={`w-4 h-4 ${project.is_favorite ? 'fill-amber-300 text-amber-300' : ''}`} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {tags.filter(t => t !== READ_ONLY_TAG).map(tag => (
          <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-slate-300 flex items-center gap-1">
            {tag}
            <button onClick={() => handleRemoveTag(tag)} className="bg-transparent border-none cursor-pointer text-slate-500 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5a3]/50 rounded" aria-label={`Remove tag ${tag}`}>
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
          placeholder="+ tag"
          className="w-16 bg-transparent border-b border-white/10 text-[10px] text-white focus:outline-none focus:border-[#00e5a3]"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-1">
        <Button onClick={() => onOpenProject(project)} className="!bg-[#00e5a3] !text-black !text-xs !py-1.5 !px-3 !font-bold">
          Open
        </Button>
        <Button onClick={() => library.clone(project.id, profile.activeProfileId ?? undefined)} className="!bg-white/5 !text-slate-200 !text-xs !py-1.5 !px-3 flex items-center gap-1">
          <Copy className="w-3.5 h-3.5" /> Clone
        </Button>
        <Button onClick={() => library.setVisibility(project.id, project.visibility === 'public' ? 'private' : 'public')} className="!bg-white/5 !text-slate-200 !text-xs !py-1.5 !px-3">
          Make {project.visibility === 'public' ? 'Private' : 'Public'}
        </Button>
        <Button onClick={handleShare} className="!bg-white/5 !text-slate-200 !text-xs !py-1.5 !px-3 flex items-center gap-1">
          <Share2 className="w-3.5 h-3.5" /> Share
        </Button>
        <button onClick={handleExpandVersions} className="text-xs text-slate-400 hover:text-white bg-transparent border-none cursor-pointer flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5a3]/50 rounded">
          <History className="w-3.5 h-3.5" /> Versions
        </button>
        <button
          onClick={() => setExpanded(expanded === 'comments' ? null : 'comments')}
          className="text-xs text-slate-400 hover:text-white bg-transparent border-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5a3]/50 rounded"
        >
          Comments
        </button>
      </div>

      {expanded === 'versions' && (
        <div className="border-t border-white/5 pt-2 flex flex-col gap-1.5">
          {(versions ?? []).length === 0 && <p className="text-xs text-slate-500">No saved versions yet — use "Save Version" from the editor.</p>}
          {(versions ?? []).map(v => (
            <div key={v.id} className="flex items-center justify-between text-xs bg-black/20 rounded-lg px-2 py-1.5">
              <span className="text-slate-300">{v.label} <span className="text-slate-500">· {new Date(v.created_at).toLocaleString()}</span></span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenProject({ ...project, nodes_json: v.nodes_json, edges_json: v.edges_json, node_counter: v.node_counter })}
                  className="text-[#00e5a3] bg-transparent border-none cursor-pointer underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5a3]/50 rounded"
                >
                  Restore
                </button>
                <button onClick={() => library.removeVersion(project.id, v.id)} className="text-slate-500 hover:text-red-400 bg-transparent border-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5a3]/50 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {expanded === 'comments' && (
        <div className="border-t border-white/5 pt-2">
          <CommentThread comments={comments} profile={profile} />
        </div>
      )}
    </div>
  );
};

/** Phase 6 project library: browse public/private/favorite projects, tag, clone, and share. */
export const ProjectLibrary = ({ library, profile, onOpenProject }: ProjectLibraryProps) => {
  const [tab, setTab] = useState<Tab>('mine');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (tab === 'public') library.refresh({ visibility: 'public' });
    else if (tab === 'favorites') library.refresh({ is_favorite: true });
    else library.refresh(profile.activeProfileId !== null ? { owner_profile_id: profile.activeProfileId } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, profile.activeProfileId]);

  const handleImportShare = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const pkg = parseSharePackage(JSON.parse(e.target?.result as string));
        const tags = pkg.readOnly ? [READ_ONLY_TAG] : [];
        const created = await createProject({
          name: pkg.project.name,
          automaton_type: pkg.project.automaton_type,
          nodes_json: pkg.project.nodes_json,
          edges_json: pkg.project.edges_json,
          node_counter: pkg.project.node_counter,
          metadata_json: pkg.project.metadata_json,
          tags_json: JSON.stringify(tags),
          owner_profile_id: profile.activeProfileId ?? undefined,
        });
        library.refresh(tab === 'public' ? { visibility: 'public' } : tab === 'favorites' ? { is_favorite: true } : undefined);
        showToast(`Imported "${created.name}"${pkg.readOnly ? ' (read-only)' : ''} with ${pkg.versions.length} saved version(s) noted in the package.`, 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to import share package.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#050811]">
      <header className="h-16 w-full bg-[#050811] flex items-center justify-between px-8 border-b border-white/10 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <Library className="w-5 h-5 text-[#00e5a3]" />
          <span className="text-sm font-black uppercase tracking-widest text-slate-100">Project Library</span>
        </div>
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs glass-button text-gray-200 hover:text-white cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> Import Share Package
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportShare} className="hidden" />
        </label>
      </header>

      <nav className="flex items-center gap-1 px-8 pt-4 border-b border-white/5 shrink-0" role="tablist" aria-label="Project library sections">
        {(['mine', 'public', 'favorites'] as Tab[]).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg border-none cursor-pointer ${
              tab === t ? 'bg-white/5 text-[#00e5a3]' : 'text-slate-400 hover:text-white bg-transparent'
            }`}
          >
            {t === 'mine' ? 'My Projects' : t === 'public' ? 'Public' : 'Favorites'}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        {library.projects.length === 0 && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <TagIcon className="w-3.5 h-3.5" /> No projects here yet.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {library.projects.map(project => (
            <ProjectCard key={project.id} project={project} library={library} profile={profile} onOpenProject={onOpenProject} />
          ))}
        </div>
      </div>
    </div>
  );
};
