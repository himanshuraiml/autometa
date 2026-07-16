import React from 'react';

interface StackVisualizerProps {
  stack: string[];
}

export const StackVisualizer: React.FC<StackVisualizerProps> = ({ stack }) => {
  const displayStack = stack && stack.length > 0 ? stack : ['_'];

  return (
    <div className="flex flex-col h-full border border-white/5 rounded-xl p-4 bg-[#0b121e]/80 backdrop-blur-md shadow-glow-green/5">
      <div className="flex items-center justify-between mb-4 border-b border-white/15 pb-2">
        <span className="text-xs font-bold text-[#00e5a3] uppercase tracking-wider">PDA Stack Visualizer</span>
        <span className="text-[10px] bg-[#00e5a3]/10 text-[#00e5a3] px-2 py-0.5 rounded-full font-mono font-bold">
          SIZE: {stack.length}
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-end items-center overflow-y-auto px-4 pb-4">
        {/* Glassmorphic Cylinder Container representing the stack */}
        <div className="w-24 min-h-[220px] max-h-[300px] border-x-2 border-b-2 border-dashed border-[#00e5a3]/40 rounded-b-xl relative bg-gradient-to-t from-[#00e5a3]/5 to-transparent flex flex-col justify-end p-2 gap-1.5 overflow-y-auto custom-scrollbar">
          {displayStack.map((symbol, idx) => {
            const isTop = idx === 0;
            return (
              <div
                key={`${symbol}-${idx}-${stack.length}`}
                className={`w-full py-2.5 px-3 rounded-lg text-center font-mono text-sm font-black border transition-all duration-300 transform translate-y-0 scale-100 ${
                  isTop
                    ? 'bg-gradient-to-r from-[#00e5a3] to-[#8b5cf6] text-black border-transparent shadow-glow-green'
                    : 'bg-black/60 text-white border-white/10'
                } ${symbol === '_' ? 'opacity-40 border-dashed animate-pulse' : 'animate-slide-down'}`}
              >
                {symbol === '_' ? 'Z₀ (Empty)' : symbol}
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-[10px] text-slate-500 text-center mt-2">
        Top of Stack is highlighted at the top of the cylinder.
      </div>
    </div>
  );
};
