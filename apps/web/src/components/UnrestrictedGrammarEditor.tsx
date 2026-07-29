import { useState } from 'react';
import { Sparkles, Play } from 'lucide-react';
import { deriveUnrestricted, deriveContextSensitive, parseUnrestrictedGrammar, formatSententialForm } from '@autometa/rule-engine';
import type { UnrestrictedDerivationStep } from '@autometa/rule-engine';

const DEFAULT_SOURCE = `S -> a S B c
S -> a b c
c B -> B c
b B -> b b`;

const MAX_DERIVATION_STEPS = 20000;

/** Prev/Next control, mirroring GrammarEditor.tsx's StepperControls (kept local — this file stays physically separate from that already-large component). */
const StepperControls = ({ index, total, onPrev, onNext }: { index: number; total: number; onPrev: () => void; onNext: () => void }) => (
  <div className="flex items-center gap-2 mt-1">
    <button disabled={index <= 0} onClick={onPrev} className="text-[10px] px-2.5 py-1 rounded border border-white/10 text-slate-300 hover:bg-white/5 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
    <span className="text-[10px] text-slate-500">Step {index + 1} of {total}</span>
    <button disabled={index >= total - 1} onClick={onNext} className="text-[10px] px-2.5 py-1 rounded border border-white/10 text-slate-300 hover:bg-white/5 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
  </div>
);

/**
 * Type-0 (unrestricted) grammar workspace: free-form `lhs -> rhs` productions
 * (both sides arbitrary symbol sequences — see unrestricted.ts for why this
 * can't reuse CFGRules) and a bounded derivation search against a target
 * string, since derivability is undecidable in general for this grammar class.
 */
export const UnrestrictedGrammarEditor = () => {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [startSymbol, setStartSymbol] = useState('S');
  const [target, setTarget] = useState('a a b b c c');
  const [parseError, setParseError] = useState<string | null>(null);
  const [steps, setSteps] = useState<UnrestrictedDerivationStep[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [notFoundMessage, setNotFoundMessage] = useState<string | null>(null);
  const [contextSensitiveMode, setContextSensitiveMode] = useState(false);

  const handleDerive = () => {
    setParseError(null);
    setNotFoundMessage(null);
    setSteps(null);
    try {
      const grammar = parseUnrestrictedGrammar(source, startSymbol.trim());
      const targetSymbols = target.trim().split(/\s+/).filter(Boolean);

      if (contextSensitiveMode) {
        const outcome = deriveContextSensitive(grammar, targetSymbols, MAX_DERIVATION_STEPS);
        if (outcome.kind === 'invalid-grammar') {
          setParseError(outcome.reason);
        } else if (outcome.kind === 'found') {
          setSteps(outcome.steps);
          setStepIndex(0);
        } else {
          setNotFoundMessage(`No derivation found within ${outcome.exploredCount} explored sentential forms (tightly bounded to the target's length, since this grammar is non-contracting).`);
        }
        return;
      }

      const result = deriveUnrestricted(grammar, targetSymbols, MAX_DERIVATION_STEPS);
      if (result.found) {
        setSteps(result.steps);
        setStepIndex(0);
      } else {
        setNotFoundMessage(`No derivation found within ${result.exploredCount} explored sentential forms. Type-0 derivability is undecidable in general — this means "not found in the search budget," not a proof of rejection.`);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse grammar.');
    }
  };

  const currentStep = steps ? steps[stepIndex] : null;

  return (
    <div className="w-full h-full flex flex-col bg-[#050811] text-white p-6 overflow-y-auto">
      <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4 shrink-0">
        <Sparkles className="w-5 h-5 text-[#00e5a3] animate-pulse" />
        <h2 className="text-sm font-black tracking-widest uppercase text-slate-100">Unrestricted (Type-0) Grammar</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        <div className="border border-white/5 bg-[#0b121e]/70 p-4 rounded-xl flex flex-col gap-3 shadow-md">
          <h3 className="text-[10px] font-black text-[#00e5a3] uppercase tracking-widest">Productions</h3>
          <p className="text-[10px] text-slate-500">
            One per line: <code className="text-[#00e5a3]">lhs -&gt; rhs</code>, space-separated symbols on each side (uppercase = nonterminal). Both sides may be more than one symbol, e.g. <code className="text-[#00e5a3]">c B -&gt; B c</code>.
          </p>
          <textarea
            value={source}
            onChange={e => setSource(e.target.value)}
            rows={10}
            className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs font-mono text-white focus:outline-none focus:border-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/20"
          />
          <div className="flex gap-2 items-center">
            <label className="text-[10px] text-slate-400 shrink-0">Start symbol</label>
            <input value={startSymbol} onChange={e => setStartSymbol(e.target.value)} className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white" />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-[10px] text-slate-400 shrink-0">Target string</label>
            <input value={target} onChange={e => setTarget(e.target.value)} placeholder="a a b b c c" className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white" />
          </div>
          <label className="flex items-center gap-2 text-[10px] text-slate-400 cursor-pointer">
            <input type="checkbox" checked={contextSensitiveMode} onChange={e => setContextSensitiveMode(e.target.checked)} className="accent-[#00e5a3]" />
            Context-Sensitive mode (Type-1) — validates the grammar is non-contracting, then searches with a tight, provably-sound bound instead of Type-0's heuristic one.
          </label>
          <button
            onClick={handleDerive}
            className="w-full flex items-center justify-center gap-2 mt-1 px-3 py-2 rounded-lg bg-[#00e5a3] hover:opacity-90 text-black font-bold text-xs cursor-pointer border-none"
          >
            <Play className="w-3.5 h-3.5" /> Search for a Derivation
          </button>
          {parseError && <p className="text-[10px] text-red-400">{parseError}</p>}
          {notFoundMessage && <p className="text-[10px] text-amber-300">{notFoundMessage}</p>}
        </div>

        <div className="border border-white/5 bg-[#0b121e]/70 p-4 rounded-xl flex flex-col gap-3 shadow-md">
          <h3 className="text-[10px] font-black text-[#00e5a3] uppercase tracking-widest">Derivation</h3>
          {!steps ? (
            <p className="text-[10px] text-slate-500">Run a search to see the step-by-step rewriting sequence here.</p>
          ) : steps.length === 0 ? (
            <p className="text-[11px] text-slate-300">Target string equals the start symbol — no rewriting needed.</p>
          ) : (
            <>
              <div className="font-mono text-xs bg-black/30 border border-white/5 rounded-lg p-3 flex flex-col gap-2">
                <div>
                  <span className="text-slate-500">Before: </span>
                  <span className="text-white">{formatSententialForm(currentStep!.before)}</span>
                </div>
                <div className="text-[#8b5cf6]">
                  apply {currentStep!.production.lhs.join(' ')} → {formatSententialForm(currentStep!.production.rhs)} at position {currentStep!.position}
                </div>
                <div>
                  <span className="text-slate-500">After: </span>
                  <span className="text-[#00e5a3]">{formatSententialForm(currentStep!.after)}</span>
                </div>
              </div>
              <StepperControls
                index={stepIndex}
                total={steps.length}
                onPrev={() => setStepIndex(i => Math.max(0, i - 1))}
                onNext={() => setStepIndex(i => Math.min(steps.length - 1, i + 1))}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
