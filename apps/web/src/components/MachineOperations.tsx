import { useEffect, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background } from '@xyflow/react';
import { GitCompare, Combine as CombineIcon, ArrowRight } from 'lucide-react';
import { nodeTypes, edgeTypes } from '@autometa/graph-engine';
import { Button } from '@autometa/ui';
import {
  findLanguageCounterexample, combineDFASteps, complementDFA,
  concatenateNFA, starNFA, reverseNFA, nfaToDfa,
} from '@autometa/rule-engine';
import type { CombineDfaWalkthrough, DfaLanguageOperation } from '@autometa/rule-engine';
import { simulateNFA } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';
import { toAutomaton, automatonToFlow } from '../utils/flowAutomaton';
import type { AutomatonType } from '../utils/flowAutomaton';
import { PREDEFINED_TEMPLATES } from '../data/templates';
import { useGraphStore } from '../store/useGraphStore';
import type { UseProjectLibrary } from '../hooks/useProjectLibrary';
import { useToast } from './ToastProvider';

type LanguageOperation = DfaLanguageOperation | 'complement' | 'concatenation' | 'star' | 'reversal';

interface MachineSlot {
  label: string;
  automaton: Automaton;
  type: AutomatonType;
}

interface MachineOperationsProps {
  library: UseProjectLibrary;
  onLoadAutomaton: (automaton: Automaton, type: AutomatonType) => void;
}

// Union/intersection/difference/complement/concatenation/star/reversal are only
// well-defined over accept/reject languages — Mealy/Moore (output machines) and
// PDA/TM (stack/tape semantics) don't fit this model.
const FA_TYPES: AutomatonType[] = ['DFA', 'NFA'];
const UNARY_OPS = new Set<LanguageOperation>(['complement', 'star', 'reversal']);
const DETERMINISTIC_RESULT_OPS = new Set<LanguageOperation>(['union', 'intersection', 'difference', 'complement']);

const AutomatonPreview = ({ automaton, emptyLabel }: { automaton: Automaton | null; emptyLabel: string }) => {
  if (!automaton || automaton.nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-slate-500 border border-dashed border-white/10 rounded-xl">
        {emptyLabel}
      </div>
    );
  }
  const { nodes, edges } = automatonToFlow(automaton);
  return (
    <div className="flex-1 rounded-xl border border-white/10 bg-black/20 overflow-hidden">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background color="#1e293b" gap={20} size={1} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

/** Standalone workspace for Phase 2's machine-equivalence and language-operation tools: pick two DFA/NFA machines (canvas, a built-in template, or a saved project) and either check equivalence or combine them. */
export const MachineOperations = ({ library, onLoadAutomaton }: MachineOperationsProps) => {
  const { nodes, edges, automatonType } = useGraphStore();
  const { showToast } = useToast();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { library.refresh(); }, []);

  const [mode, setMode] = useState<'compare' | 'combine'>('compare');
  const [slotA, setSlotA] = useState<MachineSlot | null>(null);
  const [slotB, setSlotB] = useState<MachineSlot | null>(null);
  const [operation, setOperation] = useState<LanguageOperation>('union');

  const [compareResult, setCompareResult] = useState<{ equivalent: boolean; counterexample?: string; acceptedByA?: boolean; acceptedByB?: boolean } | null>(null);
  const [combineResult, setCombineResult] = useState<Automaton | null>(null);
  const [walkthrough, setWalkthrough] = useState<CombineDfaWalkthrough | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isUnary = UNARY_OPS.has(operation);

  const options = (() => {
    const list: Array<{ key: string; label: string; load: () => MachineSlot }> = [];
    if (FA_TYPES.includes(automatonType) && nodes.length > 0) {
      list.push({
        key: 'canvas',
        label: `Current canvas (${automatonType})`,
        load: () => ({ label: 'Current canvas', automaton: toAutomaton(nodes, edges, automatonType), type: automatonType }),
      });
    }
    PREDEFINED_TEMPLATES.filter(template => FA_TYPES.includes(template.type)).forEach((template, index) => {
      list.push({
        key: `template-${index}`,
        label: template.name,
        load: () => ({ label: template.name, automaton: toAutomaton(template.nodes, template.edges, template.type as AutomatonType), type: template.type as AutomatonType }),
      });
    });
    library.projects.filter(project => FA_TYPES.includes(project.automaton_type as AutomatonType)).forEach(project => {
      list.push({
        key: `project-${project.id}`,
        label: `${project.name} (saved)`,
        load: () => ({
          label: project.name,
          automaton: toAutomaton(JSON.parse(project.nodes_json), JSON.parse(project.edges_json), project.automaton_type as AutomatonType),
          type: project.automaton_type as AutomatonType,
        }),
      });
    });
    return list;
  })();

  const clearResults = () => {
    setCompareResult(null);
    setCombineResult(null);
    setWalkthrough(null);
    setError(null);
  };

  const handlePick = (slotKey: 'A' | 'B', key: string) => {
    const setSlot = slotKey === 'A' ? setSlotA : setSlotB;
    const option = options.find(o => o.key === key);
    if (!option) { setSlot(null); clearResults(); return; }
    try {
      setSlot(option.load());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load that machine.', 'error');
    }
    clearResults();
  };

  const ensureDfa = (slot: MachineSlot): Automaton => {
    if (slot.type === 'DFA') return slot.automaton;
    showToast(`"${slot.label}" isn't a DFA — determinizing it first (NFA → DFA subset construction).`, 'info');
    return nfaToDfa(slot.automaton);
  };

  const runCompare = () => {
    if (!slotA || !slotB) return;
    try {
      const result = findLanguageCounterexample(slotA.automaton, slotB.automaton);
      if (result.equivalent) {
        setCompareResult({ equivalent: true });
      } else {
        setCompareResult({
          equivalent: false,
          counterexample: result.counterexample,
          acceptedByA: simulateNFA(slotA.automaton, result.counterexample!).accepted,
          acceptedByB: simulateNFA(slotB.automaton, result.counterexample!).accepted,
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compare these machines.');
    }
  };

  const runCombine = () => {
    if (!slotA || (!isUnary && !slotB)) return;
    setWalkthrough(null);
    setCombineResult(null);
    try {
      if (operation === 'complement') {
        setCombineResult(complementDFA(ensureDfa(slotA)));
      } else if (operation === 'star') {
        setCombineResult(starNFA(slotA.automaton));
      } else if (operation === 'reversal') {
        setCombineResult(reverseNFA(slotA.automaton));
      } else if (operation === 'concatenation') {
        setCombineResult(concatenateNFA(slotA.automaton, slotB!.automaton));
      } else {
        const steps = combineDFASteps(ensureDfa(slotA), ensureDfa(slotB!), operation);
        setWalkthrough(steps);
        setStepIndex(0);
        setCombineResult(steps.finalDfa);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not combine these machines.');
    }
  };

  const resultType: AutomatonType = DETERMINISTIC_RESULT_OPS.has(operation) ? 'DFA' : 'NFA';

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar bg-[#050811] p-8 gap-6">
      <header className="flex items-center justify-between shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {mode === 'compare' ? <GitCompare className="w-5 h-5 text-[#00e5a3]" /> : <CombineIcon className="w-5 h-5 text-[#00e5a3]" />}
          <span className="text-sm font-black uppercase tracking-widest text-slate-100">Compare & Combine</span>
        </div>
        <div className="flex bg-black/40 p-1 rounded-lg border border-white/5 text-xs font-bold" role="tablist" aria-label="Mode">
          {(['compare', 'combine'] as const).map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); clearResults(); }}
              className={`px-4 py-1.5 rounded-md uppercase cursor-pointer border-none transition-all focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30 ${
                mode === m ? 'bg-gradient-to-r from-[#00e5a3] to-[#8b5cf6] text-black font-extrabold' : 'text-slate-400 hover:text-white bg-transparent'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      <p className="text-xs text-slate-500 shrink-0">
        Only DFA/NFA machines are listed here — Mealy, Moore, PDA, and TM don't have the accept/reject language semantics these tools compare or combine.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
        {(['A', 'B'] as const).map(slotKey => {
          const slot = slotKey === 'A' ? slotA : slotB;
          const disabled = mode === 'combine' && isUnary && slotKey === 'B';
          return (
            <div key={slotKey} className={`flex flex-col gap-2 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
              <label htmlFor={`machine-slot-${slotKey}`} className="text-[10px] font-black text-[#00e5a3] uppercase tracking-widest">
                Machine {slotKey}{disabled ? ' (not used by this operation)' : ''}
              </label>
              <select
                id={`machine-slot-${slotKey}`}
                value=""
                onChange={event => handlePick(slotKey, event.target.value)}
                disabled={disabled}
                className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
              >
                <option value="">{slot ? slot.label : 'Choose a machine…'}</option>
                {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <div className="h-56 flex">
                <AutomatonPreview automaton={slot?.automaton ?? null} emptyLabel="No machine selected" />
              </div>
            </div>
          );
        })}
      </div>

      {mode === 'compare' ? (
        <div className="flex flex-col gap-4">
          <Button disabled={!slotA || !slotB} onClick={runCompare} className="self-start">Check Equivalence</Button>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {compareResult && (
            compareResult.equivalent ? (
              <div className="p-4 rounded-xl border border-[#00e5a3]/30 bg-[#00e5a3]/10 text-sm text-[#00e5a3] font-semibold">
                Equivalent — both machines accept exactly the same language.
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-amber-400/30 bg-amber-400/10 text-sm text-amber-200 flex flex-col gap-1.5">
                <p className="font-semibold">Not equivalent.</p>
                <p>Shortest distinguishing string: <code className="px-1.5 py-0.5 rounded bg-black/30 font-mono">{compareResult.counterexample || 'ε (empty string)'}</code></p>
                <p className="text-xs text-amber-300/80">
                  Machine A {compareResult.acceptedByA ? 'accepts' : 'rejects'} it; Machine B {compareResult.acceptedByB ? 'accepts' : 'rejects'} it.
                </p>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={operation}
              onChange={event => { setOperation(event.target.value as LanguageOperation); clearResults(); }}
              className="bg-black/50 border border-white/10 rounded-lg p-2 text-xs text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
            >
              <option value="union">Union (A ∪ B)</option>
              <option value="intersection">Intersection (A ∩ B)</option>
              <option value="difference">Difference (A − B)</option>
              <option value="complement">Complement (¬A)</option>
              <option value="concatenation">Concatenation (A · B)</option>
              <option value="star">Kleene Star (A*)</option>
              <option value="reversal">Reversal (Aᴿ)</option>
            </select>
            <Button disabled={!slotA || (!isUnary && !slotB)} onClick={runCombine}>Run</Button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}

          {walkthrough && walkthrough.rows.length > 0 && (
            <div className="p-4 rounded-xl border border-white/10 bg-black/20 flex flex-col gap-2">
              <p className="text-xs font-bold text-slate-300">Product construction — step {stepIndex + 1} of {walkthrough.rows.length}</p>
              {walkthrough.rows[stepIndex] && (
                <p className="text-xs text-slate-400 font-mono">
                  Processing pair ⟨{walkthrough.rows[stepIndex].leftLabel}, {walkthrough.rows[stepIndex].rightLabel}⟩ → new state {walkthrough.rows[stepIndex].label}
                  {walkthrough.rows[stepIndex].isAccept ? ' (accepting)' : ''}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" disabled={stepIndex <= 0} onClick={() => setStepIndex(i => i - 1)}>Prev</Button>
                <Button variant="secondary" disabled={stepIndex >= walkthrough.rows.length - 1} onClick={() => setStepIndex(i => i + 1)}>Next</Button>
              </div>
            </div>
          )}

          {combineResult && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-[#00e5a3] uppercase tracking-widest">Result</label>
              <div className="h-64 flex">
                <AutomatonPreview automaton={combineResult} emptyLabel="No result" />
              </div>
              <Button onClick={() => onLoadAutomaton(combineResult, resultType)} className="self-start flex items-center gap-1.5">
                Load onto Canvas <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
