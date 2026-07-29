import React, { useEffect, useState, useRef } from 'react';

export interface SymbolPaletteProps {
  onInsertSymbol: (symbol: string) => void;
  className?: string;
}

const COMMON_SYMBOLS = [
  { symbol: 'ε', label: 'Epsilon (empty transition / string)' },
  { symbol: '∅', label: 'Empty set / Dead state' },
  { symbol: '→', label: 'Transition arrow' },
  { symbol: '∪', label: 'Union' },
  { symbol: '∩', label: 'Intersection' },
  { symbol: 'Γ', label: 'Stack / Tape alphabet (Gamma)' },
  { symbol: 'Σ', label: 'Input alphabet (Sigma)' },
  { symbol: 'δ', label: 'Transition function (Delta)' },
  { symbol: '*', label: 'Kleene Star' },
];

/**
 * Utility helper to auto-replace common text aliases with standard formal symbols:
 * 'eps', '\epsilon', 'lambda', '\lambda' -> 'ε'
 * 'empty', '\empty', 'null', '\null', 'phi' -> '∅'
 * '->', '=>' -> '→'
 */
export const autoReplaceFormalSymbols = (input: string): string => {
  return input
    .replace(/(?:^|\s)(?:eps|\\epsilon|lambda|\\lambda)(?=\s|$)/gi, ' ε')
    .replace(/(?:^|\s)(?:empty|\\empty|null|\\null|phi)(?=\s|$)/gi, ' ∅')
    .replace(/(?:^|\s)(?:->|=>)(?=\s|$)/gi, ' →')
    .trimStart();
};

export const SymbolPalette: React.FC<SymbolPaletteProps> = ({ onInsertSymbol, className = '' }) => {
  const [isLongPressing, setIsLongPressing] = useState(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const handlePressStart = (sym: string) => {
    if (sym !== 'ε') return;
    longPressFiredRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setIsLongPressing(true);
      onInsertSymbol('ε');
    }, 500);
  };

  const handlePressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setIsLongPressing(false);
  };

  const handleClick = (sym: string) => {
    // A long-press on ε already inserted it and fires a trailing click on
    // release — swallow that one click so it doesn't insert a second ε.
    if (sym === 'ε' && longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    onInsertSymbol(sym);
  };

  // Alt+e (Option+e on Mac) inserts ε while focused in a text field, without
  // needing to reach for the palette at all. `e.code` is checked alongside
  // `e.key` because macOS reports Option+E as a dead-key composition (`key`
  // can come through as "Dead" rather than "e") — `code` stays reliable.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key.toLowerCase() !== 'e' && e.code !== 'KeyE')) return;
      const active = document.activeElement;
      const isTextField = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      if (!isTextField) return;
      e.preventDefault();
      onInsertSymbol('ε');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onInsertSymbol]);

  return (
    <div className={`flex items-center gap-1.5 p-1 bg-black/40 border border-white/10 rounded-lg overflow-x-auto custom-scrollbar select-none ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 shrink-0">Symbols:</span>
      {COMMON_SYMBOLS.map(({ symbol, label }) => (
        <button
          key={symbol}
          type="button"
          title={symbol === 'ε' ? `${label} (Click to insert, hold to insert, or Alt+E)` : `${label} (Click to insert)`}
          onTouchStart={() => handlePressStart(symbol)}
          onTouchEnd={handlePressEnd}
          onMouseDown={() => handlePressStart(symbol)}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressEnd}
          onClick={() => handleClick(symbol)}
          className={`px-2 py-0.5 rounded text-xs font-mono font-bold bg-white/5 hover:bg-[#00e5a3]/20 hover:text-[#00e5a3] text-slate-200 border border-white/10 transition-all cursor-pointer shrink-0 active:scale-95 ${
            symbol === 'ε' && isLongPressing ? 'scale-110 bg-[#00e5a3]/30 text-[#00e5a3] border-[#00e5a3]/40' : ''
          }`}
        >
          {symbol}
        </button>
      ))}
    </div>
  );
};
