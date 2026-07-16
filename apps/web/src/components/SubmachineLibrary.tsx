import { useState } from 'react';
import { Blocks, Trash2, Pencil } from 'lucide-react';
import { listSubmachines, renameSubmachine, deleteSubmachine } from '../utils/submachineLibrary';
import type { Submachine } from '../utils/submachineLibrary';

const SubmachineRow = ({ submachine, onChange }: { submachine: Submachine; onChange: () => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(submachine.name);

  const commitRename = () => {
    if (draftName.trim() && draftName.trim() !== submachine.name) renameSubmachine(submachine.id, draftName.trim());
    setIsEditing(false);
    onChange();
  };

  return (
    <div className="p-3.5 rounded-xl border border-white/5 flex justify-between items-center bg-black/40">
      <div className="flex flex-col gap-0.5 max-w-[70%]">
        {isEditing ? (
          <input
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => e.key === 'Enter' && commitRename()}
            className="bg-black/60 border border-white/10 rounded px-1.5 py-0.5 text-xs text-white font-bold"
          />
        ) : (
          <span className="font-bold text-xs text-white">{submachine.name}</span>
        )}
        <p className="text-[10px] text-slate-400">
          {submachine.nodes.length} states · {submachine.edges.length} transitions · saved {new Date(submachine.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => setIsEditing(true)} aria-label={`Rename ${submachine.name}`} className="text-slate-400 hover:text-white transition-colors cursor-pointer border-none bg-transparent rounded p-1.5">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => { deleteSubmachine(submachine.id); onChange(); }} aria-label={`Delete ${submachine.name}`} className="text-slate-400 hover:text-red-400 transition-colors cursor-pointer border-none bg-transparent rounded p-1.5">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

const SubmachineGroup = ({ type, refreshKey, onChange }: { type: 'TM' | 'PDA'; refreshKey: number; onChange: () => void }) => {
  const submachines = listSubmachines(type);
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{type} fragments</h4>
      {submachines.length === 0 ? (
        <p className="text-[11px] text-slate-500">No {type} submachines saved yet — use "Save Canvas as Submachine" in the editor.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {submachines.map(sm => <SubmachineRow key={`${sm.id}-${refreshKey}`} submachine={sm} onChange={onChange} />)}
        </div>
      )}
    </div>
  );
};

/** Browses/renames/deletes saved TM/PDA submachines (see submachineLibrary.ts). Saving and inserting happen in the editor itself (EditorSidebar). */
export const SubmachineLibrary = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const onChange = () => setRefreshKey(k => k + 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center border-b border-white/10 pb-3">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <Blocks className="w-4 h-4 text-[#00e5a3]" /> Submachine Library
        </h3>
      </div>
      <p className="text-[11px] text-slate-500 -mt-2">
        Reusable TM/PDA diagram fragments. Save one from the editor's "Save Canvas as Submachine" button, then splice it into another machine via the selected transition's "Insert Submachine" picker.
      </p>
      <SubmachineGroup type="TM" refreshKey={refreshKey} onChange={onChange} />
      <SubmachineGroup type="PDA" refreshKey={refreshKey} onChange={onChange} />
    </div>
  );
};
