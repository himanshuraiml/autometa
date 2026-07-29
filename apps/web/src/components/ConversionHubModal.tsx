import React, { useState } from 'react';
import { X, Sparkles, Binary, Type, ArrowRight, BookOpen, Minimize2, Wand2 } from 'lucide-react';
import { Button } from '@autometa/ui';
import { regexToDfa, pdaToCFG, nfaToDfa, minimizeDFA, parseLanguageToDfa, brzozowskiMinimize, simplifyRegex } from '@autometa/rule-engine';
import type { CFGRules } from '@autometa/rule-engine';
import { toAutomaton, automatonToFlow } from '../utils/flowAutomaton';
import { useGraphStore } from '../store/useGraphStore';
import { useToast } from './ToastProvider';

export interface ConversionHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadToGrammarEditor?: (rules: CFGRules) => void;
}

export const ConversionHubModal: React.FC<ConversionHubModalProps> = ({
  isOpen,
  onClose,
  onLoadToGrammarEditor
}) => {
  const { nodes, edges, automatonType, loadGraph } = useGraphStore();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'regexDfa' | 'stringListDfa' | 'pdaCfg' | 'nfaDfa' | 'brzozowski' | 'simplifyRegex'>('regexDfa');
  const [regexInput, setRegexInput] = useState('(a|b)*abb');
  const [stringListInput, setStringListInput] = useState('cat, car, card');
  const [pdaCfgResult, setPdaCfgResult] = useState<CFGRules | null>(null);
  const [simplifyInput, setSimplifyInput] = useState('((a*)+)?|a*');
  const [simplifyResult, setSimplifyResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunRegexToDfa = () => {
    try {
      const dfa = regexToDfa(regexInput);
      const flow = automatonToFlow(dfa);
      loadGraph(flow.nodes, flow.edges, flow.nodes.length, { preserveHistory: false });
      showToast(`Generated minimal DFA from Regex "${regexInput}" onto canvas!`, 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Invalid Regular Expression pattern.', 'error');
    }
  };

  const handleRunStringListToDfa = () => {
    try {
      const result = parseLanguageToDfa(stringListInput);
      const flow = automatonToFlow(result.dfa);
      loadGraph(flow.nodes, flow.edges, flow.nodes.length, { preserveHistory: false });
      showToast(`Generated minimal DFA for "${result.description}" onto canvas!`, 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not parse language description.', 'error');
    }
  };

  const handleRunPdaToCfg = () => {
    if (automatonType !== 'PDA') {
      showToast('Current machine on canvas is not a Pushdown Automaton (PDA). Please select or draw a PDA first.', 'info');
      return;
    }
    try {
      const pda = toAutomaton(nodes, edges, 'PDA');
      const cfg = pdaToCFG(pda);
      setPdaCfgResult(cfg);
      showToast('Successfully converted PDA to Context-Free Grammar (Triple Construction)!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not convert PDA to CFG.', 'error');
    }
  };

  const handleRunNfaToDfa = () => {
    try {
      const current = toAutomaton(nodes, edges, automatonType);
      const dfa = automatonType === 'DFA' ? minimizeDFA(current) : nfaToDfa(current);
      const flow = automatonToFlow(dfa);
      loadGraph(flow.nodes, flow.edges, flow.nodes.length, { preserveHistory: false });
      showToast('NFA successfully converted to DFA onto canvas!', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not convert NFA to DFA.', 'error');
    }
  };

  const handleRunBrzozowski = () => {
    if (automatonType !== 'DFA' && automatonType !== 'NFA') {
      showToast('Brzozowski minimization needs a DFA or NFA on canvas.', 'info');
      return;
    }
    try {
      const current = toAutomaton(nodes, edges, automatonType);
      const minDfa = brzozowskiMinimize(current);
      const flow = automatonToFlow(minDfa);
      loadGraph(flow.nodes, flow.edges, flow.nodes.length, { preserveHistory: false });
      showToast('Minimized via Brzozowski\'s double-reversal algorithm!', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not run Brzozowski minimization.', 'error');
    }
  };

  const handleLoadPdaCfgIntoGrammarEditor = () => {
    if (!pdaCfgResult || !onLoadToGrammarEditor) return;
    onLoadToGrammarEditor(pdaCfgResult);
  };

  const handleRunSimplifyRegex = () => {
    try {
      setSimplifyResult(simplifyRegex(simplifyInput));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Invalid Regular Expression pattern.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0b0f19] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-[#00e5a3]" />
            <h2 className="text-base font-extrabold text-white uppercase tracking-wider">Conversions &amp; Transformations Hub</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer p-1 rounded-lg hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-black/20 p-2 gap-2 overflow-x-auto custom-scrollbar">
          {[
            { id: 'regexDfa', label: 'Regex → DFA', icon: Sparkles },
            { id: 'stringListDfa', label: 'Language → DFA', icon: Binary },
            { id: 'pdaCfg', label: 'PDA → CFG', icon: Type },
            { id: 'nfaDfa', label: 'NFA → DFA Direct', icon: ArrowRight },
            { id: 'brzozowski', label: 'Brzozowski Minimize', icon: Minimize2 },
            { id: 'simplifyRegex', label: 'Simplify Regex', icon: Wand2 },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
                  isActive
                    ? 'bg-gradient-to-r from-[#00e5a3]/20 to-[#8b5cf6]/20 border-[#00e5a3]/40 text-[#00e5a3]'
                    : 'bg-white/5 border-transparent text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body Content */}
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-5">
          {activeTab === 'regexDfa' && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-300">
                Directly build a minimal Deterministic Finite Automaton (DFA) from a Regular Expression pattern.
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-400">Regular Expression Pattern:</label>
                <input
                  type="text"
                  value={regexInput}
                  onChange={e => setRegexInput(e.target.value)}
                  className="bg-black/50 border border-white/10 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#00e5a3]"
                  placeholder="e.g. (a|b)*abb"
                />
              </div>
              <Button onClick={handleRunRegexToDfa} className="self-start flex items-center gap-2">
                Generate DFA on Canvas <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {activeTab === 'stringListDfa' && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-300">
                Construct a minimal DFA directly from Set-Builder notation, natural language rules, or finite word lists.
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-400">Language Specification / Set-Builder Notation:</label>
                <input
                  type="text"
                  value={stringListInput}
                  onChange={e => setStringListInput(e.target.value)}
                  className="bg-black/50 border border-white/10 rounded-lg p-2.5 text-xs text-[#00e5a3] font-mono focus:outline-none focus:border-[#00e5a3]"
                  placeholder="e.g. L = { w ∈ {0,1}* | w ends with 01 } or Strings ending with 01"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Quick Example Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'L = { w ∈ {0,1}* | w ends with 01 }',
                    'Strings ending with 01 over {0,1}',
                    'starts with 10',
                    'contains 101',
                    'does not contain 11',
                    'cat, car, card'
                  ].map(ex => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setStringListInput(ex)}
                      className="px-2 py-1 rounded bg-white/5 hover:bg-[#00e5a3]/20 hover:text-[#00e5a3] text-[11px] font-mono text-slate-300 border border-white/10 transition-all cursor-pointer"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={handleRunStringListToDfa} className="self-start flex items-center gap-2 mt-1">
                Generate DFA on Canvas <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {activeTab === 'pdaCfg' && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-300">
                Converts the Pushdown Automaton (PDA) currently on canvas into Context-Free Grammar rules using standard Triple Construction (<code className="text-[#00e5a3]">[p, A, q]</code>).
              </p>
              <Button onClick={handleRunPdaToCfg} className="self-start flex items-center gap-2">
                Convert Current Canvas PDA → CFG
              </Button>

              {pdaCfgResult && (
                <div className="bg-black/50 border border-white/10 p-4 rounded-xl flex flex-col gap-3">
                  <span className="text-xs font-bold text-[#00e5a3] uppercase tracking-wider">Generated CFG Productions ({Object.keys(pdaCfgResult).length} variables):</span>
                  <div className="font-mono text-xs text-slate-200 max-h-48 overflow-y-auto custom-scrollbar flex flex-col gap-1 bg-black/40 p-2.5 rounded-lg border border-white/5">
                    {Object.entries(pdaCfgResult).map(([head, rhss]) => (
                      <div key={head}>
                        <span className="text-[#8b5cf6] font-bold">{head}</span> → {rhss.join(' | ')}
                      </div>
                    ))}
                  </div>
                  {onLoadToGrammarEditor && (
                    <Button onClick={handleLoadPdaCfgIntoGrammarEditor} variant="secondary" className="self-start flex items-center gap-2 !text-xs">
                      Load into Grammar Editor <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'nfaDfa' && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-300">
                Instantly converts the active NFA machine on canvas into a Deterministic Finite Automaton (DFA) using subset construction and minimization.
              </p>
              <Button onClick={handleRunNfaToDfa} className="self-start flex items-center gap-2">
                Convert NFA → DFA on Canvas <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {activeTab === 'brzozowski' && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-300">
                Minimizes the current canvas DFA/NFA using Brzozowski's double-reversal algorithm (<code className="text-[#00e5a3]">reverse → determinize → reverse → determinize</code>) — often produces a smaller intermediate machine than the standard partition-refinement minimizer.
              </p>
              <Button onClick={handleRunBrzozowski} className="self-start flex items-center gap-2">
                Minimize on Canvas (Brzozowski) <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {activeTab === 'simplifyRegex' && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate-300">
                Algebraically simplifies a regular expression — collapsing redundant closures (<code className="text-[#00e5a3]">(a*)* → a*</code>) and duplicate union branches (<code className="text-[#00e5a3]">a|b|a → a|b</code>) — without changing the language it matches.
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-400">Regular Expression Pattern:</label>
                <input
                  type="text"
                  value={simplifyInput}
                  onChange={e => { setSimplifyInput(e.target.value); setSimplifyResult(null); }}
                  className="bg-black/50 border border-white/10 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#00e5a3]"
                  placeholder="e.g. ((a*)+)?|a*"
                />
              </div>
              <Button onClick={handleRunSimplifyRegex} className="self-start flex items-center gap-2">
                Simplify <Wand2 className="w-4 h-4" />
              </Button>
              {simplifyResult && (
                <div className="bg-black/50 border border-white/10 p-4 rounded-xl flex flex-col gap-2">
                  <span className="text-xs font-bold text-[#00e5a3] uppercase tracking-wider">Simplified:</span>
                  <code className="text-sm text-slate-100 font-mono">{simplifyResult}</code>
                  <Button
                    onClick={() => { setRegexInput(simplifyResult); setActiveTab('regexDfa'); }}
                    variant="secondary"
                    className="self-start flex items-center gap-2 !text-xs mt-1"
                  >
                    Use in Regex → DFA <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
