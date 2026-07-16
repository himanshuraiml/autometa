import { useMemo, useState } from 'react';
import { Columns2, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { simulatePDAAllBranches } from '@autometa/simulation-engine';
import type { Automaton, SimulationEvent, PdaAcceptanceMode, PdaBranchResult } from '@autometa/simulation-engine';
import { exportSimulationTrace } from '../utils/exportUtils';
import { DiffToken } from './DiffToken';

const MAX_VISIBLE_BRANCHES = 100;

/** Diffs the final stack state of two branches, depth-aligned from the top of the stack. */
const StackCompareView = ({ a, b }: { a: PdaBranchResult; b: PdaBranchResult }) => {
  const lastStack = (branch: PdaBranchResult): string[] => {
    for (let i = branch.events.length - 1; i >= 0; i--) {
      const stack = branch.events[i].stack;
      if (stack) return stack;
    }
    return [];
  };
  const stackA = lastStack(a), stackB = lastStack(b);
  const depth = Math.max(stackA.length, stackB.length);
  const cells = Array.from({ length: depth }, (_, i) => i);

  return (
    <div className="flex flex-col gap-1.5 p-2 rounded-lg border border-white/10 bg-black/30 mb-2">
      <span className="text-[9px] text-slate-500">Final stack comparison (top of stack first)</span>
      {[{ label: 'A', stack: stackA }, { label: 'B', stack: stackB }].map(({ label, stack }) => (
        <div key={label} className="flex items-center gap-1 overflow-x-auto">
          <span className="text-[9px] text-slate-500 w-4 shrink-0">{label}</span>
          {cells.map(i => <DiffToken key={i} value={stack[i] ?? '—'} differs={(stackA[i] ?? '') !== (stackB[i] ?? '')} />)}
        </div>
      ))}
    </div>
  );
};

const BranchRow = ({
  branch, index, compareMode, isSelectedForCompare, onToggleCompare, automatonType,
}: { branch: PdaBranchResult; index: number; compareMode: boolean; isSelectedForCompare: boolean; onToggleCompare: (i: number) => void; automatonType: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`rounded px-1 py-1 text-[10px] ${isSelectedForCompare ? 'bg-[#00e5a3]/15' : ''}`}>
      <div className="flex items-center gap-1.5">
        {compareMode && <input type="checkbox" readOnly checked={isSelectedForCompare} onClick={() => onToggleCompare(index)} className="accent-[#00e5a3] cursor-pointer" />}
        <button onClick={() => setIsExpanded(e => !e)} className="flex items-center gap-1 flex-1 text-left bg-transparent border-none cursor-pointer text-slate-300 hover:text-white">
          {isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
          <span className={`px-1.5 py-0.5 rounded font-bold ${branch.accepted ? 'bg-[#00e5a3]/20 text-[#00e5a3]' : 'bg-red-500/15 text-red-300'}`}>
            {branch.accepted ? 'Accept' : 'Reject'}
          </span>
          <span className="text-slate-500">branch #{index} · {branch.events.length} steps</span>
        </button>
        <button type="button" onClick={() => exportSimulationTrace(branch.events, automatonType, 'json')} title="Export this branch's trace" className="p-0.5 rounded border-none cursor-pointer bg-transparent text-slate-500 hover:text-white shrink-0">
          <Download className="w-3 h-3" />
        </button>
      </div>
      {isExpanded && (
        <div className="ml-4 mt-1 flex flex-col gap-0.5 max-h-32 overflow-y-auto custom-scrollbar border-l border-white/10 pl-2">
          {branch.events.map((event, i) => (
            <span key={i} className="font-mono text-slate-400">#{i} · stack [{(event.stack ?? []).join(',')}] · {event.event}</span>
          ))}
        </div>
      )}
    </div>
  );
};

interface PdaBranchesProps {
  getAutomatonData: () => Automaton;
  inputString: string;
  stackSymbol: string;
  acceptanceMode: PdaAcceptanceMode;
  simulationEvents: SimulationEvent[];
  automatonType: string;
}

/** Read-only view onto every explored PDA branch (see simulatePDAAllBranches) — doesn't affect the live canvas animation, which keeps using simulatePDA's single best path. */
export const PdaBranches = ({ getAutomatonData, inputString, stackSymbol, acceptanceMode, simulationEvents, automatonType }: PdaBranchesProps) => {
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<number[]>([]);

  // Recomputes only when a new run starts (simulationEvents gets a fresh array reference then),
  // not on every animation-frame re-render while the existing run is playing back.
  const branches = useMemo(
    () => simulatePDAAllBranches(getAutomatonData(), inputString, stackSymbol || 'Z', acceptanceMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [simulationEvents]
  );

  const toggleCompare = (index: number) => {
    setCompareSelection(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      if (prev.length < 2) return [...prev, index];
      return [prev[1], index];
    });
  };

  const visible = branches.slice(0, MAX_VISIBLE_BRANCHES);
  const compareBranches = compareSelection.length === 2 ? compareSelection.map(i => branches[i]) as [PdaBranchResult, PdaBranchResult] : null;

  return (
    <div className="w-full mb-3 rounded-xl border border-white/10 bg-[#0b121e]/95 p-2 shadow-xl max-h-64 overflow-y-auto">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Explored branches ({branches.length}{branches.length > MAX_VISIBLE_BRANCHES ? `, showing ${MAX_VISIBLE_BRANCHES}` : ''})
        </span>
        <button type="button" onClick={() => setCompareMode(m => !m)} aria-pressed={compareMode} title="Compare two branches' final stacks" className={`p-1 rounded border-none cursor-pointer ${compareMode ? 'bg-[#00e5a3]/20 text-[#00e5a3]' : 'bg-transparent text-slate-500 hover:text-white'}`}>
          <Columns2 className="w-3 h-3" />
        </button>
      </div>
      {compareMode && !compareBranches && <p className="px-1 pb-1.5 text-[9px] text-slate-500">Check two branches below to diff their final stacks.</p>}
      {compareBranches && <StackCompareView a={compareBranches[0]} b={compareBranches[1]} />}
      <div className="flex flex-col gap-0.5">
        {visible.map((branch, index) => (
          <BranchRow key={index} branch={branch} index={index} compareMode={compareMode} isSelectedForCompare={compareSelection.includes(index)} onToggleCompare={toggleCompare} automatonType={automatonType} />
        ))}
      </div>
    </div>
  );
};
