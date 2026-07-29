import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Play, RefreshCw, Layers, AlertTriangle, CheckCircle, Search } from 'lucide-react';
import {
  cykParse,
  cykParseTable,
  cfgToCNFSteps,
  cfgToGNFSteps,
  cfgToPDASteps,
  eliminateLeftRecursionSteps,
  leftFactorGrammarSteps,
  removeEpsilonProductions,
  removeUnitProductions,
  removeUselessSymbols,
  classifyGrammar,
  regularGrammarToNfa,
  computeFirstAndFollow,
  generateLL1Table,
  generateSLR1Table,
  findDerivationTrees,
  findAmbiguousStringInLanguage,
} from '@autometa/rule-engine';
import type { ParseTreeNode, ParseTreeDerivation, DerivationTreeStep, CfgTransformStep, CfgToPdaStep, CykTableCell, CFGRules } from '@autometa/rule-engine';
import type { Automaton } from '@autometa/simulation-engine';
import { GRAMMAR_EXAMPLES } from '../data/templates';
import type { AutomatonType } from '../utils/flowAutomaton';
import { useToast } from './ToastProvider';
import { TestSuitePanel } from './TestSuitePanel';
import type { MachineTestCase } from '../store/useGraphStore';
import { SymbolPalette, autoReplaceFormalSymbols } from './SymbolPalette';
import { ChomskyInspector } from './ChomskyInspector';

interface Rule {
  left: string;
  right: string[];
}

interface GrammarEditorProps {
  onLoadAutomaton: (automaton: Automaton, type: AutomatonType) => void;
  /** Rules pushed in from an external conversion (e.g. the Conversion Hub's PDA -> CFG tab). */
  initialRules?: CFGRules | null;
}

const toGrammarObj = (rules: Rule[]): CFGRules => {
  const grammarObj: CFGRules = {};
  rules.forEach(r => { grammarObj[r.left] = r.right.map(prod => prod.trim() === 'ε' ? '' : prod); });
  return grammarObj;
};

const fromGrammarObj = (grammar: CFGRules): Rule[] =>
  Object.entries(grammar).map(([left, right]) => ({ left, right: right.map(p => p.trim() === '' ? 'ε' : p) }));

const formatRulesList = (g: CFGRules): string[] =>
  Object.keys(g).map(nt => `${nt} → ${g[nt].map(p => p === '' ? 'ε' : p).join(' | ')}`);

const formatAutomatonSummary = (automaton: Automaton): string =>
  automaton.edges.map(e => `${e.source} --[${e.symbols.join(', ')}]--> ${e.target}`).join('\n') || '(no transitions yet)';

const ParseTree = ({ node, highlightId }: { node: ParseTreeNode; highlightId?: string }) => (
  <li className="flex flex-col items-center min-w-max">
    <span className={`px-2 py-1 rounded border text-xs font-mono ${node.id === highlightId ? 'border-amber-300 bg-amber-300/20 text-amber-100 ring-2 ring-amber-300/40' : node.children.length ? 'border-[#8b5cf6]/40 bg-[#8b5cf6]/10 text-[#ddd6fe]' : 'border-[#00e5a3]/30 bg-[#00e5a3]/10 text-[#a7f3d0]'}`}>{node.symbol}</span>
    {node.children.length > 0 && <ul className="mt-3 pt-3 border-t border-white/10 flex gap-3 justify-center">{node.children.map(child => <ParseTree key={child.id} node={child} highlightId={highlightId} />)}</ul>}
  </li>
);

/** Prev/Next control shared by every step-trace walkthrough in this editor (CNF/GNF/PDA/rewrite/parser). */
const StepperControls = ({ index, total, onPrev, onNext }: { index: number; total: number; onPrev: () => void; onNext: () => void }) => (
  <div className="flex items-center gap-2 mt-1">
    <button disabled={index <= 0} onClick={onPrev} className="text-[10px] px-2.5 py-1 rounded border border-white/10 text-slate-300 hover:bg-white/5 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
    <span className="text-[10px] text-slate-500">Step {index + 1} of {total}</span>
    <button disabled={index >= total - 1} onClick={onNext} className="text-[10px] px-2.5 py-1 rounded border border-white/10 text-slate-300 hover:bg-white/5 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
  </div>
);

export const GrammarEditor: React.FC<GrammarEditorProps> = ({ onLoadAutomaton, initialRules }) => {
  const { showToast } = useToast();
  // Pre-seed with Balanced Parentheses grammar: S -> ( S ) | ε — unless rules were
  // pushed in externally (e.g. a PDA -> CFG conversion loaded from the Conversion Hub).
  const [rules, setRules] = useState<Rule[]>(() =>
    initialRules ? fromGrammarObj(initialRules) : [{ left: 'S', right: ['( S )', '()', 'ε'] }]
  );
  const [newLeft, setNewLeft] = useState('');
  const [newRight, setNewRight] = useState('');

  // Derivation Tab state
  const [derivationInput, setDerivationInput] = useState('(())');
  const [derivationSteps, setDerivationSteps] = useState<string[]>([]);
  const [derivationStatus, setDerivationStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [ambiguityEvidence, setAmbiguityEvidence] = useState<ParseTreeDerivation[]>([]);
  const [parseTree, setParseTree] = useState<ParseTreeNode | null>(null);
  const [ambiguitySweepMessage, setAmbiguitySweepMessage] = useState<string | null>(null);
  const [derivationTreeSteps, setDerivationTreeSteps] = useState<DerivationTreeStep[]>([]);
  const [derivationTreeStepIndex, setDerivationTreeStepIndex] = useState(0);

  const [activeTab, setActiveTab] = useState<'derivation' | 'simplification' | 'parsing'>('derivation');

  // Simplification Tab state
  const [simplificationActive, setSimplificationActive] = useState(false);
  const [cnfWalkthrough, setCnfWalkthrough] = useState<{ steps: CfgTransformStep[]; result: CFGRules } | null>(null);
  const [cnfStepIndex, setCnfStepIndex] = useState(0);
  const [gnfWalkthrough, setGnfWalkthrough] = useState<{ steps: CfgTransformStep[]; result: CFGRules } | null>(null);
  const [gnfStepIndex, setGnfStepIndex] = useState(0);
  const [rewriteWalkthrough, setRewriteWalkthrough] = useState<{ kind: 'left-recursion' | 'left-factor'; steps: CfgTransformStep[]; result: CFGRules } | null>(null);
  const [rewriteStepIndex, setRewriteStepIndex] = useState(0);
  const [pdaWalkthrough, setPdaWalkthrough] = useState<{ steps: CfgToPdaStep[]; result: Automaton } | null>(null);
  const [pdaStepIndex, setPdaStepIndex] = useState(0);
  const [pdaError, setPdaError] = useState<string | null>(null);
  const [grammarToNfaError, setGrammarToNfaError] = useState<string | null>(null);
  const [grammarToolResult, setGrammarToolResult] = useState<{ label: string; text: string } | null>(null);

  // Parsing Tab state
  const [parserInput, setParserInput] = useState('(())');
  const [selectedParser, setSelectedParser] = useState<'LL1' | 'SLR1'>('LL1');
  const [parserSteps, setParserSteps] = useState<Array<{ stack: string; input: string; action: string }>>([]);
  const [parserVisibleCount, setParserVisibleCount] = useState(0);
  const [parserStatus, setParserStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [cykResult, setCykResult] = useState<{ accepted: boolean; table: CykTableCell[][] } | null>(null);
  // CFG test suite — parallels TestSuitePanel's canvas-automaton suites, but "running" a test here is
  // CYK parse-membership (below), not state-machine simulation, so it's kept local to the grammar rules.
  const [cfgTests, setCfgTests] = useState<MachineTestCase[]>([]);

  // LL(1) generated tables — cells hold every production landing there (normally one; more means a conflict).
  const [ll1TableData, setLl1TableData] = useState<{
    terminals: string[];
    nonTerminals: string[];
    table: Record<string, Record<string, string[]>>;
    conflicts: string[];
  } | null>(null);
  const [firstFollow, setFirstFollow] = useState<{ first: Record<string, string[]>; follow: Record<string, string[]>; nullable: string[] }>({ first: {}, follow: {}, nullable: [] });

  // SLR(1) generated tables
  const [slrTableData, setSlrTableData] = useState<{
    states: any[];
    terminals: string[];
    nonTerminals: string[];
    actionTable: any;
    gotoTable: any;
    conflicts: string[];
  } | null>(null);

  // Re-generate parsing tables whenever grammar rules change
  useEffect(() => {
    if (rules.length === 0) return;
    const grammarObj = toGrammarObj(rules);
    const startSymbol = rules[0].left;

    try {
      const sets = computeFirstAndFollow(grammarObj, startSymbol);
      setFirstFollow({
        first: Object.fromEntries(Object.entries(sets.first).map(([nt, values]) => [nt, [...values].sort()])),
        follow: Object.fromEntries(Object.entries(sets.follow).map(([nt, values]) => [nt, [...values].sort()])),
        nullable: [...sets.nullable].sort(),
      });
      const ll1Result = generateLL1Table(grammarObj, startSymbol);
      const allTerminals = new Set<string>();
      Object.keys(grammarObj).forEach(nt => {
        grammarObj[nt].forEach(prod => {
          prod.split(/\s+/).filter(Boolean).forEach(sym => {
            if (!Object.keys(grammarObj).includes(sym) && sym !== 'ε') {
              allTerminals.add(sym);
            }
          });
        });
      });
      allTerminals.add('$');

      setLl1TableData({
        terminals: Array.from(allTerminals).sort(),
        nonTerminals: Object.keys(grammarObj),
        table: ll1Result.table,
        conflicts: ll1Result.conflicts
      });
    } catch {
      setLl1TableData(null);
      setFirstFollow({ first: {}, follow: {}, nullable: [] });
    }

    try {
      const slrResult = generateSLR1Table(grammarObj, startSymbol);
      setSlrTableData(slrResult);
    } catch {
      setSlrTableData(null);
    }
  }, [rules]);

  const addRule = () => {
    if (!newLeft.trim() || !newRight.trim()) return;
    const alternatives = newRight.split('|').map(s => s.trim());
    setRules([...rules, { left: newLeft.trim(), right: alternatives }]);
    setNewLeft('');
    setNewRight('');
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const loadGrammarExample = (index: number) => {
    const example = GRAMMAR_EXAMPLES[index];
    if (!example) return;

    setRules(example.rules.map(rule => ({ ...rule, right: [...rule.right] })));
    setDerivationInput(example.input);
    setParserInput(example.input);
    setDerivationSteps([]);
    setParserSteps([]);
    setParserVisibleCount(0);
    setDerivationStatus('idle');
    setParserStatus('idle');
    setSimplificationActive(false);
    setCnfWalkthrough(null);
    setGnfWalkthrough(null);
    setRewriteWalkthrough(null);
    setPdaWalkthrough(null);
    setGrammarToolResult(null);
    setCykResult(null);
    setAmbiguitySweepMessage(null);
    setDerivationTreeSteps([]);
    setDerivationTreeStepIndex(0);
  };

  const runDerivation = () => {
    if (rules.length === 0) return;
    const grammarObj = toGrammarObj(rules);
    const startSymbol = rules[0].left;
    setAmbiguitySweepMessage(null);

    const derivations = findDerivationTrees(grammarObj, startSymbol, derivationInput, 2);
    if (derivations.length > 0) {
      setDerivationSteps(derivations[0].path);
      setDerivationStatus('success');
      setAmbiguityEvidence(derivations);
      setParseTree(derivations[0].tree);
      setDerivationTreeSteps(derivations[0].steps);
      setDerivationTreeStepIndex(0);
    } else {
      const isAccepted = cykParse(grammarObj, startSymbol, derivationInput);
      setDerivationSteps([
        `CYK parser result: String is ${isAccepted ? 'ACCEPTED' : 'REJECTED'}`,
        'No leftmost derivation path found within traversal limits.'
      ]);
      setDerivationStatus(isAccepted ? 'success' : 'failed');
      setAmbiguityEvidence([]);
      setParseTree(null);
      setDerivationTreeSteps([]);
      setDerivationTreeStepIndex(0);
    }
  };

  const scanForAmbiguity = () => {
    if (rules.length === 0) return;
    const grammarObj = toGrammarObj(rules);
    const startSymbol = rules[0].left;
    const found = findAmbiguousStringInLanguage(grammarObj, startSymbol);
    if (!found) {
      setAmbiguitySweepMessage('No ambiguous string found in a bounded sweep (strings up to length 5).');
      return;
    }
    setAmbiguitySweepMessage(null);
    setDerivationInput(found.input);
    setDerivationSteps(found.derivations[0].path);
    setDerivationStatus('success');
    setAmbiguityEvidence(found.derivations);
    setParseTree(found.derivations[0].tree);
    setDerivationTreeSteps(found.derivations[0].steps);
    setDerivationTreeStepIndex(0);
  };

  const triggerSimplification = () => {
    if (rules.length === 0) return;
    const grammarObj = toGrammarObj(rules);
    try {
      setCnfWalkthrough(cfgToCNFSteps(grammarObj));
      setCnfStepIndex(0);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to convert grammar to CNF.', 'error');
      setCnfWalkthrough(null);
    }
    try {
      setGnfWalkthrough(cfgToGNFSteps(grammarObj));
      setGnfStepIndex(0);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to convert grammar to GNF — it may have a cyclic dependency; try eliminating left recursion first.', 'error');
      setGnfWalkthrough(null);
    }
    setSimplificationActive(true);
  };

  const runRewrite = (kind: 'left-recursion' | 'left-factor') => {
    if (rules.length === 0) return;
    const grammarObj = toGrammarObj(rules);
    const walkthrough = kind === 'left-recursion' ? eliminateLeftRecursionSteps(grammarObj) : leftFactorGrammarSteps(grammarObj);
    setRewriteWalkthrough({ kind, ...walkthrough });
    setRewriteStepIndex(0);
  };

  const convertToPda = () => {
    if (rules.length === 0) return;
    const grammarObj = toGrammarObj(rules);
    const startSymbol = rules[0].left;
    try {
      setPdaWalkthrough(cfgToPDASteps(grammarObj, startSymbol));
      setPdaStepIndex(0);
      setPdaError(null);
    } catch (err) {
      setPdaError(err instanceof Error ? err.message : 'Could not convert this grammar to a PDA.');
      setPdaWalkthrough(null);
    }
  };

  const convertToNfa = () => {
    if (rules.length === 0) return;
    const grammarObj = toGrammarObj(rules);
    const startSymbol = rules[0].left;
    try {
      const automaton = regularGrammarToNfa(grammarObj, startSymbol);
      setGrammarToNfaError(null);
      onLoadAutomaton(automaton, 'NFA');
    } catch (err) {
      setGrammarToNfaError(err instanceof Error ? err.message : 'This grammar is not right-linear.');
    }
  };

  const runGrammarTool = (tool: 'epsilon' | 'unit' | 'useless' | 'classify') => {
    if (rules.length === 0) return;
    const grammarObj = toGrammarObj(rules);
    const startSymbol = rules[0].left;
    if (tool === 'epsilon') {
      setGrammarToolResult({ label: 'ε-productions removed', text: formatRulesList(removeEpsilonProductions(grammarObj)).join('\n') });
    } else if (tool === 'unit') {
      setGrammarToolResult({ label: 'Unit productions removed', text: formatRulesList(removeUnitProductions(grammarObj)).join('\n') });
    } else if (tool === 'useless') {
      setGrammarToolResult({ label: 'Useless symbols removed', text: formatRulesList(removeUselessSymbols(grammarObj, startSymbol)).join('\n') || '(nothing left — the start symbol cannot generate a terminal string)' });
    } else {
      setGrammarToolResult({ label: 'Grammar classification', text: classifyGrammar(grammarObj) });
    }
  };

  const runCykTable = () => {
    if (rules.length === 0) return;
    const grammarObj = toGrammarObj(rules);
    const startSymbol = rules[0].left;
    setCykResult(cykParseTable(grammarObj, startSymbol, parserInput.trim()));
  };

  const addCfgTest = (input: string, expected: 'accept' | 'reject') =>
    setCfgTests(prev => [...prev, { id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, input, expected }]);
  const removeCfgTest = (id: string) => setCfgTests(prev => prev.filter(test => test.id !== id));
  /** Grammar-mode run for TestSuitePanel: parse-membership via CYK, not state-machine simulation. */
  const runCfgInput = (input: string): { accepted: boolean } =>
    rules.length === 0 ? { accepted: false } : { accepted: cykParse(toGrammarObj(rules), rules[0].left, input) };

  const runParserWalk = () => {
    if (rules.length === 0) return;
    const grammarObj = toGrammarObj(rules);
    const startSymbol = rules[0].left;
    const nonTerminals = new Set(Object.keys(grammarObj));

    const steps: Array<{ stack: string; input: string; action: string }> = [];
    const formattedInput = parserInput.trim();

    if (selectedParser === 'LL1') {
      if (!ll1TableData) {
        showToast("LL(1) table not generated or has compile errors.", 'error');
        return;
      }

      const stack: string[] = ['$', startSymbol];
      let inputPtr = 0;
      const inputChars = [...formattedInput.split(''), '$'];
      let stepsCount = 0;
      let ok = true;

      while (stack.length > 0 && stepsCount++ < 100) {
        const top = stack[stack.length - 1];
        const currentSymbol = inputChars[inputPtr];
        const prediction = ll1TableData.table[top]?.[currentSymbol];

        steps.push({
          stack: stack.join(' '),
          input: inputChars.slice(inputPtr).join(' '),
          action: top === currentSymbol && top === '$'
            ? 'Accept'
            : top === currentSymbol
              ? `Match "${currentSymbol}"`
              : nonTerminals.has(top)
                ? `Predict ${top} → ${prediction?.[0] || 'error'}`
                : 'Error'
        });

        if (top === currentSymbol && top === '$') {
          break;
        }

        if (top === currentSymbol) {
          stack.pop();
          inputPtr++;
        } else if (nonTerminals.has(top)) {
          const production = prediction?.[0];
          if (!production) {
            steps.push({
              stack: stack.join(' '),
              input: inputChars.slice(inputPtr).join(' '),
              action: `Syntax Error: No LL(1) rule for [${top}, ${currentSymbol}]`
            });
            ok = false;
            break;
          }
          stack.pop();
          if (production !== 'ε' && production !== '') {
            const syms = production.split(/\s+/).filter(Boolean);
            for (let i = syms.length - 1; i >= 0; i--) {
              stack.push(syms[i]);
            }
          }
        } else {
          ok = false;
          break;
        }
      }
      setParserSteps(steps);
      setParserVisibleCount(steps.length > 0 ? 1 : 0);
      setParserStatus(ok ? 'success' : 'failed');

    } else {
      // SLR(1) Stack Walkthrough
      if (!slrTableData) {
        showToast("SLR(1) table not generated.", 'error');
        return;
      }

      const stateStack: number[] = [0];
      const symbolStack: string[] = [];
      let inputPtr = 0;
      const inputSymbols = [...formattedInput.split(''), '$'];
      let stepsCount = 0;
      let ok = true;

      while (stepsCount++ < 100) {
        const state = stateStack[stateStack.length - 1];
        const a = inputSymbols[inputPtr];
        const actions = slrTableData.actionTable[state]?.[a] || [];

        if (actions.length === 0) {
          steps.push({
            stack: `states: [${stateStack.join(', ')}] symbols: [${symbolStack.join(' ')}]`,
            input: inputSymbols.slice(inputPtr).join(' '),
            action: `Syntax Error: No SLR(1) transition for state ${state} on '${a}'`
          });
          ok = false;
          break;
        }

        // Pick first action (warn about conflicts in conflict log)
        const act = actions[0];

        steps.push({
          stack: `states: [${stateStack.join(', ')}] symbols: [${symbolStack.join(' ')}]`,
          input: inputSymbols.slice(inputPtr).join(' '),
          action: act.type === 'shift'
            ? `Shift state ${act.target}`
            : act.type === 'reduce'
              ? `Reduce by ${act.target}`
              : 'Accept'
        });

        if (act.type === 'accept') {
          break;
        }

        if (act.type === 'shift') {
          stateStack.push(parseInt(act.target));
          symbolStack.push(a);
          inputPtr++;
        } else if (act.type === 'reduce') {
          // e.g. "E -> E + T"
          const [lhs, rhsPart] = act.target.split('->').map((s: string) => s.trim());
          const rhsSymbols = rhsPart === 'ε' || rhsPart === '' ? [] : rhsPart.split(/\s+/).filter(Boolean);

          // Pop |RHS| states and symbols
          for (let i = 0; i < rhsSymbols.length; i++) {
            stateStack.pop();
            symbolStack.pop();
          }

          const topState = stateStack[stateStack.length - 1];
          const gotoState = slrTableData.gotoTable[topState]?.[lhs];

          if (gotoState === undefined) {
            steps.push({
              stack: `states: [${stateStack.join(', ')}] symbols: [${symbolStack.join(' ')}]`,
              input: inputSymbols.slice(inputPtr).join(' '),
              action: `GOTO error: No GOTO transition for state ${topState} on '${lhs}'`
            });
            ok = false;
            break;
          }

          stateStack.push(gotoState);
          symbolStack.push(lhs);
        } else {
          ok = false;
          break;
        }
      }
      setParserSteps(steps);
      setParserVisibleCount(steps.length > 0 ? 1 : 0);
      setParserStatus(ok ? 'success' : 'failed');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg-primary)] text-[var(--text-main)] p-6 border-l border-[var(--border-color)] overflow-y-auto">
      <div className="flex items-center justify-between mb-6 border-b border-[var(--border-color)] pb-4 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#00e5a3] animate-pulse" />
          <h2 className="text-sm font-black tracking-widest uppercase text-[var(--text-main)]">CFG & Parser Walkthroughs</h2>
        </div>
        {/* Switcher Tab */}
        <div className="flex bg-[var(--bg-secondary)] p-1 rounded-lg border border-[var(--border-color)] text-xs font-bold">
          {(['derivation', 'simplification', 'parsing'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md uppercase cursor-pointer border-none transition-all focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30 ${
                activeTab === tab
                  ? 'bg-gradient-to-r from-[#00e5a3] to-[#8b5cf6] text-black shadow-md font-extrabold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] bg-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Grammar Rules Definition Box */}
        <div className="lg:col-span-1 border border-[var(--border-color)] bg-[var(--card-bg)] p-4 rounded-xl flex flex-col gap-4 shadow-sm">
          <h3 className="text-[10px] font-black text-[#00e5a3] uppercase tracking-widest">Production Rules</h3>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="grammar-example" className="text-[10px] text-slate-400 uppercase font-bold">Grammar examples</label>
            <select
              id="grammar-example"
              defaultValue=""
              onChange={event => {
                if (event.target.value !== '') loadGrammarExample(Number(event.target.value));
                event.currentTarget.value = '';
              }}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-2 text-xs text-[var(--text-main)] font-medium focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30 focus:border-[#00e5a3]"
            >
              <option value="">Load an example…</option>
              {GRAMMAR_EXAMPLES.map((example, index) => (
                <option key={example.name} value={index}>{example.name}</option>
              ))}
            </select>
            <span className="text-[10px] text-[var(--text-muted)]">Five CFGs covering nesting, counting, palindromes, and expressions.</span>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-2 custom-scrollbar">
            {rules.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-[var(--border-color)] rounded-xl bg-[var(--bg-secondary)]/50 text-[var(--text-muted)] text-xs">
                <Layers className="w-6 h-6 mb-2 text-[var(--text-dim)]" />
                No rules defined. Add a production below to begin.
              </div>
            ) : (
              rules.map((rule, idx) => (
                <div key={idx} className="flex items-center justify-between bg-[var(--bg-secondary)] p-2.5 rounded-lg border border-[var(--border-color)] font-mono text-sm">
                  <span>
                    <strong className="text-[#00e5a3]">{rule.left}</strong>
                    <span className="text-[var(--text-muted)] mx-2">→</span>
                    <span className="text-[var(--text-main)]">{rule.right.map(r => r === '' || r === 'ε' ? 'ε' : r).join(' | ')}</span>
                  </span>
                  <button
                    onClick={() => removeRule(idx)}
                    className="text-xs text-red-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-1 focus:outline-none"
                    aria-label={`Remove rule for ${rule.left}`}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--border-color)] pt-3">
            <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Add Rule</span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Left"
                value={newLeft}
                onChange={e => setNewLeft(e.target.value)}
                className="w-16 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-2 text-center text-sm text-[#00e5a3] font-mono focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30 focus:border-[#00e5a3]"
                aria-label="New production rule left side"
              />
              <input
                type="text"
                placeholder="Right (e.g. a S b | ε)"
                value={newRight}
                onChange={e => setNewRight(autoReplaceFormalSymbols(e.target.value))}
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-2 text-sm text-[var(--text-main)] font-mono focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30 focus:border-[#00e5a3]"
                aria-label="New production rule right side alternatives"
              />
            </div>
            <SymbolPalette
              onInsertSymbol={(sym) => setNewRight(prev => prev ? `${prev} ${sym}` : sym)}
            />
            <button
              onClick={addRule}
              className="w-full bg-[#00e5a3] hover:bg-[#00c58c] text-black font-extrabold text-xs py-2 rounded-lg cursor-pointer border-none transition-all focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
            >
              Add Rule
            </button>
          </div>

          <ChomskyInspector rules={toGrammarObj(rules)} startSymbol={rules[0]?.left || 'S'} />
        </div>

        {/* Dynamic visualizers tabs */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {activeTab === 'derivation' && (
            <div className="flex-1 border border-white/5 bg-[#0b121e]/70 p-5 rounded-xl flex flex-col gap-4 shadow-md">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-[#8b5cf6] uppercase tracking-widest">Derivation Tree Engine</h3>
                <span className="text-[10px] text-slate-400">Derives S-productions leftmost</span>
              </div>

              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  placeholder="Input string (e.g. (()) )"
                  value={derivationInput}
                  onChange={e => setDerivationInput(e.target.value)}
                  className="bg-black/50 border border-white/10 rounded-lg p-2.5 text-sm text-white font-mono flex-1 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/30 focus:border-[#8b5cf6]"
                  aria-label="Input string for derivation"
                />
                <button
                  onClick={runDerivation}
                  className="flex items-center gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white px-4 py-2.5 rounded-lg text-xs cursor-pointer border-none font-bold transition-all shadow-glow-pink/20 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/30"
                >
                  <Play className="w-3.5 h-3.5" /> Derive String
                </button>
                <button
                  onClick={scanForAmbiguity}
                  className="flex items-center gap-2 bg-transparent border border-amber-300/30 text-amber-200 hover:bg-amber-300/10 px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                >
                  <Search className="w-3.5 h-3.5" /> Scan for Ambiguity
                </button>
              </div>
              {ambiguitySweepMessage && <p className="text-[11px] text-slate-500">{ambiguitySweepMessage}</p>}

              <div className="flex-1 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Derivation Steps</span>
                  {derivationStatus !== 'idle' && (
                    <span className={`text-xs font-bold flex items-center gap-1 ${derivationStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                      {derivationStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      {derivationStatus === 'success' ? 'Accepted' : 'Rejected'}
                    </span>
                  )}
                </div>
                <div className="flex-1 bg-black/30 border border-white/5 rounded-lg p-4 font-mono text-sm overflow-y-auto flex flex-col gap-4 custom-scrollbar">
                  {derivationSteps.length > 0 ? (
                    derivationSteps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-3 animate-fade-in">
                        <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-slate-400">Step {idx + 1}</span>
                        <span className="text-white font-semibold">{step}</span>
                        {idx < derivationSteps.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-500" />}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500 text-center py-12 text-xs">
                      Enter a string and click "Derive String" to show leftmost derivation path.
                    </div>
                  )}
                </div>
                {derivationSteps.length > 0 && (
                  <div className="border border-white/5 rounded-lg bg-black/20 p-3">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-2">Current derivation frontier</span>
                    <div className="flex flex-wrap gap-1.5">{derivationSteps[derivationSteps.length - 1].split(/\s+/).map((symbol, index) => <span key={`${symbol}-${index}`} className="px-2 py-1 rounded border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#d8b4fe] text-xs font-mono">{symbol}</span>)}</div>
                  </div>
                )}
                {ambiguityEvidence.length > 1 ? (
                  <div className="border border-amber-400/25 rounded-lg bg-amber-400/[0.05] p-3 flex flex-col gap-3">
                    <p className="text-xs text-amber-200"><strong>Ambiguity evidence found.</strong> This input has at least two distinct leftmost derivations, shown below side by side.</p>
                    <div className="grid grid-cols-2 gap-3 overflow-x-auto">
                      {ambiguityEvidence.slice(0, 2).map((derivation, i) => (
                        <div key={i} className="border border-white/5 rounded-lg bg-black/20 p-3 overflow-x-auto">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block mb-3">Derivation {i + 1}</span>
                          <ul className="w-max min-w-full flex justify-center"><ParseTree node={derivation.tree} /></ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : parseTree && (
                  <div className="border border-white/5 rounded-lg bg-black/20 p-3 overflow-x-auto">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-3">Parse tree</span>
                    <ul className="w-max min-w-full flex justify-center"><ParseTree node={parseTree} /></ul>
                  </div>
                )}
                {derivationTreeSteps.length > 0 && (
                  <div className="border border-white/5 rounded-lg bg-black/20 p-3 overflow-x-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Derivation tree (step-by-step)</span>
                      <span className="text-xs font-mono text-amber-200">{derivationTreeSteps[derivationTreeStepIndex].production}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-3">The highlighted node is the one rewritten at this step, growing from the start symbol to the full tree.</p>
                    <ul className="w-max min-w-full flex justify-center">
                      <ParseTree node={derivationTreeSteps[derivationTreeStepIndex].tree} highlightId={derivationTreeSteps[derivationTreeStepIndex].expandedNodeId} />
                    </ul>
                    <StepperControls
                      index={derivationTreeStepIndex}
                      total={derivationTreeSteps.length}
                      onPrev={() => setDerivationTreeStepIndex(i => Math.max(0, i - 1))}
                      onNext={() => setDerivationTreeStepIndex(i => Math.min(derivationTreeSteps.length - 1, i + 1))}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'simplification' && (
            <div className="flex-1 border border-white/5 bg-[#0b121e]/70 p-5 rounded-xl flex flex-col gap-4 shadow-md">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-[10px] font-black text-[#00e5a3] uppercase tracking-widest">Simplification & Conversion</h3>
                <button
                  onClick={triggerSimplification}
                  className="flex items-center gap-2 bg-transparent border border-[#00e5a3]/30 text-[#00e5a3] hover:bg-[#00e5a3]/10 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Run Simplifier
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                <div className="p-4 rounded-lg bg-black/40 border border-white/5 flex flex-col gap-2">
                  <span className="text-[10px] text-[#8b5cf6] font-bold uppercase tracking-wider">Chomsky Normal Form (CNF)</span>
                  {cnfWalkthrough ? (
                    <>
                      <p className="text-[10px] text-slate-500">{cnfWalkthrough.steps[cnfStepIndex].description}</p>
                      <div className="text-sm font-mono text-slate-300 whitespace-pre-line leading-relaxed">
                        {formatRulesList(cnfWalkthrough.steps[cnfStepIndex].rules).join('\n') || 'No rules.'}
                      </div>
                      <StepperControls index={cnfStepIndex} total={cnfWalkthrough.steps.length} onPrev={() => setCnfStepIndex(i => i - 1)} onNext={() => setCnfStepIndex(i => i + 1)} />
                    </>
                  ) : (
                    <div className="text-sm font-mono text-slate-300">
                      {simplificationActive ? 'CNF conversion failed — see the error toast.' : "Click 'Run Simplifier' to convert grammar to Chomsky Normal Form."}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-black/40 border border-white/5 flex flex-col gap-2">
                  <span className="text-[10px] text-[#00e5a3] font-bold uppercase tracking-wider">Greibach Normal Form (GNF)</span>
                  {gnfWalkthrough ? (
                    <>
                      <p className="text-[10px] text-slate-500">{gnfWalkthrough.steps[gnfStepIndex].description}</p>
                      <div className="text-sm font-mono text-slate-300 whitespace-pre-line leading-relaxed">
                        {formatRulesList(gnfWalkthrough.steps[gnfStepIndex].rules).join('\n') || 'No rules.'}
                      </div>
                      <StepperControls index={gnfStepIndex} total={gnfWalkthrough.steps.length} onPrev={() => setGnfStepIndex(i => i - 1)} onNext={() => setGnfStepIndex(i => i + 1)} />
                    </>
                  ) : (
                    <div className="text-sm font-mono text-slate-300">
                      {simplificationActive ? 'GNF conversion failed — see the error toast (cyclic grammars need left recursion eliminated first).' : "Click 'Run Simplifier' to convert grammar to Greibach Normal Form."}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-black/40 border border-white/5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">Rewrite: left recursion / left factoring</span>
                    <div className="flex gap-2">
                      <button onClick={() => runRewrite('left-recursion')} className="text-[10px] px-2.5 py-1.5 rounded border border-[#8b5cf6]/30 text-[#c4b5fd] hover:bg-[#8b5cf6]/10 bg-transparent cursor-pointer">Remove left recursion</button>
                      <button onClick={() => runRewrite('left-factor')} className="text-[10px] px-2.5 py-1.5 rounded border border-[#00e5a3]/30 text-[#00e5a3] hover:bg-[#00e5a3]/10 bg-transparent cursor-pointer">Left factor</button>
                    </div>
                  </div>
                  {rewriteWalkthrough && (
                    <>
                      <p className="text-[10px] text-slate-500">{rewriteWalkthrough.kind === 'left-recursion' ? 'Eliminating left recursion' : 'Left-factoring'} — {rewriteWalkthrough.steps[rewriteStepIndex].description}</p>
                      <div className="text-sm font-mono text-slate-300 whitespace-pre-line leading-relaxed">
                        {formatRulesList(rewriteWalkthrough.steps[rewriteStepIndex].rules).join('\n')}
                      </div>
                      <StepperControls index={rewriteStepIndex} total={rewriteWalkthrough.steps.length} onPrev={() => setRewriteStepIndex(i => i - 1)} onNext={() => setRewriteStepIndex(i => i + 1)} />
                    </>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-black/40 border border-white/5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">CFG → PDA</span>
                    <button onClick={convertToPda} className="text-[10px] px-2.5 py-1.5 rounded border border-amber-300/30 text-amber-200 hover:bg-amber-300/10 bg-transparent cursor-pointer">Convert to PDA</button>
                  </div>
                  {pdaError && <p className="text-[11px] text-red-400">{pdaError}</p>}
                  {pdaWalkthrough && (
                    <>
                      <p className="text-[10px] text-slate-500">{pdaWalkthrough.steps[pdaStepIndex].description}</p>
                      <div className="text-xs font-mono text-slate-300 whitespace-pre-line leading-relaxed">{formatAutomatonSummary(pdaWalkthrough.steps[pdaStepIndex].automaton)}</div>
                      <StepperControls index={pdaStepIndex} total={pdaWalkthrough.steps.length} onPrev={() => setPdaStepIndex(i => i - 1)} onNext={() => setPdaStepIndex(i => i + 1)} />
                      <button onClick={() => onLoadAutomaton(pdaWalkthrough.result, 'PDA')} className="self-start flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded bg-amber-300 text-black font-bold cursor-pointer border-none mt-1">
                        Load onto Canvas <ArrowRight className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-black/40 border border-white/5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#8b5cf6] font-bold uppercase tracking-wider">Regular Grammar → NFA</span>
                    <button onClick={convertToNfa} className="text-[10px] px-2.5 py-1.5 rounded border border-[#8b5cf6]/30 text-[#c4b5fd] hover:bg-[#8b5cf6]/10 bg-transparent cursor-pointer">Convert & Load onto Canvas</button>
                  </div>
                  {grammarToNfaError && <p className="text-[11px] text-red-400">{grammarToNfaError}</p>}
                  <p className="text-[10px] text-slate-500">Only works if every production is right-linear (`A -&gt; a`, `A -&gt; a B`, `A -&gt; B`, or `A -&gt; ε`).</p>
                </div>

                <div className="p-4 rounded-lg bg-black/40 border border-white/5 flex flex-col gap-2">
                  <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Grammar tools</span>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => runGrammarTool('epsilon')} className="text-[10px] px-2.5 py-1.5 rounded border border-white/10 text-slate-300 hover:bg-white/5 bg-transparent cursor-pointer">Remove ε-productions</button>
                    <button onClick={() => runGrammarTool('unit')} className="text-[10px] px-2.5 py-1.5 rounded border border-white/10 text-slate-300 hover:bg-white/5 bg-transparent cursor-pointer">Remove unit productions</button>
                    <button onClick={() => runGrammarTool('useless')} className="text-[10px] px-2.5 py-1.5 rounded border border-white/10 text-slate-300 hover:bg-white/5 bg-transparent cursor-pointer">Remove useless symbols</button>
                    <button onClick={() => runGrammarTool('classify')} className="text-[10px] px-2.5 py-1.5 rounded border border-white/10 text-slate-300 hover:bg-white/5 bg-transparent cursor-pointer">Classify grammar</button>
                  </div>
                  {grammarToolResult && (
                    <div className="mt-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">{grammarToolResult.label}</span>
                      <div className="text-sm font-mono text-slate-300 whitespace-pre-line leading-relaxed">{grammarToolResult.text}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'parsing' && (
            <div className="flex-1 border border-white/5 bg-[#0b121e]/70 p-5 rounded-xl flex flex-col gap-4 overflow-y-auto custom-scrollbar shadow-md">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-[#8b5cf6] uppercase tracking-widest">Parser Table Walkthrough</h3>
                <div className="flex bg-black/50 p-0.5 rounded border border-white/15">
                  <button
                    onClick={() => { setSelectedParser('LL1'); setParserSteps([]); setParserVisibleCount(0); }}
                    className={`px-2.5 py-1 text-[10px] font-bold uppercase border-none cursor-pointer rounded transition-all focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]/30 ${selectedParser === 'LL1' ? 'bg-[#8b5cf6] text-white' : 'text-slate-400 bg-transparent'}`}
                  >
                    LL(1)
                  </button>
                  <button
                    onClick={() => { setSelectedParser('SLR1'); setParserSteps([]); setParserVisibleCount(0); }}
                    className={`px-2.5 py-1 text-[10px] font-bold uppercase border-none cursor-pointer rounded transition-all focus:outline-none focus:ring-1 focus:ring-[#00e5a3]/30 ${selectedParser === 'SLR1' ? 'bg-[#00e5a3] text-black' : 'text-slate-400 bg-transparent'}`}
                  >
                    SLR(1)
                  </button>
                </div>
              </div>

              <div className="flex gap-3 items-center flex-wrap">
                <input
                  type="text"
                  value={parserInput}
                  onChange={e => setParserInput(e.target.value)}
                  className="bg-black/50 border border-white/10 rounded-lg p-2.5 text-sm text-white font-mono flex-1 focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30 focus:border-[#00e5a3]"
                  aria-label="Parser simulator input string"
                />
                <button
                  onClick={runParserWalk}
                  className="flex items-center gap-2 bg-[#00e5a3] hover:bg-[#00c58e] text-black px-4 py-2.5 rounded-lg text-xs cursor-pointer border-none font-extrabold transition-all shadow-glow-green/20 focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
                >
                  <Layers className="w-3.5 h-3.5" /> Parse Walk
                </button>
                <button
                  onClick={runCykTable}
                  className="flex items-center gap-2 bg-transparent border border-white/10 text-slate-300 hover:bg-white/5 px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  Show CYK Table
                </button>
                {parserStatus !== 'idle' && (
                  <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1.5 rounded-lg border select-none ${
                    parserStatus === 'success'
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {parserStatus === 'success' ? 'Accepted' : 'Rejected'}
                  </span>
                )}
              </div>

              {/* Render dynamic parser table based on selection */}
              {selectedParser === 'LL1' && ll1TableData && (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border border-white/5 rounded-lg p-3 bg-black/20">
                  <div><span className="text-[10px] text-[#8b5cf6] uppercase font-bold block mb-1.5">FIRST sets</span>{Object.entries(firstFollow.first).map(([nt, values]) => <div key={nt} className="text-[11px] font-mono text-slate-300">FIRST({nt}) = {'{'}{values.join(', ')}{'}'}</div>)}</div>
                  <div><span className="text-[10px] text-[#00e5a3] uppercase font-bold block mb-1.5">FOLLOW sets</span>{Object.entries(firstFollow.follow).map(([nt, values]) => <div key={nt} className="text-[11px] font-mono text-slate-300">FOLLOW({nt}) = {'{'}{values.join(', ')}{'}'}</div>)}</div>
                  <div><span className="text-[10px] text-amber-300 uppercase font-bold block mb-1.5">Nullable</span><div className="text-[11px] font-mono text-slate-300">{firstFollow.nullable.length ? firstFollow.nullable.join(', ') : 'None'}</div></div>
                </div>
                <div className="border border-white/5 rounded-lg p-3 bg-black/40">
                  <span className="text-[10px] text-slate-400 uppercase font-bold mb-2 block">Generated LL(1) Parse Table</span>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[#00e5a3]">
                          <th className="py-1.5 px-2">Non-Terminal</th>
                          {ll1TableData.terminals.map(t => <th key={t} className="py-1.5 px-2 font-mono">{t}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {ll1TableData.nonTerminals.map(nt => (
                          <tr key={nt} className="border-b border-white/5">
                            <td className="py-1.5 px-2 font-bold text-white">{nt}</td>
                            {ll1TableData.terminals.map(t => (
                              <td key={t} className="py-1.5 px-2 font-mono text-slate-300">
                                {ll1TableData.table[nt]?.[t]?.length ? `${nt} → ${ll1TableData.table[nt][t].join(' | ')}` : '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {ll1TableData.conflicts.length > 0 && (
                    <div className="mt-2 text-[10px] text-yellow-400 flex flex-col gap-1 font-semibold">
                      <div className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />LL(1) Table Conflicts:</div>
                      <ul className="list-disc list-inside text-slate-400 pl-1 font-normal">
                        {ll1TableData.conflicts.slice(0, 3).map((c, i) => <li key={i}>{c}</li>)}
                        {ll1TableData.conflicts.length > 3 && <li>...and {ll1TableData.conflicts.length - 3} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
                </>
              )}

              {selectedParser === 'SLR1' && slrTableData && (
                <div className="border border-white/5 rounded-lg p-3 bg-black/40 flex flex-col gap-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Generated SLR(1) Action & GOTO Tables</span>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-[10px] border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[#00e5a3]">
                          <th className="py-1.5 px-2">State</th>
                          {slrTableData.terminals.map(t => <th key={t} className="py-1.5 px-2 font-mono">Action:{t}</th>)}
                          {slrTableData.nonTerminals.map(nt => <th key={nt} className="py-1.5 px-2 font-mono">Goto:{nt}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {slrTableData.states.map((st) => (
                          <tr key={st.id} className="border-b border-white/5 hover:bg-white/5">
                            <td className="py-1.5 px-2 font-bold text-white">{st.id}</td>
                            {slrTableData.terminals.map(t => {
                              const acts = slrTableData.actionTable[st.id]?.[t] || [];
                              return (
                                <td key={t} className="py-1.5 px-2 font-mono text-slate-300">
                                  {acts.map((act: any) =>
                                    act.type === 'shift' ? `s${act.target}` : act.type === 'reduce' ? `r(${act.target})` : 'acc'
                                  ).join(' / ') || '-'}
                                </td>
                              );
                            })}
                            {slrTableData.nonTerminals.map(nt => {
                              const gt = slrTableData.gotoTable[st.id]?.[nt];
                              return (
                                <td key={nt} className="py-1.5 px-2 font-mono text-slate-400">
                                  {gt !== undefined ? gt : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {slrTableData.conflicts.length > 0 && (
                    <div className="mt-1 text-[9px] text-yellow-400 flex flex-col gap-1 border-t border-white/5 pt-1.5 font-semibold">
                      <div className="flex items-center gap-1 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        SLR(1) Table Conflicts Detected:
                      </div>
                      <ul className="list-disc list-inside text-slate-400 pl-1">
                        {slrTableData.conflicts.slice(0, 3).map((c, i) => <li key={i}>{c}</li>)}
                        {slrTableData.conflicts.length > 3 && <li>...and {slrTableData.conflicts.length - 3} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {cykResult && (
                <div className="border border-white/5 rounded-lg p-3 bg-black/40 overflow-x-auto">
                  <span className="text-[10px] text-slate-400 uppercase font-bold mb-2 block">
                    CYK DP Table — {cykResult.accepted ? <span className="text-green-400">Accepted</span> : <span className="text-red-400">Rejected</span>}
                  </span>
                  {cykResult.table.length > 0 ? (
                    <div className="flex flex-col-reverse gap-1">
                      {cykResult.table.map((row, lenIdx) => (
                        <div key={lenIdx} className="flex gap-1">
                          <span className="w-6 text-[9px] text-slate-500 flex items-center shrink-0">{lenIdx + 1}</span>
                          {row.map(cell => (
                            <div key={`${cell.start}-${cell.length}`} className="min-w-[3.5rem] px-1.5 py-1 rounded border border-white/10 bg-black/30 text-[9px] font-mono text-center text-slate-300">
                              {cell.nonTerminals.length ? cell.nonTerminals.join(',') : '∅'}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500">Enter a non-empty input string and click "Show CYK Table".</p>
                  )}
                </div>
              )}

              <div className="border border-white/5 rounded-lg p-3 bg-black/40">
                <TestSuitePanel label="CFG" tests={cfgTests} onAdd={addCfgTest} onRemove={removeCfgTest} runInput={runCfgInput} />
              </div>

              {/* Steps output table */}
              <div className="flex-1 overflow-x-auto min-h-60 max-h-80 border border-white/5 rounded-lg bg-black/10">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-bold bg-black/20">
                      <th className="py-2 px-3">Stack State</th>
                      <th className="py-2 px-3">Remaining Input</th>
                      <th className="py-2 px-3">Action Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parserSteps.length > 0 ? (
                      parserSteps.slice(0, parserVisibleCount).map((step, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-2 px-3 font-mono text-[#00e5a3] whitespace-nowrap">{step.stack}</td>
                          <td className="py-2 px-3 font-mono text-slate-300 whitespace-nowrap">{step.input}</td>
                          <td className="py-2 px-3 text-[#8b5cf6] font-semibold">{step.action}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="text-slate-500 text-center py-12 text-xs">
                          Click "Parse Walk" to run parser steps on the input.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {parserSteps.length > 0 && (
                <StepperControls
                  index={parserVisibleCount - 1}
                  total={parserSteps.length}
                  onPrev={() => setParserVisibleCount(c => Math.max(1, c - 1))}
                  onNext={() => setParserVisibleCount(c => Math.min(parserSteps.length, c + 1))}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
