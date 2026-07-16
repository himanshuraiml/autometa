import { memo, useState } from 'react';
import { Columns2, Download } from 'lucide-react';
import type { SimulationEvent } from '@autometa/simulation-engine';
import { exportSimulationTrace } from '../utils/exportUtils';
import { DiffToken } from './DiffToken';

/** Long TM traces (up to simulateTuringMachine's maxSteps=1000) shouldn't force 1000 unmemoized DOM rows on every step. */
const MAX_VISIBLE_ROWS = 150;

interface TapeHistoryRowProps {
  index: number;
  event: SimulationEvent;
  isCurrent: boolean;
  compareMode: boolean;
  isSelectedForCompare: boolean;
  onSelect: (eventIndex: number) => void;
  onToggleCompare: (eventIndex: number) => void;
}

const headLabel = (event: SimulationEvent): string =>
  event.headIndices ? `[${event.headIndices.join(',')}]` : String(event.headIndex ?? 0);

const TapeHistoryRow = memo(({ index, event, isCurrent, compareMode, isSelectedForCompare, onSelect, onToggleCompare }: TapeHistoryRowProps) => (
  <button
    onClick={() => (compareMode ? onToggleCompare(index) : onSelect(index))}
    aria-current={isCurrent ? 'step' : undefined}
    aria-pressed={compareMode ? isSelectedForCompare : undefined}
    className={`w-full text-left rounded px-2 py-1.5 text-[10px] font-mono border-none cursor-pointer flex items-center gap-1.5 ${
      isSelectedForCompare ? 'bg-[#00e5a3]/20 text-white' : isCurrent ? 'bg-[#8b5cf6]/25 text-white' : 'bg-transparent text-slate-400 hover:bg-white/5'
    }`}
  >
    {compareMode && <input type="checkbox" readOnly checked={isSelectedForCompare} className="accent-[#00e5a3]" />}
    #{index} · head {headLabel(event)} · {event.event}
  </button>
));
TapeHistoryRow.displayName = 'TapeHistoryRow';

/** Symbol-by-symbol diff of two tape snapshots (single- or multi-tape), aligned by absolute tape index. */
const TapeCompareView = ({ a, b, blankSymbol }: { a: SimulationEvent; b: SimulationEvent; blankSymbol: string }) => {
  const tapesOf = (e: SimulationEvent) => e.tapes ?? (e.tape ? [e.tape] : []);
  const headsOf = (e: SimulationEvent) => e.headIndices ?? [e.headIndex ?? 0];
  const tapesA = tapesOf(a), tapesB = tapesOf(b);
  const headsA = headsOf(a), headsB = headsOf(b);
  const tapeCount = Math.max(tapesA.length, tapesB.length);

  return (
    <div className="flex flex-col gap-2 p-2 rounded-lg border border-white/10 bg-black/30 mb-2">
      {Array.from({ length: tapeCount }, (_, tapeIdx) => {
        const ta = tapesA[tapeIdx] ?? {};
        const tb = tapesB[tapeIdx] ?? {};
        const keys = [...new Set([...Object.keys(ta), ...Object.keys(tb)].map(Number))].sort((x, y) => x - y);
        const minKey = Math.min(0, ...keys), maxKey = Math.max(keys.length ? Math.max(...keys) : 0, headsA[tapeIdx] ?? 0, headsB[tapeIdx] ?? 0);
        const range: number[] = [];
        for (let i = minKey; i <= maxKey; i++) range.push(i);
        return (
          <div key={tapeIdx} className="flex flex-col gap-1">
            {tapeCount > 1 && <span className="text-[9px] text-slate-500">Tape {tapeIdx}</span>}
            {[{ label: 'A', tape: ta }, { label: 'B', tape: tb }].map(({ label, tape }) => (
              <div key={label} className="flex items-center gap-1 overflow-x-auto">
                <span className="text-[9px] text-slate-500 w-4 shrink-0">{label}</span>
                {range.map(key => (
                  <DiffToken key={key} value={tape[key] ?? blankSymbol} differs={(ta[key] ?? blankSymbol) !== (tb[key] ?? blankSymbol)} />
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export const TapeHistory = ({ events, currentStep, automatonType, blankSymbol = '_', onSelect }: { events: SimulationEvent[]; currentStep: number; automatonType: string; blankSymbol?: string; onSelect: (eventIndex: number) => void }) => {
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<number[]>([]);

  const snapshots = events.map((event, index) => ({ event, index })).filter(({ event }) => event.tape !== undefined || event.tapes !== undefined);
  if (!snapshots.length) return null;

  const toggleCompare = (index: number) => {
    setCompareSelection(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      if (prev.length < 2) return [...prev, index];
      return [prev[1], index];
    });
  };

  const currentIdx = snapshots.findIndex(({ event }) => event.symbolIndex === currentStep);
  let visible = snapshots;
  let truncated = 0;
  if (snapshots.length > MAX_VISIBLE_ROWS) {
    const center = currentIdx >= 0 ? currentIdx : 0;
    const half = Math.floor(MAX_VISIBLE_ROWS / 2);
    const start = Math.max(0, Math.min(center - half, snapshots.length - MAX_VISIBLE_ROWS));
    visible = snapshots.slice(start, start + MAX_VISIBLE_ROWS);
    truncated = snapshots.length - MAX_VISIBLE_ROWS;
  }

  const compareEvents = compareSelection.length === 2 ? compareSelection.map(i => events[i]) as [SimulationEvent, SimulationEvent] : null;

  return (
    <div className={`absolute right-4 top-4 z-20 ${compareMode ? 'w-80' : 'w-48'} max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#0b121e]/95 p-2 shadow-xl transition-all`}>
      <div className="flex items-center justify-between px-2 pb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Tape history{truncated > 0 && <span className="normal-case font-normal text-slate-500"> ({visible.length}/{snapshots.length})</span>}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setCompareMode(m => !m)} aria-pressed={compareMode} title="Compare two steps" className={`p-1 rounded border-none cursor-pointer ${compareMode ? 'bg-[#00e5a3]/20 text-[#00e5a3]' : 'bg-transparent text-slate-500 hover:text-white'}`}>
            <Columns2 className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => exportSimulationTrace(events, automatonType, 'json')} title="Export trace as JSON" className="p-1 rounded border-none cursor-pointer bg-transparent text-slate-500 hover:text-white">
            <Download className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => exportSimulationTrace(events, automatonType, 'csv')} title="Export trace as CSV" className="p-1 rounded border-none cursor-pointer bg-transparent text-slate-500 hover:text-white text-[9px] font-bold">
            CSV
          </button>
        </div>
      </div>
      {compareMode && (
        <p className="px-2 pb-1.5 text-[9px] text-slate-500">Select two steps below to diff their tape contents.</p>
      )}
      {compareEvents && <TapeCompareView a={compareEvents[0]} b={compareEvents[1]} blankSymbol={blankSymbol} />}
      {visible.map(({ event, index }) => (
        <TapeHistoryRow
          key={index}
          index={index}
          event={event}
          isCurrent={event.symbolIndex === currentStep}
          compareMode={compareMode}
          isSelectedForCompare={compareSelection.includes(index)}
          onSelect={onSelect}
          onToggleCompare={toggleCompare}
        />
      ))}
    </div>
  );
};
