import React, { useEffect, useRef } from 'react';

interface MultiTapeVisualizerProps {
  tapes: Record<number, string>[];
  headIndices: number[];
  blankSymbol?: string;
}

/** One tape row, structurally the same cell-rendering approach as TapeVisualizer.tsx's single tape. */
const TapeRow: React.FC<{ tapeIndex: number; tape: Record<number, string>; headIndex: number; blankSymbol: string }> = ({ tapeIndex, tape, headIndex, blankSymbol }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const rangeStart = Math.min(headIndex - 5, -2);
  const rangeEnd = Math.max(headIndex + 6, 8);
  const cellKeys: number[] = [];
  for (let i = rangeStart; i <= rangeEnd; i++) cellKeys.push(i);

  useEffect(() => {
    const activeCell = containerRef.current?.querySelector(`[data-cell-id="${headIndex}"]`);
    if (activeCell) activeCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [headIndex]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold text-slate-500 w-10 shrink-0">Tape {tapeIndex}</span>
      <div ref={containerRef} className="flex-1 overflow-x-auto flex items-center py-2 px-2 gap-1.5 custom-scrollbar bg-black/30 border border-white/5 rounded-lg select-none">
        {cellKeys.map(key => {
          const char = tape[key] === undefined ? blankSymbol : tape[key];
          const isActive = key === headIndex;
          return (
            <div
              key={key}
              data-cell-id={key}
              className={`min-w-[36px] h-9 flex flex-col items-center justify-between border rounded relative ${
                isActive ? 'border-[#8b5cf6] bg-gradient-to-t from-[#8b5cf6]/20 to-[#00e5a3]/5 scale-110 shadow-glow-pink' : 'border-white/10 bg-black/40 text-slate-300'
              }`}
            >
              <span className="text-[7px] text-slate-500 font-mono mt-0.5">{key}</span>
              <span className={`text-sm font-black font-mono mb-0.5 ${isActive ? 'text-[#8b5cf6]' : 'text-white'}`}>{char}</span>
              {isActive && (
                <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce">
                  <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-[#8b5cf6]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Sibling to TapeVisualizer.tsx, not a modification of it — one row per tape, stacked, for tapeCount > 1 machines. */
export const MultiTapeVisualizer: React.FC<MultiTapeVisualizerProps> = ({ tapes, headIndices, blankSymbol = '_' }) => (
  <div className="w-full flex flex-col p-4 bg-[#0b121e]/95 border border-white/5 rounded-xl shadow-glow-pink/5 gap-2">
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs font-bold text-[#8b5cf6] uppercase tracking-wider">Multi-Tape Turing Machine ({tapes.length} tapes)</span>
      <div className="text-[10px] text-slate-500 font-mono">Blank: {blankSymbol}</div>
    </div>
    {tapes.map((tape, i) => (
      <TapeRow key={i} tapeIndex={i} tape={tape} headIndex={headIndices[i] ?? 0} blankSymbol={blankSymbol} />
    ))}
  </div>
);
