import React, { useEffect, useRef } from 'react';

interface TapeVisualizerProps {
  tape: Record<number, string>;
  headIndex: number;
  blankSymbol?: string;
}

export const TapeVisualizer: React.FC<TapeVisualizerProps> = ({
  tape,
  headIndex,
  blankSymbol = '_'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate tape cell range surrounding the head index (e.g. headIndex - 4 to headIndex + 6)
  const rangeStart = Math.min(headIndex - 5, -2);
  const rangeEnd = Math.max(headIndex + 6, 8);
  const cellKeys: number[] = [];
  for (let i = rangeStart; i <= rangeEnd; i++) {
    cellKeys.push(i);
  }

  // Scroll to active head cell smoothly
  useEffect(() => {
    const activeCell = containerRef.current?.querySelector(`[data-cell-id="${headIndex}"]`);
    if (activeCell) {
      activeCell.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [headIndex]);

  return (
    <div className="w-full flex flex-col p-4 bg-[#0b121e]/95 border border-white/5 rounded-xl shadow-glow-pink/5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#8b5cf6] uppercase tracking-wider">Turing Machine Tape</span>
          <span className="text-[10px] text-slate-400">Head position: <strong className="text-white font-mono">{headIndex}</strong></span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">Blank: {blankSymbol}</div>
      </div>

      {/* Horizontal Tape Cells Container */}
      <div
        ref={containerRef}
        className="w-full overflow-x-auto flex items-center py-4 px-2 gap-2 custom-scrollbar bg-black/30 border border-white/5 rounded-lg select-none"
      >
        {cellKeys.map((key) => {
          const char = tape[key] === undefined ? blankSymbol : tape[key];
          const isActive = key === headIndex;

          return (
            <div
              key={key}
              data-cell-id={key}
              className={`min-w-[48px] h-12 flex flex-col items-center justify-between border rounded-lg transition-all duration-300 relative ${
                isActive
                  ? 'border-[#8b5cf6] bg-gradient-to-t from-[#8b5cf6]/20 to-[#00e5a3]/5 scale-110 shadow-glow-pink'
                  : 'border-white/10 bg-black/40 text-slate-300'
              }`}
            >
              {/* Tape cell label / index */}
              <span className="text-[8px] text-slate-500 font-mono mt-0.5">{key}</span>
              
              {/* Tape cell value */}
              <span className={`text-base font-black font-mono mb-1 ${isActive ? 'text-[#8b5cf6]' : 'text-white'}`}>
                {char}
              </span>

              {/* Head Pointer Indicator underneath */}
              {isActive && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce">
                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-[#8b5cf6]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
