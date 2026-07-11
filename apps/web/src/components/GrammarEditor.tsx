import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Play, RefreshCw, Layers, AlertTriangle, CheckCircle } from 'lucide-react';
import { 
  cykParse, 
  cfgToCNF, 
  cfgToGNF, 
  generateLL1Table, 
  generateLeftmostDerivation, 
  generateSLR1Table 
} from '@autometa/rule-engine';

interface Rule {
  left: string;
  right: string[];
}

export const GrammarEditor: React.FC = () => {
  // Pre-seed with Balanced Parentheses grammar: S -> ( S ) | ε
  const [rules, setRules] = useState<Rule[]>([
    { left: 'S', right: ['( S )', '()', 'ε'] }
  ]);
  const [newLeft, setNewLeft] = useState('');
  const [newRight, setNewRight] = useState('');
  
  // Derivation Tab state
  const [derivationInput, setDerivationInput] = useState('(())');
  const [derivationSteps, setDerivationSteps] = useState<string[]>([]);
  const [derivationStatus, setDerivationStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  const [activeTab, setActiveTab] = useState<'derivation' | 'simplification' | 'parsing'>('derivation');

  // Simplification Tab state
  const [cnfRules, setCnfRules] = useState<string[]>([]);
  const [gnfRules, setGnfRules] = useState<string[]>([]);
  const [simplificationActive, setSimplificationActive] = useState(false);

  // Parsing Tab state
  const [parserInput, setParserInput] = useState('(())');
  const [selectedParser, setSelectedParser] = useState<'LL1' | 'SLR1'>('LL1');
  const [parserSteps, setParserSteps] = useState<Array<{ stack: string; input: string; action: string }>>([]);
  const [parserStatus, setParserStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  // LL(1) generated tables
  const [ll1TableData, setLl1TableData] = useState<{
    terminals: string[];
    nonTerminals: string[];
    table: Record<string, Record<string, string>>;
    conflicts: boolean;
  } | null>(null);

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
    const grammarObj: Record<string, string[]> = {};
    rules.forEach(r => {
      grammarObj[r.left] = r.right.map(prod => prod.trim() === 'ε' ? '' : prod);
    });
    const startSymbol = rules[0].left;

    try {
      // 1. LL(1) Table
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
    } catch (e) {
      setLl1TableData(null);
    }

    try {
      // 2. SLR(1) Table
      const slrResult = generateSLR1Table(grammarObj, startSymbol);
      setSlrTableData(slrResult);
    } catch (e) {
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

  const runDerivation = () => {
    if (rules.length === 0) return;
    const grammarObj: Record<string, string[]> = {};
    rules.forEach(r => {
      grammarObj[r.left] = r.right.map(prod => prod.trim() === 'ε' ? '' : prod);
    });
    const startSymbol = rules[0].left;

    const path = generateLeftmostDerivation(grammarObj, startSymbol, derivationInput);
    if (path) {
      setDerivationSteps(path);
      setDerivationStatus('success');
    } else {
      const isAccepted = cykParse(grammarObj, startSymbol, derivationInput);
      setDerivationSteps([
        `CYK parser result: String is ${isAccepted ? 'ACCEPTED' : 'REJECTED'}`,
        'No leftmost derivation path found within traversal limits.'
      ]);
      setDerivationStatus(isAccepted ? 'success' : 'failed');
    }
  };

  const triggerSimplification = () => {
    if (rules.length === 0) return;
    const grammarObj: Record<string, string[]> = {};
    rules.forEach(r => {
      grammarObj[r.left] = r.right.map(prod => prod.trim() === 'ε' ? '' : prod);
    });

    const formatRulesList = (g: Record<string, string[]>): string[] => {
      return Object.keys(g).map(nt => {
        const prods = g[nt].map(p => p === '' ? 'ε' : p).join(' | ');
        return `${nt} → ${prods}`;
      });
    };

    try {
      const cnf = cfgToCNF(grammarObj);
      const gnf = cfgToGNF(grammarObj);
      setCnfRules(formatRulesList(cnf));
      setGnfRules(formatRulesList(gnf));
      setSimplificationActive(true);
    } catch (err) {
      alert("Failed to simplify grammar. Verify your production formats.");
    }
  };

  const runParserWalk = () => {
    if (rules.length === 0) return;
    const grammarObj: Record<string, string[]> = {};
    rules.forEach(r => {
      grammarObj[r.left] = r.right.map(prod => prod.trim() === 'ε' ? '' : prod);
    });
    const startSymbol = rules[0].left;
    const nonTerminals = new Set(Object.keys(grammarObj));

    const steps: Array<{ stack: string; input: string; action: string }> = [];
    const formattedInput = parserInput.trim();

    if (selectedParser === 'LL1') {
      if (!ll1TableData) {
        alert("LL(1) table not generated or has compile errors.");
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

        steps.push({
          stack: stack.join(' '),
          input: inputChars.slice(inputPtr).join(' '),
          action: top === currentSymbol && top === '$' 
            ? 'Accept' 
            : top === currentSymbol 
              ? `Match "${currentSymbol}"` 
              : nonTerminals.has(top)
                ? `Predict ${top} → ${ll1TableData.table[top]?.[currentSymbol] || 'error'}`
                : 'Error'
        });

        if (top === currentSymbol && top === '$') {
          break;
        }

        if (top === currentSymbol) {
          stack.pop();
          inputPtr++;
        } else if (nonTerminals.has(top)) {
          const production = ll1TableData.table[top]?.[currentSymbol];
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
      setParserStatus(ok ? 'success' : 'failed');

    } else {
      // SLR(1) Stack Walkthrough
      if (!slrTableData) {
        alert("SLR(1) table not generated.");
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
      setParserStatus(ok ? 'success' : 'failed');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#070b14] text-white p-6 border-l border-white/10 overflow-y-auto">
      <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-[#00f0ff] animate-pulse" />
          <h2 className="text-xl font-bold tracking-wider uppercase">Context-Free Grammar & Parsers</h2>
        </div>
        {/* Switcher Tab */}
        <div className="flex bg-black/40 p-1 rounded-lg border border-white/5 text-xs font-bold">
          {(['derivation', 'simplification', 'parsing'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md uppercase cursor-pointer border-none transition-all ${
                activeTab === tab 
                  ? 'bg-gradient-to-r from-[#00f0ff] to-[#ff007f] text-black shadow-md' 
                  : 'text-gray-400 hover:text-white bg-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Grammar Rules Definition Box */}
        <div className="lg:col-span-1 border border-white/15 bg-[#0a0f1d] p-4 rounded-xl flex flex-col gap-4">
          <h3 className="text-xs font-bold text-[#00f0ff] uppercase tracking-wider">Production Rules</h3>
          
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 custom-scrollbar">
            {rules.map((rule, idx) => (
              <div key={idx} className="flex items-center justify-between bg-black/40 p-2.5 rounded-lg border border-white/5 font-mono text-sm">
                <span>
                  <strong className="text-[#00f0ff]">{rule.left}</strong>
                  <span className="text-gray-500 mx-2">→</span>
                  <span className="text-white">{rule.right.map(r => r === '' || r === 'ε' ? 'ε' : r).join(' | ')}</span>
                </span>
                <button
                  onClick={() => removeRule(idx)}
                  className="text-xs text-red-400 hover:text-red-500 bg-transparent border-none cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
            <span className="text-[10px] text-gray-400 uppercase font-bold">Add Rule</span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Left"
                value={newLeft}
                onChange={e => setNewLeft(e.target.value)}
                className="w-16 bg-black/50 border border-white/10 rounded-lg p-2 text-center text-sm text-[#00f0ff] font-mono focus:outline-none"
              />
              <input
                type="text"
                placeholder="Right (e.g. a S b | ε)"
                value={newRight}
                onChange={e => setNewRight(e.target.value)}
                className="flex-1 bg-black/50 border border-white/10 rounded-lg p-2 text-sm text-white font-mono focus:outline-none"
              />
            </div>
            <button
              onClick={addRule}
              className="w-full bg-[#00f0ff] hover:bg-[#00d0df] text-black font-extrabold py-2 rounded-lg text-xs cursor-pointer border-none uppercase transition-all shadow-glow-blue/20"
            >
              Add Production
            </button>
          </div>
        </div>

        {/* Dynamic visualizers tabs */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {activeTab === 'derivation' && (
            <div className="flex-1 border border-white/15 bg-[#0a0f1d] p-5 rounded-xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#ff007f] uppercase tracking-wider">Derivation Tree Engine</h3>
                <span className="text-[10px] text-gray-400">Derives S-productions leftmost</span>
              </div>

              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  placeholder="Input string (e.g. (()) )"
                  value={derivationInput}
                  onChange={e => setDerivationInput(e.target.value)}
                  className="bg-black/50 border border-white/10 rounded-lg p-2.5 text-sm text-white font-mono flex-1 focus:outline-none"
                />
                <button
                  onClick={runDerivation}
                  className="flex items-center gap-2 bg-[#ff007f] hover:bg-[#df006f] text-white px-4 py-2.5 rounded-lg text-xs cursor-pointer border-none font-bold transition-all shadow-glow-magenta/20"
                >
                  <Play className="w-3.5 h-3.5" /> Derive String
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 uppercase font-bold">Derivation Steps</span>
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
                        <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-gray-400">Step {idx + 1}</span>
                        <span className="text-white font-semibold">{step}</span>
                        {idx < derivationSteps.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-gray-500" />}
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 text-center py-12 text-xs">
                      Enter a string and click "Derive String" to show leftmost derivation path.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'simplification' && (
            <div className="flex-1 border border-white/15 bg-[#0a0f1d] p-5 rounded-xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#00f0ff] uppercase tracking-wider">Simplification of CFG</h3>
                <button
                  onClick={triggerSimplification}
                  className="flex items-center gap-2 bg-transparent border border-[#00f0ff]/30 text-[#00f0ff] hover:bg-[#00f0ff]/10 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Run Simplifier
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                <div className="p-4 rounded-lg bg-black/40 border border-white/5 flex flex-col gap-2">
                  <span className="text-[10px] text-[#ff007f] font-bold uppercase">Chomsky Normal Form (CNF)</span>
                  <div className="text-sm font-mono text-gray-300 whitespace-pre-line leading-relaxed">
                    {simplificationActive ? (
                      cnfRules.length > 0 ? cnfRules.join('\n') : "No CNF rules available."
                    ) : (
                      "Click 'Run Simplifier' to convert grammar to Chomsky Normal Form."
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-black/40 border border-white/5 flex flex-col gap-2">
                  <span className="text-[10px] text-[#00f0ff] font-bold uppercase">Greibach Normal Form (GNF)</span>
                  <div className="text-sm font-mono text-gray-300 whitespace-pre-line leading-relaxed">
                    {simplificationActive ? (
                      gnfRules.length > 0 ? gnfRules.join('\n') : "No GNF rules available."
                    ) : (
                      "Click 'Run Simplifier' to convert grammar to Greibach Normal Form."
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'parsing' && (
            <div className="flex-1 border border-white/15 bg-[#0a0f1d] p-5 rounded-xl flex flex-col gap-4 overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#ff007f] uppercase tracking-wider">Parser Table Walkthrough</h3>
                <div className="flex bg-black/50 p-0.5 rounded border border-white/15">
                  <button
                    onClick={() => { setSelectedParser('LL1'); setParserSteps([]); }}
                    className={`px-2 py-1 text-[10px] font-bold uppercase border-none cursor-pointer rounded ${selectedParser === 'LL1' ? 'bg-[#ff007f] text-white' : 'text-gray-400 bg-transparent'}`}
                  >
                    LL(1)
                  </button>
                  <button
                    onClick={() => { setSelectedParser('SLR1'); setParserSteps([]); }}
                    className={`px-2 py-1 text-[10px] font-bold uppercase border-none cursor-pointer rounded ${selectedParser === 'SLR1' ? 'bg-[#00f0ff] text-black' : 'text-gray-400 bg-transparent'}`}
                  >
                    SLR(1)
                  </button>
                </div>
              </div>

              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={parserInput}
                  onChange={e => setParserInput(e.target.value)}
                  className="bg-black/50 border border-white/10 rounded-lg p-2.5 text-sm text-white font-mono flex-1 focus:outline-none"
                />
                <button
                  onClick={runParserWalk}
                  className="flex items-center gap-2 bg-[#00f0ff] hover:bg-[#00d0df] text-black px-4 py-2.5 rounded-lg text-xs cursor-pointer border-none font-extrabold transition-all shadow-glow-blue/20"
                >
                  <Layers className="w-3.5 h-3.5" /> Parse Walk
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
                <div className="border border-white/10 rounded-lg p-3 bg-black/40">
                  <span className="text-[10px] text-gray-400 uppercase font-bold mb-2 block">Generated LL(1) Parse Table</span>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[#00f0ff]">
                          <th className="py-1.5 px-2">Non-Terminal</th>
                          {ll1TableData.terminals.map(t => <th key={t} className="py-1.5 px-2 font-mono">{t}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {ll1TableData.nonTerminals.map(nt => (
                          <tr key={nt} className="border-b border-white/5">
                            <td className="py-1.5 px-2 font-bold">{nt}</td>
                            {ll1TableData.terminals.map(t => (
                              <td key={t} className="py-1.5 px-2 font-mono text-gray-300">
                                {ll1TableData.table[nt]?.[t] ? `${nt} → ${ll1TableData.table[nt][t]}` : '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {ll1TableData.conflicts && (
                    <div className="mt-2 text-[10px] text-yellow-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Warning: LL(1) Table contains conflicts (grammar is not LL(1)).
                    </div>
                  )}
                </div>
              )}

              {selectedParser === 'SLR1' && slrTableData && (
                <div className="border border-white/10 rounded-lg p-3 bg-black/40 flex flex-col gap-2">
                  <span className="text-[10px] text-gray-400 uppercase font-bold">Generated SLR(1) Action & GOTO Tables</span>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-[10px] border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[#00f0ff]">
                          <th className="py-1.5 px-2">State</th>
                          {slrTableData.terminals.map(t => <th key={t} className="py-1.5 px-2 font-mono">Action:{t}</th>)}
                          {slrTableData.nonTerminals.map(nt => <th key={nt} className="py-1.5 px-2 font-mono">Goto:{nt}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {slrTableData.states.map((st) => (
                          <tr key={st.id} className="border-b border-white/5 hover:bg-white/2">
                            <td className="py-1.5 px-2 font-bold">{st.id}</td>
                            {slrTableData.terminals.map(t => {
                              const acts = slrTableData.actionTable[st.id]?.[t] || [];
                              return (
                                <td key={t} className="py-1.5 px-2 font-mono text-gray-300">
                                  {acts.map((act: any) => 
                                    act.type === 'shift' ? `s${act.target}` : act.type === 'reduce' ? `r(${act.target})` : 'acc'
                                  ).join(' / ') || '-'}
                                </td>
                              );
                            })}
                            {slrTableData.nonTerminals.map(nt => {
                              const gt = slrTableData.gotoTable[st.id]?.[nt];
                              return (
                                <td key={nt} className="py-1.5 px-2 font-mono text-gray-400">
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
                    <div className="mt-1 text-[9px] text-yellow-400 flex flex-col gap-1 border-t border-white/5 pt-1.5">
                      <div className="flex items-center gap-1 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        SLR(1) Table Conflicts Detected:
                      </div>
                      <ul className="list-disc list-inside text-gray-400 pl-1">
                        {slrTableData.conflicts.slice(0, 3).map((c, i) => <li key={i}>{c}</li>)}
                        {slrTableData.conflicts.length > 3 && <li>...and {slrTableData.conflicts.length - 3} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Steps output table */}
              <div className="flex-1 overflow-x-auto min-h-60 max-h-80 border border-white/5 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-400 font-bold bg-black/20">
                      <th className="py-2 px-3">Stack State</th>
                      <th className="py-2 px-3">Remaining Input</th>
                      <th className="py-2 px-3">Action Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parserSteps.length > 0 ? (
                      parserSteps.map((step, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                          <td className="py-2 px-3 font-mono text-[#00f0ff] whitespace-nowrap">{step.stack}</td>
                          <td className="py-2 px-3 font-mono text-gray-300 whitespace-nowrap">{step.input}</td>
                          <td className="py-2 px-3 text-[#ff007f] font-semibold">{step.action}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="text-gray-500 text-center py-12 text-xs">
                          Click "Parse Walk" to run parser steps on the input.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
