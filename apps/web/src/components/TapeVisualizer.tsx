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
    <div className="w-full flex flex-col p-4 bg-[#0a0e1a]/95 border border-white/10 rounded-xl shadow-glow-blue/5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#ff007f] uppercase tracking-wider">Turing Machine Tape</span>
          <span className="text-[10px] text-gray-400">Head position: <strong className="text-white font-mono">{headIndex}</strong></span>
        </div>
        <div className="text-[10px] text-gray-500 font-mono">Blank: {blankSymbol}</div>
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
                  ? 'border-[#ff007f] bg-gradient-to-t from-[#ff007f]/20 to-[#00f0ff]/5 scale-110 shadow-glow-magenta'
                  : 'border-white/10 bg-black/40 text-gray-300'
              }`}
            >
              {/* Tape cell label / index */}
              <span className="text-[8px] text-gray-500 font-mono mt-0.5">{key}</span>
              
              {/* Tape cell value */}
              <span className={`text-base font-black font-mono mb-1 ${isActive ? 'text-[#ff007f]' : 'text-white'}`}>
                {char}
              </span>

              {/* Head Pointer Indicator underneath */}
              {isActive && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce">
                  <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-[#ff007f]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
