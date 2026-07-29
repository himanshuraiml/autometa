import React, { useState } from 'react';
import { ArrowRightLeft, Sparkles, RefreshCw, Zap, Binary, BookOpen, Type } from 'lucide-react';
import { Button } from '@autometa/ui';
import { useGraphStore } from '../store/useGraphStore';
import { nfaToDfa, minimizeDFA, complementDFA, reverseNFA, nfaToRegularGrammar } from '@autometa/rule-engine';
import { toAutomaton, automatonToFlow } from '../utils/flowAutomaton';
import { useToast } from './ToastProvider';

export interface CanvasQuickActionBarProps {
  onOpenConversionHub: () => void;
}

export const CanvasQuickActionBar: React.FC<CanvasQuickActionBarProps> = ({ onOpenConversionHub }) => {
  const { nodes, edges, automatonType, loadGraph } = useGraphStore();
  const { showToast } = useToast();
  const [grammarResult, setGrammarResult] = useState<string | null>(null);

  const isFA = automatonType === 'DFA' || automatonType === 'NFA';
  if (!isFA || nodes.length === 0) return null;

  const currentAutomaton = toAutomaton(nodes, edges, automatonType);
  const isDfa = automatonType === 'DFA';

  const handleInstantNfaToDfa = () => {
    try {
      const dfa = nfaToDfa(currentAutomaton);
      const flow = automatonToFlow(dfa);
      loadGraph(flow.nodes, flow.edges, flow.nodes.length, { preserveHistory: false });
      showToast('NFA successfully converted to DFA!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not convert NFA to DFA.', 'error');
    }
  };

  const handleInstantMinimize = () => {
    try {
      const dfa = isDfa ? currentAutomaton : nfaToDfa(currentAutomaton);
      const minDfa = minimizeDFA(dfa);
      const flow = automatonToFlow(minDfa);
      loadGraph(flow.nodes, flow.edges, flow.nodes.length, { preserveHistory: false });
      showToast('DFA successfully minimized!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not minimize DFA.', 'error');
    }
  };

  const handleInstantComplement = () => {
    try {
      const dfa = isDfa ? currentAutomaton : nfaToDfa(currentAutomaton);
      const comp = complementDFA(dfa);
      const flow = automatonToFlow(comp);
      loadGraph(flow.nodes, flow.edges, flow.nodes.length, { preserveHistory: false });
      showToast('Complemented DFA (inverted accept states)!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not complement DFA.', 'error');
    }
  };

  const handleInstantRegularGrammar = () => {
    try {
      const grammar = nfaToRegularGrammar(currentAutomaton);
      const lines = Object.keys(grammar).map(nt => `${nt} → ${grammar[nt].map(p => p || 'ε').join(' | ')}`);
      setGrammarResult(lines.join('\n'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not convert to a regular grammar.', 'error');
    }
  };

  const handleInstantReversal = () => {
    try {
      const rev = reverseNFA(currentAutomaton);
      const flow = automatonToFlow(rev);
      loadGraph(flow.nodes, flow.edges, flow.nodes.length, { preserveHistory: false });
      showToast('Machine successfully reversed (Mᴿ)!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not reverse machine.', 'error');
    }
  };

  return (
    <div className="relative flex items-center gap-2 p-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl">
      <span className="text-[10px] font-black uppercase tracking-widest text-[#00e5a3] px-2 flex items-center gap-1 shrink-0">
        <Zap className="w-3 h-3 animate-pulse" /> 1-Click:
      </span>

      {automatonType === 'NFA' && (
        <Button
          onClick={handleInstantNfaToDfa}
          variant="secondary"
          className="!px-2.5 !py-1 text-xs flex items-center gap-1.5 !bg-white/5 hover:!bg-[#00e5a3]/20 hover:!text-[#00e5a3]"
          title="Instant 1-Click NFA → DFA"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" /> NFA → DFA
        </Button>
      )}

      <Button
        onClick={handleInstantMinimize}
        variant="secondary"
        className="!px-2.5 !py-1 text-xs flex items-center gap-1.5 !bg-white/5 hover:!bg-[#00e5a3]/20 hover:!text-[#00e5a3]"
        title="1-Click DFA Minimization"
      >
        <Sparkles className="w-3.5 h-3.5" /> Minimize
      </Button>

      <Button
        onClick={handleInstantComplement}
        variant="secondary"
        className="!px-2.5 !py-1 text-xs flex items-center gap-1.5 !bg-white/5 hover:!bg-[#00e5a3]/20 hover:!text-[#00e5a3]"
        title="Complement Language (Invert Accept States)"
      >
        <RefreshCw className="w-3.5 h-3.5" /> ¬M
      </Button>

      <Button
        onClick={handleInstantReversal}
        variant="secondary"
        className="!px-2.5 !py-1 text-xs flex items-center gap-1.5 !bg-white/5 hover:!bg-[#00e5a3]/20 hover:!text-[#00e5a3]"
        title="Reverse Language (Mᴿ)"
      >
        <Binary className="w-3.5 h-3.5" /> Mᴿ
      </Button>

      <Button
        onClick={handleInstantRegularGrammar}
        variant="secondary"
        className="!px-2.5 !py-1 text-xs flex items-center gap-1.5 !bg-white/5 hover:!bg-[#00e5a3]/20 hover:!text-[#00e5a3]"
        title="Convert to Regular Grammar"
      >
        <Type className="w-3.5 h-3.5" /> Grammar
      </Button>

      <div className="w-px h-4 bg-white/10 mx-1" />

      <Button
        onClick={onOpenConversionHub}
        className="!px-3 !py-1 text-xs flex items-center gap-1.5 bg-gradient-to-r from-[#00e5a3] to-[#8b5cf6] text-black font-bold border-none"
        title="Open Full Conversions & Transformations Hub"
      >
        <BookOpen className="w-3.5 h-3.5" /> Conversion Hub
      </Button>

      {grammarResult && (
        <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-max max-w-md bg-black/90 backdrop-blur-md border border-[#00e5a3]/30 rounded-xl shadow-2xl p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#00e5a3]">Regular Grammar</span>
            <button onClick={() => setGrammarResult(null)} className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer text-xs leading-none">×</button>
          </div>
          <pre className="text-[11px] font-mono text-slate-200 whitespace-pre-wrap m-0">{grammarResult}</pre>
        </div>
      )}
    </div>
  );
};
