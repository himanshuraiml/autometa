/** Shared single-cell diff token, reused by tape compare (TapeHistory) and stack compare (PdaBranches). */
export const DiffToken = ({ value, differs }: { value: string; differs: boolean }) => (
  <span className={`min-w-[22px] text-center px-1 py-0.5 rounded text-[10px] font-mono border ${differs ? 'bg-red-500/20 text-red-300 border-red-400/40' : 'bg-black/30 text-slate-300 border-white/5'}`}>
    {value}
  </span>
);
