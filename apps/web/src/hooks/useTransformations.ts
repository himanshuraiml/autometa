import { useEffect, useRef, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  nfaToDfaSteps, minimizeDFASteps, regexToNfaSteps, computePumpingDecomposition, pumpString,
  dfaToRegexSteps, regexToAst, nfaToRegularGrammar,
} from '@autometa/rule-engine';
import type {
  NfaToDfaWalkthrough, MinimizationWalkthrough, RegexNfaStep, PumpingDecomposition,
  DfaToRegexWalkthrough, RegexAstNode,
} from '@autometa/rule-engine';
import { simulateDFA } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';
import { useGraphStore } from '../store/useGraphStore';
import { automatonToFlow } from '../utils/flowAutomaton';

export type TransformState =
  | { kind: 'nfaToDfa'; walkthrough: NfaToDfaWalkthrough }
  | { kind: 'minimize'; walkthrough: MinimizationWalkthrough }
  | { kind: 'regexToNfa'; steps: RegexNfaStep[] }
  | { kind: 'pumpingLemma'; decomposition: PumpingDecomposition }
  | { kind: 'dfaToRegex'; walkthrough: DfaToRegexWalkthrough };

interface UseTransformationsArgs {
  stopSimulation: () => void;
  getAutomatonData: () => Automaton;
  /** Pumping lemma runs on the string currently in the Simulation Input field. */
  inputString: string;
}

/**
 * The step-by-step algorithm walkthroughs (NFA→DFA, minimization, regex→NFA,
 * pumping lemma): their state machine, the canvas highlighting effect, and
 * the "apply result to canvas" actions.
 */
export function useTransformations({ stopSimulation, getAutomatonData, inputString }: UseTransformationsArgs) {
  const { nodes, edges, nodeCounter, loadGraph, setAutomatonType } = useGraphStore();

  const [transform, setTransform] = useState<TransformState | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  // Snapshot of canvas content just before a regex->NFA walkthrough starts, so
  // Exit can restore it (the walkthrough previews each build step directly on
  // canvas, replacing whatever was there, unlike NFA->DFA/Minimize which only
  // highlight subsets of the unchanged source graph).
  const preRegexCanvasRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [regexInput, setRegexInput] = useState('');
  const [regexError, setRegexError] = useState<string | null>(null);
  const [regexAst, setRegexAst] = useState<RegexAstNode | null>(null);

  const [pumpingLemmaError, setPumpingLemmaError] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<string | null>(null);
  const [pumpCount, setPumpCount] = useState(2);

  const applyLayoutToAutomaton = (automaton: Automaton, options?: { preserveHistory?: boolean }) => {
    const flow = automatonToFlow(automaton);
    loadGraph(flow.nodes, flow.edges, automaton.nodes.length + 1, options);
  };

  const setActiveHighlights = (activeIds: string[]) => {
    useGraphStore.setState((state) => ({
      nodes: state.nodes.map(n => ({
        ...n,
        data: { ...n.data, isActive: activeIds.includes(n.id) }
      }))
    }));
  };

  // Drive the canvas preview/highlighting as the user steps through a walkthrough.
  useEffect(() => {
    if (transform?.kind === 'regexToNfa') {
      const step = transform.steps[stepIndex];
      if (step) {
        applyLayoutToAutomaton(step.fragment, { preserveHistory: true });
      }
    } else if (transform?.kind === 'nfaToDfa') {
      const currentRow = transform.walkthrough.rows[stepIndex];
      if (currentRow) {
        setActiveHighlights(currentRow.subset);
      }
    } else if (transform?.kind === 'pumpingLemma') {
      const decomp = transform.decomposition;
      let activeIds: string[] = [];
      if (stepIndex === 0) {
        activeIds = decomp.statePath;
      } else if (stepIndex === 1 || stepIndex === 2) {
        activeIds = [decomp.statePath[decomp.repeatIndexI]];
      } else if (stepIndex === 3) {
        const pumped = pumpString(decomp, pumpCount);
        const result = simulateDFA(getAutomatonData(), pumped);
        activeIds = result.events.filter(e => e.event === 'enter_state').map(e => e.stateId!);
      }
      setActiveHighlights(activeIds);
    } else {
      setActiveHighlights([]);
    }
  }, [transform, stepIndex, pumpCount]);

  const handleNfaToDfa = () => {
    stopSimulation();
    const nfa = getAutomatonData();
    setTransform({ kind: 'nfaToDfa', walkthrough: nfaToDfaSteps(nfa) });
    setStepIndex(0);
  };

  const handleMinimizeDfa = () => {
    stopSimulation();
    const dfa = getAutomatonData();
    setTransform({ kind: 'minimize', walkthrough: minimizeDFASteps(dfa) });
    setStepIndex(0);
  };

  // Regex -> NFA (Thompson's Construction) walkthrough. Unlike NFA-to-DFA/Minimize
  // (which highlight subsets of an unchanged source graph), this builds up a brand
  // new NFA fragment by fragment, previewing each step directly on canvas — so we
  // snapshot whatever was there first and restore it if the user exits early.
  const handleRegexToNfa = () => {
    try {
      const steps = regexToNfaSteps(regexInput);
      stopSimulation();
      preRegexCanvasRef.current = { nodes, edges };
      setRegexError(null);
      try {
        setRegexAst(regexToAst(regexInput));
      } catch {
        setRegexAst(null); // AST is a bonus view; never block the NFA build on it.
      }
      setTransform({ kind: 'regexToNfa', steps });
      setStepIndex(0);
    } catch (err) {
      setRegexError(err instanceof Error ? err.message : 'Invalid regular expression.');
    }
  };

  // Pumping Lemma (DFA): demonstrates the pigeonhole argument on the current
  // canvas DFA using the string already typed into the Simulation Input field.
  const handlePumpingLemma = () => {
    try {
      const dfa = getAutomatonData();
      const decomposition = computePumpingDecomposition(dfa, inputString);
      stopSimulation();
      setPumpingLemmaError(null);
      setPumpCount(2);
      setTransform({ kind: 'pumpingLemma', decomposition });
      setStepIndex(0);
    } catch (err) {
      setPumpingLemmaError(err instanceof Error ? err.message : 'Could not apply the Pumping Lemma to this string.');
    }
  };

  const handleDfaToRegex = () => {
    try {
      stopSimulation();
      setTransform({ kind: 'dfaToRegex', walkthrough: dfaToRegexSteps(getAutomatonData()) });
      setStepIndex(0);
    } catch (err) {
      showConversionError(err);
    }
  };

  // NFA/DFA -> right-linear regular grammar: a lightweight text result (like
  // DFA->Regex used to be), not a step walkthrough — there's no natural
  // "step" to a single state->nonterminal, transition->production mapping.
  const handleNfaToRegularGrammar = () => {
    try {
      const grammar = nfaToRegularGrammar(getAutomatonData());
      const lines = Object.keys(grammar).map(nt => `${nt} → ${grammar[nt].map(p => p || 'ε').join(' | ')}`);
      setConversionResult(lines.join('\n'));
    } catch (err) {
      showConversionError(err);
    }
  };

  const showConversionError = (err: unknown) => {
    setConversionResult(err instanceof Error ? err.message : 'Could not convert this machine.');
  };

  const exitTransformation = () => {
    if (transform?.kind === 'regexToNfa' && preRegexCanvasRef.current) {
      loadGraph(preRegexCanvasRef.current.nodes, preRegexCanvasRef.current.edges, nodeCounter, { preserveHistory: true });
    }
    preRegexCanvasRef.current = null;
    setTransform(null);
    setActiveHighlights([]);
  };

  const applyRegexNfaToCanvas = () => {
    if (transform?.kind !== 'regexToNfa') return;
    const finalNfa = transform.steps[transform.steps.length - 1].fragment;
    preRegexCanvasRef.current = null;
    applyLayoutToAutomaton(finalNfa);
    setAutomatonType('NFA');
    setTransform(null);
  };

  const applyNfaToDfaToCanvas = () => {
    if (transform?.kind !== 'nfaToDfa') return;
    applyLayoutToAutomaton(transform.walkthrough.finalDfa);
    setAutomatonType('DFA');
    setTransform(null);
  };

  const applyMinimizationToCanvas = () => {
    if (transform?.kind !== 'minimize') return;
    applyLayoutToAutomaton(transform.walkthrough.finalDfa);
    setTransform(null);
  };

  return {
    transform,
    stepIndex, setStepIndex,
    regexInput, setRegexInput,
    regexError, setRegexError,
    regexAst,
    pumpingLemmaError, setPumpingLemmaError,
    conversionResult, setConversionResult,
    pumpCount, setPumpCount,
    handleNfaToDfa,
    handleMinimizeDfa,
    handleRegexToNfa,
    handlePumpingLemma,
    handleDfaToRegex,
    handleNfaToRegularGrammar,
    exitTransformation,
    applyRegexNfaToCanvas,
    applyNfaToDfaToCanvas,
    applyMinimizationToCanvas,
  };
}

export type Transformations = ReturnType<typeof useTransformations>;
