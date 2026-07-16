import { Sparkles } from 'lucide-react';
import { Button } from '@autometa/ui';
import { pumpString } from '@autometa/rule-engine';
import type { RegexAstNode } from '@autometa/rule-engine';
import { simulateDFA } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';
import type { Transformations } from '../hooks/useTransformations';

interface TransformationPanelProps {
  transformations: Transformations;
  getAutomatonData: () => Automaton;
}

const PANEL_TITLES = {
  nfaToDfa: 'NFA to DFA Steps',
  minimize: 'DFA Minimizer',
  regexToNfa: 'Regex to NFA',
  pumpingLemma: 'Pumping Lemma',
  dfaToRegex: 'DFA to Regex (GNFA Elimination)',
} as const;

/** Recursive AST tree render for the regex workspace's "parse tree" view — visually mirrors GrammarEditor's ParseTree. */
const RegexAstView = ({ node }: { node: RegexAstNode }): React.JSX.Element => {
  const label =
    node.type === 'literal' ? `"${node.value}"`
    : node.type === 'wildcard' ? '.'
    : node.type === 'class' ? (node.negated ? `[^${node.chars.join('')}]` : `[${node.chars.join('')}]`)
    : node.type === 'concat' ? '·'
    : node.type === 'union' ? '|'
    : node.type === 'star' ? '*'
    : node.type === 'plus' ? '+'
    : '?';
  const children: RegexAstNode[] =
    node.type === 'concat' || node.type === 'union' ? [node.left, node.right]
    : node.type === 'star' || node.type === 'plus' || node.type === 'question' ? [node.child]
    : [];
  return (
    <li className="flex flex-col items-center min-w-max">
      <span className={`px-2 py-1 rounded border text-xs font-mono ${children.length ? 'border-[#8b5cf6]/40 bg-[#8b5cf6]/10 text-[#ddd6fe]' : 'border-[#00e5a3]/30 bg-[#00e5a3]/10 text-[#a7f3d0]'}`}>{label}</span>
      {children.length > 0 && <ul className="mt-3 pt-3 border-t border-white/10 flex gap-3 justify-center">{children.map((child, i) => <RegexAstView key={i} node={child} />)}</ul>}
    </li>
  );
};

/** Right sidebar shown while an algorithm walkthrough is active. */
export const TransformationPanel = ({ transformations, getAutomatonData }: TransformationPanelProps) => {
  const {
    transform,
    stepIndex, setStepIndex,
    regexInput, regexAst,
    pumpCount, setPumpCount,
    exitTransformation,
    applyRegexNfaToCanvas,
    applyNfaToDfaToCanvas,
    applyMinimizationToCanvas,
  } = transformations;

  if (!transform) return null;

  const pumpingDecomposition = transform.kind === 'pumpingLemma' ? transform.decomposition : null;
  const pumpedString = pumpingDecomposition ? pumpString(pumpingDecomposition, pumpCount) : '';
  const pumpedResult = pumpingDecomposition && stepIndex === 3 ? simulateDFA(getAutomatonData(), pumpedString) : null;

  return (
    <aside
      className="w-[340px] border-l border-white/10 glass-panel p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar select-none"
      aria-label={`${PANEL_TITLES[transform.kind]} walkthrough`}
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#a855f7] flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 animate-pulse" />
          <span>{PANEL_TITLES[transform.kind]}</span>
        </h2>
        <button
          onClick={exitTransformation}
          className="text-xs text-gray-400 hover:text-white bg-transparent border-none cursor-pointer"
        >
          Exit
        </button>
      </div>

      {transform.kind === 'regexToNfa' && (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-slate-300">
            Pattern: <code className="text-[#00e5a3] font-mono">{regexInput}</code>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Construction Steps</span>
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {transform.steps.slice(0, stepIndex + 1).map((step, idx) => (
                <div
                  key={idx}
                  className={`bg-black/40 border p-2.5 rounded-lg text-xs font-mono ${
                    idx === stepIndex ? 'border-[#8b5cf6]/50 animate-pulse' : 'border-white/5'
                  }`}
                >
                  <span className="text-[#00e5a3] font-bold">Step {idx + 1}:</span>{' '}
                  <span className="text-slate-300">{step.description}</span>
                  <span className="text-slate-500"> ({step.fragment.nodes.length} states)</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-between items-center mt-3 pt-3 border-t border-white/10">
            <span className="text-xs text-slate-400">
              Step {stepIndex + 1} of {transform.steps.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={stepIndex <= 0}
                onClick={() => setStepIndex(prev => prev - 1)}
                className="!px-2.5 !py-1 text-xs"
              >
                Prev
              </Button>
              <Button
                disabled={stepIndex >= transform.steps.length - 1}
                onClick={() => setStepIndex(prev => prev + 1)}
                className="!px-2.5 !py-1 text-xs"
              >
                Next
              </Button>
            </div>
          </div>

          {stepIndex === transform.steps.length - 1 && (
            <Button
              onClick={applyRegexNfaToCanvas}
              className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold mt-2"
            >
              Apply NFA to Canvas
            </Button>
          )}

          {regexAst && (
            <div className="border border-white/5 rounded-lg bg-black/20 p-3 overflow-x-auto">
              <span className="text-[10px] text-slate-500 uppercase font-bold block mb-3">Parse tree (AST)</span>
              <ul className="w-max min-w-full flex justify-center"><RegexAstView node={regexAst} /></ul>
            </div>
          )}
        </div>
      )}

      {transform.kind === 'dfaToRegex' && (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-slate-300">
            GNFA state elimination — eliminating one state at a time reduces the machine to a single entry→exit regex.
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Eliminated: {transform.walkthrough.steps[stepIndex]?.removedLabel}</span>
            <div className="bg-black/40 border border-white/5 rounded-lg p-2.5 max-h-[280px] overflow-y-auto custom-scrollbar flex flex-col gap-1">
              {(transform.walkthrough.steps[stepIndex]?.matrix ?? []).map((cell, idx) => (
                <div key={idx} className="flex justify-between gap-2 text-[11px] font-mono">
                  <span className="text-slate-400">{cell.fromLabel} → {cell.toLabel}</span>
                  <span className="text-[#00e5a3] truncate max-w-[160px]" title={cell.regex}>{cell.regex}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-between items-center mt-3 pt-3 border-t border-white/10">
            <span className="text-xs text-slate-400">
              Step {stepIndex + 1} of {transform.walkthrough.steps.length}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={stepIndex <= 0} onClick={() => setStepIndex(prev => prev - 1)} className="!px-2.5 !py-1 text-xs">Prev</Button>
              <Button disabled={stepIndex >= transform.walkthrough.steps.length - 1} onClick={() => setStepIndex(prev => prev + 1)} className="!px-2.5 !py-1 text-xs">Next</Button>
            </div>
          </div>

          {stepIndex === transform.walkthrough.steps.length - 1 && (
            <div className="bg-black/40 border border-[#00e5a3]/30 rounded-lg p-3">
              <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Result</span>
              <p className="text-sm font-mono text-[#00e5a3] break-all">{transform.walkthrough.result}</p>
            </div>
          )}
        </div>
      )}

      {transform.kind === 'nfaToDfa' && (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-slate-300">
            Alphabet: <code className="text-[#00e5a3] font-mono">{transform.walkthrough.alphabet.join(', ')}</code>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Subset Construction Rows</span>
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {transform.walkthrough.rows.slice(0, stepIndex + 1).map((row, idx) => (
                <div key={idx} className="bg-black/40 border border-white/5 p-2 rounded-lg text-xs font-mono">
                  <div className="flex items-center justify-between border-b border-white/5 pb-1 mb-1">
                    <span className="text-[#00e5a3] font-bold">{row.stateId} ({row.label})</span>
                    <span className="text-slate-500">NFA: {`{${row.subset.join(',')}}`}</span>
                  </div>
                  {transform.walkthrough.alphabet.map((sym) => {
                    const tr = row.transitions[sym];
                    return (
                      <div key={sym} className="flex justify-between text-[11px] text-slate-300">
                        <span>on '{sym}':</span>
                        <span>{tr ? `${tr.targetStateId} ({${tr.targetSubset.join(',')}})` : 'Ø'}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-between items-center mt-3 pt-3 border-t border-white/10">
            <span className="text-xs text-slate-400">
              Step {stepIndex + 1} of {transform.walkthrough.rows.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={stepIndex <= 0}
                onClick={() => setStepIndex(prev => prev - 1)}
                className="!px-2.5 !py-1 text-xs"
              >
                Prev
              </Button>
              <Button
                disabled={stepIndex >= transform.walkthrough.rows.length - 1}
                onClick={() => setStepIndex(prev => prev + 1)}
                className="!px-2.5 !py-1 text-xs"
              >
                Next
              </Button>
            </div>
          </div>

          {stepIndex === transform.walkthrough.rows.length - 1 && (
            <Button
              onClick={applyNfaToDfaToCanvas}
              className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold mt-2"
            >
              Apply DFA to Canvas
            </Button>
          )}
        </div>
      )}

      {transform.kind === 'minimize' && (
        <div className="flex flex-col gap-4">
          <span className="text-[10px] text-slate-500 uppercase font-bold">Myhill-Nerode Grid (Equivalent Pairs)</span>

          <div className="bg-black/50 border border-white/10 p-2.5 rounded-lg flex flex-col gap-1.5 max-h-60 overflow-y-auto custom-scrollbar">
            {transform.walkthrough.pairs.map((p) => {
              const isShown = stepIndex === 0 ? p.step === 'base' : true;
              const isCurrentlyMarked = isShown && p.marked;

              return (
                <div key={p.pairKey} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300 font-bold">{`{${p.label1}, ${p.label2}}`}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isCurrentlyMarked ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                    {isCurrentlyMarked ? 'Distinguishable' : 'Equivalent'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="bg-black/40 border border-white/5 p-3 rounded-lg flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Trace & Explanation</span>
            <div className="text-[11px] text-slate-300 max-h-32 overflow-y-auto custom-scrollbar">
              {transform.walkthrough.pairs
                .filter((p) => p.marked && (stepIndex === 0 ? p.step === 'base' : true))
                .map((p) => (
                  <div key={p.pairKey} className="border-b border-white/5 py-1">
                    <span className="font-bold text-[#00e5a3]">{`{${p.label1}, ${p.label2}}`}:</span> {p.reason}
                  </div>
                ))}
            </div>
          </div>

          <div className="flex gap-2 justify-between items-center mt-3 pt-3 border-t border-white/10">
            <span className="text-xs text-slate-400">
              {stepIndex === 0 ? "Step 1: Base Case" : "Step 2: Iterative Passes"}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={stepIndex <= 0}
                onClick={() => setStepIndex(prev => prev - 1)}
                className="!px-2.5 !py-1 text-xs"
              >
                Prev
              </Button>
              <Button
                disabled={stepIndex >= 1}
                onClick={() => setStepIndex(prev => prev + 1)}
                className="!px-2.5 !py-1 text-xs"
              >
                Next
              </Button>
            </div>
          </div>

          {stepIndex === 1 && (
            <Button
              onClick={applyMinimizationToCanvas}
              className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold mt-2"
            >
              Apply Minimization to Canvas
            </Button>
          )}
        </div>
      )}

      {transform.kind === 'pumpingLemma' && pumpingDecomposition && (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-slate-300">
            Pumping length <code className="text-[#00e5a3] font-mono">p = {pumpingDecomposition.p}</code> (states) · word{' '}
            <code className="text-[#00e5a3] font-mono">"{pumpingDecomposition.word}"</code>
          </div>

          {stepIndex === 0 && (
            <div className="bg-black/40 border border-white/5 p-3 rounded-lg flex flex-col gap-2">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Step 1: Run &amp; Trace</span>
              <p className="text-xs text-slate-300">Simulating the word visits this sequence of states:</p>
              <p className="text-xs font-mono text-[#00e5a3] break-all">{pumpingDecomposition.statePath.join(' → ')}</p>
            </div>
          )}

          {stepIndex === 1 && (
            <div className="bg-black/40 border border-white/5 p-3 rounded-lg flex flex-col gap-2">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Step 2: Pigeonhole Principle</span>
              <p className="text-xs text-slate-300">
                The first {pumpingDecomposition.p + 1} states visited (reading the first {pumpingDecomposition.p} symbols) can only take {pumpingDecomposition.p} distinct values — so two must repeat.
              </p>
              <p className="text-xs text-slate-300">
                State <code className="text-[#8b5cf6] font-mono">{pumpingDecomposition.statePath[pumpingDecomposition.repeatIndexI]}</code> first appears at position {pumpingDecomposition.repeatIndexI} and repeats at position {pumpingDecomposition.repeatIndexJ}.
              </p>
            </div>
          )}

          {stepIndex === 2 && (
            <div className="bg-black/40 border border-white/5 p-3 rounded-lg flex flex-col gap-2">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Step 3: Decompose w = xyz</span>
              <div className="text-xs font-mono flex flex-col gap-1">
                <span>x = <span className="text-[#00e5a3]">"{pumpingDecomposition.x}"</span></span>
                <span>y = <span className="text-[#8b5cf6]">"{pumpingDecomposition.y}"</span> (the pumpable loop)</span>
                <span>z = <span className="text-[#00e5a3]">"{pumpingDecomposition.z}"</span></span>
              </div>
              <p className="text-[10px] text-slate-500">
                |xy| = {pumpingDecomposition.x.length + pumpingDecomposition.y.length} ≤ p, |y| = {pumpingDecomposition.y.length} ≥ 1
              </p>
            </div>
          )}

          {stepIndex === 3 && (
            <div className="bg-black/40 border border-white/5 p-3 rounded-lg flex flex-col gap-3">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Step 4: Pump y and Re-check</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Repeat y:</span>
                <Button variant="secondary" onClick={() => setPumpCount(c => Math.max(0, c - 1))} className="!px-2.5 !py-1 text-xs">−</Button>
                <span className="text-xs font-mono text-white w-8 text-center">{pumpCount}×</span>
                <Button variant="secondary" onClick={() => setPumpCount(c => c + 1)} className="!px-2.5 !py-1 text-xs">+</Button>
              </div>
              <p className="text-xs font-mono text-slate-300 break-all">
                xy<sup>{pumpCount}</sup>z = "{pumpedString}"
              </p>
              <p className={`text-xs font-bold ${pumpedResult?.accepted ? 'text-green-400' : 'text-red-400'}`}>
                {pumpedResult?.accepted ? '✓ Accepted' : '✗ Rejected'} by this DFA
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-between items-center mt-1 pt-3 border-t border-white/10">
            <span className="text-xs text-slate-400">Step {stepIndex + 1} of 4</span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={stepIndex <= 0}
                onClick={() => setStepIndex(prev => prev - 1)}
                className="!px-2.5 !py-1 text-xs"
              >
                Prev
              </Button>
              <Button
                disabled={stepIndex >= 3}
                onClick={() => setStepIndex(prev => prev + 1)}
                className="!px-2.5 !py-1 text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
