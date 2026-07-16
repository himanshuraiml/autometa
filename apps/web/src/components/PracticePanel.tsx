import { useState } from 'react';
import { GraduationCap, Lightbulb, CheckCircle2, XCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@autometa/ui';
import type { CFGRules } from '@autometa/rule-engine';
import type { UsePractice, PracticeSubmission } from '../hooks/usePractice';

interface PracticePanelProps {
  practice: UsePractice;
  /** Only used for DFA/NFA/PDA/TM exercises, which are answered on the graph canvas. */
  getGraphSubmission?: () => PracticeSubmission;
  onExit: () => void;
  /**
   * 'floating' overlays the canvas (used in the graph editor, alongside the
   * still-visible EditorSidebar — practice mode must not hide node/edge
   * property editing); 'inline' is a plain card for the Practice hub.
   */
  variant?: 'floating' | 'inline';
}

const GRAPH_BASED_TYPES = new Set(['DFA', 'NFA', 'PDA', 'TM']);

const parseCfgRulesText = (text: string): CFGRules => {
  const rules: CFGRules = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const [lhsRaw, rhsRaw] = line.split('->');
    if (!lhsRaw || rhsRaw === undefined) continue;
    const lhs = lhsRaw.trim();
    if (!lhs) continue;
    const alternatives = rhsRaw.split('|').map(alt => alt.trim()).filter(Boolean);
    rules[lhs] = [...(rules[lhs] ?? []), ...alternatives];
  }
  return rules;
};

/** Practice-mode overlay: prompt, progressive hints, attempt/score tracking, check-answer, retry. */
export const PracticePanel = ({ practice, getGraphSubmission, onExit, variant = 'floating' }: PracticePanelProps) => {
  const { activeExercise, hintsRevealed, revealNextHint, attemptCount, maxAttemptsReached, lastResult, submitting, error, submit } = practice;
  const [regexInput, setRegexInput] = useState('');
  const [cfgInput, setCfgInput] = useState('S -> a b | a S b');
  const [collapsed, setCollapsed] = useState(false);

  if (!activeExercise) return null;

  const hints: string[] = JSON.parse(activeExercise.hints_json || '[]');
  const isGraphBased = GRAPH_BASED_TYPES.has(activeExercise.automaton_type);

  const handleCheck = async () => {
    let submission: PracticeSubmission;
    if (isGraphBased) {
      if (!getGraphSubmission) return;
      submission = getGraphSubmission();
    } else if (activeExercise.automaton_type === 'Regex') {
      submission = { regex: regexInput };
    } else {
      submission = { rules: parseCfgRulesText(cfgInput), startSymbol: 'S' };
    }
    await submit(submission);
  };

  const wrapperClass =
    variant === 'floating'
      ? 'absolute top-4 right-4 z-30 w-96 max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] bg-[#0b1220]/95 backdrop-blur border border-white/10 rounded-2xl shadow-2xl p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar select-none'
      : 'w-full max-w-xl bg-[#0b1220] border border-white/5 rounded-2xl p-6 flex flex-col gap-5';

  return (
    <div className={wrapperClass} aria-label="Practice exercise">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#00e5a3] flex items-center gap-1.5">
          <GraduationCap className="w-4 h-4" />
          <span>Practice</span>
        </h2>
        <div className="flex items-center gap-2">
          {variant === 'floating' && (
            <button
              onClick={() => setCollapsed(c => !c)}
              className="text-xs text-gray-400 hover:text-white bg-transparent border-none cursor-pointer"
              aria-label={collapsed ? 'Expand practice panel' : 'Collapse practice panel'}
            >
              {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
          <button onClick={onExit} className="text-xs text-gray-400 hover:text-white bg-transparent border-none cursor-pointer flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Exit
          </button>
        </div>
      </div>

      {collapsed ? (
        <p className="text-xs text-slate-300 truncate">{activeExercise.title}</p>
      ) : (
        <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#00e5a3]/10 text-[#00e5a3]">
            {activeExercise.automaton_type}
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 text-slate-300">
            {activeExercise.difficulty}
          </span>
          <span className="text-[10px] text-slate-500">{activeExercise.learning_objective}</span>
        </div>
        <h3 className="text-base font-bold text-white">{activeExercise.title}</h3>
        <p className="text-xs text-slate-300 leading-relaxed">{activeExercise.description}</p>
      </div>

      {hints.length > 0 && (
        <div className="flex flex-col gap-2 bg-black/30 rounded-lg p-3 border border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5" /> Hints ({hintsRevealed}/{hints.length})
            </span>
            {hintsRevealed < hints.length && (
              <button
                onClick={revealNextHint}
                className="text-[10px] text-amber-300 hover:text-amber-200 bg-transparent border-none cursor-pointer underline"
              >
                Show next hint
              </button>
            )}
          </div>
          {hints.slice(0, hintsRevealed).map((hint, i) => (
            <p key={i} className="text-xs text-slate-300 leading-relaxed">
              {i + 1}. {hint}
            </p>
          ))}
        </div>
      )}

      {isGraphBased ? (
        <p className="text-xs text-slate-400">Build your answer on the canvas, then check it below.</p>
      ) : activeExercise.automaton_type === 'Regex' ? (
        <input
          type="text"
          value={regexInput}
          onChange={e => setRegexInput(e.target.value)}
          placeholder="e.g. (a|b)*ab"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/40"
          aria-label="Your regular expression"
        />
      ) : (
        <textarea
          value={cfgInput}
          onChange={e => setCfgInput(e.target.value)}
          rows={4}
          placeholder={'S -> a b | a S b'}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/40 custom-scrollbar"
          aria-label="Your grammar rules, one production per line: LHS -> alt1 | alt2"
        />
      )}

      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>
          Attempts: {attemptCount}
          {activeExercise.max_attempts ? ` / ${activeExercise.max_attempts}` : ''}
        </span>
        {maxAttemptsReached && <span className="text-red-400 font-bold">Limit reached</span>}
      </div>

      <Button
        onClick={handleCheck}
        disabled={submitting || maxAttemptsReached}
        className="!bg-[#00e5a3] !text-black !font-bold disabled:!opacity-50"
      >
        {submitting ? 'Checking…' : 'Check Answer'}
      </Button>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {lastResult && (
        <div
          className={`rounded-lg p-3 border flex flex-col gap-1.5 ${
            lastResult.passed ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-bold">
            {lastResult.passed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400" />
            )}
            <span className={lastResult.passed ? 'text-emerald-300' : 'text-red-300'}>
              {lastResult.passed ? 'Correct!' : `Not quite (${Math.round(lastResult.score * 100)}% match)`}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{lastResult.message}</p>
        </div>
      )}
        </>
      )}
    </div>
  );
};
