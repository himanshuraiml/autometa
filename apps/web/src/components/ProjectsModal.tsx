import { Button } from '@autometa/ui';
import type { ProjectDTO } from '../utils/apiClient';

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  saveName: string;
  onSaveNameChange: (name: string) => void;
  onSave: () => void;
  projects: ProjectDTO[];
  onSelectProject: (project: ProjectDTO) => void;
  onRefresh: () => void;
}

/** Save-to-database / load-from-database modal dialog. */
export const ProjectsModal = ({
  isOpen, onClose, saveName, onSaveNameChange, onSave, projects, onSelectProject, onRefresh,
}: ProjectsModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b1220] border border-white/5 max-w-md w-full rounded-2xl p-6 flex flex-col gap-6 shadow-2xl" role="dialog" aria-label="Database projects">
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <h3 className="font-extrabold text-sm tracking-widest text-slate-100 uppercase">Database Projects</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer text-sm">
            CLOSE
          </button>
        </div>

        {/* Save Section */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-slate-400 uppercase font-bold">Save Current Canvas</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => onSaveNameChange(e.target.value)}
              aria-label="Project name"
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/20 transition-all"
            />
            <Button onClick={onSave} className="!bg-[#00e5a3] !text-black !font-bold">Save DB</Button>
          </div>
        </div>

        {/* Load Section */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-slate-400 uppercase font-bold">Load Saved Project</span>
          <div className="max-h-48 overflow-y-auto border border-white/5 rounded-lg flex flex-col bg-black/20">
            {projects.length > 0 ? (
              projects.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => onSelectProject(proj)}
                  className="text-left px-4 py-3 hover:bg-white/5 transition-all border-b border-white/5 flex justify-between items-center text-sm bg-transparent border-none cursor-pointer w-full focus:outline-none focus:bg-white/5"
                >
                  <div>
                    <div className="font-bold text-slate-200">{proj.name}</div>
                    <div className="text-[10px] text-slate-500">Created: {new Date(proj.created_at).toLocaleString()}</div>
                  </div>
                  <span className="bg-[#00e5a3]/10 text-[#00e5a3] border border-[#00e5a3]/20 text-[10px] font-bold px-2 py-0.5 rounded">
                    {proj.automaton_type}
                  </span>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-slate-500">
                No projects found in database.
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={onRefresh} className="mt-2 text-center w-full">
            Refresh Database Projects List
          </Button>
        </div>
      </div>
    </div>
  );
};
