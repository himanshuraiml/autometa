import { useState, useEffect } from 'react';
import type { RefObject } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { Trash2, PlayCircle, RotateCcw, Sparkles, ListOrdered, Blocks, Sliders, Cpu, Wand2, BookOpen, Hammer, ListChecks } from 'lucide-react';
import { Button } from '@autometa/ui';
import { simplifyRegex } from '@autometa/rule-engine';
import { useGraphStore } from '../store/useGraphStore';
import { DELETE_SHORTCUT_HINT } from '../utils/shortcuts';
import type { SimulationPlayback } from '../hooks/useSimulationPlayback';
import type { Transformations } from '../hooks/useTransformations';
import type { Grading } from '../hooks/useGrading';
import type { AutomatonType } from '../utils/flowAutomaton';
import { validateAutomaton } from '../utils/automatonValidation';
import { listSubmachines, saveSubmachine } from '../utils/submachineLibrary';
import { useToast } from './ToastProvider';
import { ValidationPanel } from './ValidationPanel';
import { TransitionTable } from './TransitionTable';
import { TestSuitePanel } from './TestSuitePanel';
import { BatchModeModal } from './BatchModeModal';
import { SymbolPalette, autoReplaceFormalSymbols } from './SymbolPalette';

/** Lightweight presentational-only regex tokenizer for the syntax-highlighting overlay (not the engine's parser). */
const highlightRegexPattern = (pattern: string): Array<{ text: string; className: string }> => {
  const tokens: Array<{ text: string; className: string }> = [];
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '(' || c === ')') { tokens.push({ text: c, className: 'text-slate-400' }); i++; continue; }
    if (c === '|') { tokens.push({ text: c, className: 'text-[#ff6b9d] font-bold' }); i++; continue; }
    if (c === '*' || c === '+' || c === '?') { tokens.push({ text: c, className: 'text-[#8b5cf6] font-bold' }); i++; continue; }
    if (c === '.') { tokens.push({ text: c, className: 'text-amber-300 font-bold' }); i++; continue; }
    if (c === '[') {
      const close = pattern.indexOf(']', i + 1);
      const end = close === -1 ? pattern.length : close + 1;
      tokens.push({ text: pattern.slice(i, end), className: 'text-[#00e5a3]' });
      i = end;
      continue;
    }
    tokens.push({ text: c, className: 'text-white' });
    i++;
  }
  return tokens;
};

interface EditorSidebarProps {
  automatonType: AutomatonType;
  playback: SimulationPlayback;
  transformations: Transformations;
  grading: Grading;
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  onDeleteSelectedNode: () => void;
  onDeleteSelectedEdge: () => void;
  regexInputRef: RefObject<HTMLInputElement | null>;
  onOpenConversionHub: () => void;
}

/**
 * Default right sidebar of the editor: element properties, simulation input,
 * AI grading, and the algorithm launchers.
 */
export const EditorSidebar = ({
  automatonType, playback, transformations, grading,
  selectedNode, selectedEdge, onDeleteSelectedNode, onDeleteSelectedEdge, regexInputRef, onOpenConversionHub,
}: EditorSidebarProps) => {
  const { nodes, edges, toggleStart, toggleAccept, toggleReject, updateNodeLabel, updateEdgeLabel, updateEdgeRouting, allowParallelEdges, setAllowParallelEdges, testSuites, addTestCase, removeTestCase, tapeCount, setTapeCount, insertSubmachineOnEdge } = useGraphStore();
  const {
    inputString, setInputString, simulationEvents, startSimulation, stopSimulation, blankSymbol, setBlankSymbol,
    isLbaMode, setIsLbaMode, stackSymbol, setStackSymbol, acceptanceMode, setAcceptanceMode,
  } = playback;
  const {
    regexInput, setRegexInput, setRegexError, regexError,
    pumpingLemmaError, setPumpingLemmaError,
    handleNfaToDfa, handleMinimizeDfa, handleRegexToNfa, handlePumpingLemma, handleDfaToRegex, handleNfaToRegularGrammar, conversionResult, setConversionResult,
  } = transformations;
  const { targetDescription, setTargetDescription, isGradingLoading, handleAIGrade } = grading;
  const [isBatchModeOpen, setIsBatchModeOpen] = useState(false);
  const { showToast } = useToast();
  const isSubmachineType = automatonType === 'TM' || automatonType === 'PDA';
  const [selectedSubmachineId, setSelectedSubmachineId] = useState('');
  const submachines = isSubmachineType ? listSubmachines(automatonType) : [];

  const [activeTab, setActiveTab] = useState<'inspector' | 'simulate' | 'algorithms' | 'ai'>('inspector');

  // Auto-switch to Inspector tab when a node or edge is selected
  useEffect(() => {
    if (selectedNode || selectedEdge) {
      setActiveTab('inspector');
    }
  }, [selectedNode, selectedEdge]);

  const handleSaveAsSubmachine = () => {
    const issues = validateAutomaton(nodes, edges, automatonType);
    if (issues.some(issue => issue.severity === 'error')) {
      showToast('Fix validation errors before saving this canvas as a submachine.', 'error');
      return;
    }
    if (!nodes.some(n => n.data?.isAccept)) {
      showToast('Mark at least one accept state — submachines splice in through their accept states.', 'error');
      return;
    }
    const name = window.prompt('Name this submachine:', `${automatonType} fragment`);
    if (!name?.trim()) return;
    saveSubmachine(automatonType as 'TM' | 'PDA', name.trim(), nodes, edges);
    showToast(`Saved "${name.trim()}" to the submachine library.`, 'success');
  };

  const handleSimplifyRegex = () => {
    try {
      setRegexInput(simplifyRegex(regexInput));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Invalid Regular Expression pattern.', 'error');
    }
  };

  return (
    <aside className="w-[340px] border-l border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 flex flex-col gap-4 select-none text-[var(--text-main)] h-full overflow-hidden" aria-label="Editor properties and tools">
      {/* Sleek Segmented Control Tab Switcher */}
      <div className="flex bg-[var(--bg-primary)] p-1 rounded-xl border border-[var(--border-color)] shadow-sm shrink-0">
        {[
          { id: 'inspector', label: 'Inspector', icon: Sliders },
          { id: 'simulate', label: 'Simulate', icon: PlayCircle },
          { id: 'algorithms', label: 'Algorithms', icon: Cpu },
          { id: 'ai', label: 'AI Coach', icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer border text-center focus:outline-none ${isActive
                  ? 'bg-[var(--text-main)] text-[var(--bg-primary)] border-transparent shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-secondary)] border-transparent bg-transparent'
                }`}
              title={tab.label}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-full text-[9px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels with scrolling wrapper */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-5 pr-1 -mr-1">
        {activeTab === 'inspector' && (
          <div className="flex flex-col gap-5">
            {/* Selected Item Editor */}
            <div>
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full" />
                <span>Element Properties</span>
              </h2>

              {selectedNode ? (
                <div className="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)] border-t-2 border-t-[var(--color-ui-accent)] shadow-sm flex flex-col gap-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-muted)]">Selected State</span>
                    <span className="font-mono text-[var(--color-blue)] font-bold">{selectedNode.id}</span>
                  </div>
                  {automatonType === 'TM' && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--text-main)]">Reject Halt State</span>
                      <input
                        type="checkbox"
                        checked={!!selectedNode.data?.isReject}
                        onChange={() => toggleReject(selectedNode.id)}
                        aria-label="Reject halt state"
                        className="w-4 h-4 rounded accent-[var(--color-ui-accent)] cursor-pointer"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="state-label-input" className="text-xs text-[var(--text-muted)] mb-1 block">Label / Name</label>
                    <input
                      id="state-label-input"
                      type="text"
                      value={selectedNode.data?.label as string || ''}
                      onChange={(e) => updateNodeLabel(selectedNode.id, e.target.value)}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--color-ui-accent)] focus:ring-2 focus:ring-[var(--border-color)]/20 transition-all text-[var(--text-main)] hover:border-[var(--text-muted)]"
                    />
                    {automatonType === 'Moore' && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        Moore format: <code className="text-[var(--color-blue)]">state/output</code> (e.g. <code className="text-[var(--color-blue)]">q0/1</code>).
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-main)]">Start State</span>
                    <input
                      type="checkbox"
                      checked={!!selectedNode.data?.isStart}
                      onChange={() => toggleStart(selectedNode.id)}
                      aria-label="Start state"
                      className="w-4 h-4 rounded accent-[var(--color-ui-accent)] cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-main)]">Accept State</span>
                    <input
                      type="checkbox"
                      checked={!!selectedNode.data?.isAccept}
                      onChange={() => toggleAccept(selectedNode.id)}
                      aria-label="Accept state"
                      className="w-4 h-4 rounded accent-[var(--color-ui-accent)] cursor-pointer"
                    />
                  </div>

                  <Button
                    variant="danger"
                    onClick={onDeleteSelectedNode}
                    title={`Delete State (${DELETE_SHORTCUT_HINT})`}
                    className="w-full flex items-center justify-center gap-2 mt-2 hover:scale-[1.02] active:scale-[0.98] transition-all bg-[var(--color-rose)] text-white hover:bg-[var(--color-rose)]/90 border-transparent"
                  >
                    <Trash2 className="w-4 h-4" /> Delete State
                  </Button>
                </div>
              ) : selectedEdge ? (
                <div className="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)] border-t-2 border-t-[var(--color-ui-accent)] shadow-sm flex flex-col gap-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-muted)]">Selected Transition</span>
                    <span className="font-mono text-[var(--color-blue)] font-bold">Edge</span>
                  </div>

                  <div>
                    <label htmlFor="transition-symbols-input" className="text-xs text-[var(--text-muted)] mb-1 block">Transition Symbols</label>
                    <input
                      id="transition-symbols-input"
                      type="text"
                      value={selectedEdge.data?.label as string || ''}
                      onChange={(e) => updateEdgeLabel(selectedEdge.id, autoReplaceFormalSymbols(e.target.value))}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--color-ui-accent)] focus:ring-2 focus:ring-[var(--border-color)]/20 transition-all text-[var(--text-main)] font-mono hover:border-[var(--text-muted)]"
                    />
                    <SymbolPalette
                      className="mt-2"
                      onInsertSymbol={(sym) => {
                        const current = (selectedEdge.data?.label as string) || '';
                        updateEdgeLabel(selectedEdge.id, current ? `${current}, ${sym}` : sym);
                      }}
                    />
                    {automatonType === 'Mealy' && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        Mealy format: <code className="text-[var(--color-blue)]">input/output</code> (e.g. <code className="text-[var(--color-blue)]">0/1</code>).
                      </p>
                    )}
                    {automatonType === 'PDA' && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        PDA format: <code className="text-[var(--color-blue)]">read, pop {'->'} push</code> (e.g. <code className="text-[var(--color-blue)]">a, Z {'->'} A Z</code>).
                      </p>
                    )}
                    {automatonType === 'TM' && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        TM format: <code className="text-[var(--color-blue)]">read {'->'} write, dir</code> (e.g. <code className="text-[var(--color-blue)]">0 {'->'} 1, R</code>).
                      </p>
                    )}
                    {(automatonType === 'DFA' || automatonType === 'NFA') && (
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">Use comma to separate multiple symbols. Empty represents ε.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {selectedEdge.source === selectedEdge.target ? (
                      <label className="text-[10px] text-[var(--text-muted)]">
                        Loop direction
                        <select
                          value={(selectedEdge.data?.loopDirection as string) || 'top'}
                          onChange={event => updateEdgeRouting(selectedEdge.id, { loopDirection: event.target.value as 'top' | 'right' | 'bottom' | 'left' })}
                          className="mt-1 w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-main)] focus:outline-none"
                        >
                          <option value="top">Top</option>
                          <option value="right">Right</option>
                          <option value="bottom">Bottom</option>
                          <option value="left">Left</option>
                        </select>
                      </label>
                    ) : (
                      <label className="text-[10px] text-[var(--text-muted)]">
                        Edge separation
                        <input
                          type="range"
                          min="-80"
                          max="80"
                          step="4"
                          value={Number(selectedEdge.data?.parallelOffset || 0)}
                          onChange={event => updateEdgeRouting(selectedEdge.id, { parallelOffset: Number(event.target.value) })}
                          className="mt-2 w-full accent-[var(--color-ui-accent)]"
                        />
                      </label>
                    )}
                    <label className="text-[10px] text-[var(--text-muted)] flex items-end gap-2 pb-1">
                      <input
                        type="checkbox"
                        checked={allowParallelEdges}
                        onChange={event => setAllowParallelEdges(event.target.checked)}
                        className="accent-[var(--color-ui-accent)] bg-[var(--bg-primary)]"
                      />
                      Allow parallel edges
                    </label>
                  </div>

                  {isSubmachineType && submachines.length > 0 && (
                    <div className="pt-1 border-t border-[var(--border-color)]">
                      <label className="text-[10px] text-[var(--text-muted)] mb-1 block">Insert Submachine on this Transition</label>
                      <div className="flex gap-1.5">
                        <select
                          value={selectedSubmachineId}
                          onChange={event => setSelectedSubmachineId(event.target.value)}
                          className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-main)] focus:outline-none"
                        >
                          <option value="">Choose a saved {automatonType} fragment…</option>
                          {submachines.map(sm => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
                        </select>
                        <Button
                          variant="secondary"
                          disabled={!selectedSubmachineId}
                          onClick={() => {
                            const chosen = submachines.find(sm => sm.id === selectedSubmachineId);
                            if (!chosen) return;
                            insertSubmachineOnEdge(selectedEdge.id, chosen);
                            setSelectedSubmachineId('');
                            showToast(`Spliced "${chosen.name}" into the diagram.`, 'success');
                          }}
                          className="!px-3 !py-1.5 text-xs shrink-0 border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
                        >
                          <Blocks className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        Redirects this transition into the fragment's entry state; its accept state(s) are merged into this transition's target.
                      </p>
                    </div>
                  )}

                  <Button
                    variant="danger"
                    onClick={onDeleteSelectedEdge}
                    title={`Delete Transition (${DELETE_SHORTCUT_HINT})`}
                    className="w-full flex items-center justify-center gap-2 mt-2 hover:scale-[1.02] active:scale-[0.98] transition-all bg-[var(--color-rose)] text-white hover:bg-[var(--color-rose)]/90 border-transparent"
                  >
                    <Trash2 className="w-4 h-4" /> Delete Transition
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)] bg-[var(--card-bg)] p-5 rounded-xl border border-dashed border-[var(--border-color)] text-center">
                  Click a state or transition to inspect and edit its properties.
                </div>
              )}
            </div>

            {isSubmachineType && (
              <Button variant="secondary" onClick={handleSaveAsSubmachine} className="flex items-center justify-center gap-1.5 !text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]">
                <Blocks className="w-3.5 h-3.5" /> Save Canvas as Submachine
              </Button>
            )}

            <ValidationPanel nodes={nodes} edges={edges} automatonType={automatonType} />
            <TransitionTable nodes={nodes} edges={edges} automatonType={automatonType} />
          </div>
        )}

        {activeTab === 'simulate' && (
          <div className="flex flex-col gap-5">
            {/* Simulation Input Section */}
            <div>
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full" />
                <span>Simulation Input</span>
              </h2>
              <div className="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)] border-t-2 border-t-[var(--color-ui-accent)] shadow-sm flex flex-col gap-3.5">
                <div>
                  <label htmlFor="simulation-input-string" className="text-xs text-[var(--text-muted)] mb-1 block">Input String</label>
                  <input
                    id="simulation-input-string"
                    type="text"
                    value={inputString}
                    onChange={(e) => {
                      setInputString(e.target.value);
                      setPumpingLemmaError(null);
                      if (simulationEvents.length > 0) stopSimulation();
                    }}
                    disabled={simulationEvents.length > 0}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-ui-accent)] focus:ring-2 focus:ring-[var(--border-color)]/20 transition-all text-[var(--text-main)] font-mono disabled:opacity-50 hover:border-[var(--text-muted)]"
                    placeholder="e.g. 0110"
                  />
                </div>
                {automatonType === 'TM' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">Blank Tape Symbol</label>
                      <input
                        value={blankSymbol}
                        maxLength={1}
                        onChange={event => setBlankSymbol(event.target.value || '_')}
                        disabled={simulationEvents.length > 0}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-main)] focus:outline-none focus:border-[var(--color-ui-accent)] disabled:opacity-50"
                        aria-label="Turing machine blank symbol"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">Tape Count</label>
                      <select
                        value={tapeCount}
                        onChange={event => setTapeCount(Number(event.target.value))}
                        disabled={simulationEvents.length > 0}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--color-ui-accent)] disabled:opacity-50"
                        aria-label="Number of Turing machine tapes"
                      >
                        {[1, 2, 3, 4].map(n => <option key={n} value={n} className="bg-[var(--bg-primary)]">{n} tape{n > 1 ? 's' : ''}</option>)}
                      </select>
                    </div>
                    {tapeCount === 1 && (
                      <label className="col-span-2 flex items-start gap-2 text-[10px] text-[var(--text-muted)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isLbaMode}
                          onChange={event => setIsLbaMode(event.target.checked)}
                          disabled={simulationEvents.length > 0}
                          className="mt-0.5 accent-[var(--color-ui-accent)]"
                        />
                        <span>Simulate as LBA (bounded tape) — the head halts and rejects if it ever moves past the input's own length.</span>
                      </label>
                    )}
                  </div>
                )}
                {automatonType === 'PDA' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">Initial Stack Symbol</label>
                      <input
                        value={stackSymbol}
                        maxLength={1}
                        onChange={event => setStackSymbol(event.target.value || 'Z')}
                        disabled={simulationEvents.length > 0}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-main)] focus:outline-none focus:border-[var(--color-ui-accent)] disabled:opacity-50"
                        aria-label="PDA initial stack symbol"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">Acceptance Mode</label>
                      <select
                        value={acceptanceMode}
                        onChange={event => setAcceptanceMode(event.target.value as 'final-state' | 'empty-stack')}
                        disabled={simulationEvents.length > 0}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--color-ui-accent)] disabled:opacity-50"
                        aria-label="PDA acceptance mode"
                      >
                        <option value="final-state" className="bg-[var(--bg-primary)]">Final state</option>
                        <option value="empty-stack" className="bg-[var(--bg-primary)]">Empty stack</option>
                      </select>
                    </div>
                  </div>
                )}

                {simulationEvents.length === 0 ? (
                  <Button
                    onClick={startSimulation}
                    disabled={nodes.length === 0}
                    className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all bg-[var(--color-ui-accent)] hover:bg-[var(--color-ui-accent-hover)] text-[var(--bg-primary)] font-bold border-none"
                  >
                    <PlayCircle className="w-4 h-4" /> Run Simulation
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    onClick={stopSimulation}
                    className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all bg-[var(--color-rose)] text-white hover:bg-[var(--color-rose)]/90 border-transparent"
                  >
                    <RotateCcw className="w-4 h-4" /> Stop & Edit Graph
                  </Button>
                )}
              </div>
            </div>

            {/* Test Cases Panel */}
            <TestSuitePanel label={automatonType} tests={testSuites[automatonType]} onAdd={(input, expected) => addTestCase(automatonType, input, expected)} onRemove={id => removeTestCase(automatonType, id)} runInput={playback.runInput} />

            <Button variant="secondary" onClick={() => setIsBatchModeOpen(true)} className="flex items-center justify-center gap-1.5 !text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]">
              <ListOrdered className="w-3.5 h-3.5" /> Batch Mode
            </Button>
            <BatchModeModal
              isOpen={isBatchModeOpen}
              onClose={() => setIsBatchModeOpen(false)}
              nodes={nodes}
              edges={edges}
              automatonType={automatonType}
            />
          </div>
        )}

        {activeTab === 'algorithms' && (
          <div className="flex flex-col gap-5">
            {/* Build */}
            <div>
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-2">
                <Hammer className="w-3 h-3" />
                <span>Build</span>
              </h2>
              <div className="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)] border-t-2 border-t-[var(--color-ui-accent)] shadow-sm flex flex-col gap-1.5">
                <label className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Regex to NFA (Thompson's Construction)</label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <div aria-hidden="true" className="absolute inset-0 px-2.5 py-1.5 text-xs font-mono whitespace-pre overflow-hidden rounded-lg pointer-events-none bg-[var(--bg-primary)] border border-[var(--border-color)]">
                      {regexInput ? (
                        highlightRegexPattern(regexInput).map((token, idx) => <span key={idx} className={token.className}>{token.text}</span>)
                      ) : (
                        <span className="text-[var(--text-dim)]">e.g. (a|b)*abb</span>
                      )}
                    </div>
                    <input
                      ref={regexInputRef}
                      type="text"
                      value={regexInput}
                      onChange={(e) => { setRegexInput(e.target.value); setRegexError(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRegexToNfa(); }}
                      aria-label="Regular expression"
                      className="relative w-full bg-transparent border border-transparent focus:border-[var(--color-ui-accent)] focus:ring-2 focus:ring-[var(--border-color)]/20 rounded-lg px-2.5 py-1.5 text-xs font-mono text-transparent caret-[var(--text-main)] hover:border-[var(--border-color)] transition-all focus:outline-none"
                    />
                  </div>
                  <Button
                    onClick={handleRegexToNfa}
                    disabled={!regexInput.trim()}
                    className="!px-3 !py-1.5 text-xs shrink-0 border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
                  >
                    Build
                  </Button>
                  <Button
                    onClick={handleSimplifyRegex}
                    disabled={!regexInput.trim()}
                    title="Algebraically simplify this pattern without changing its language"
                    className="!px-3 !py-1.5 text-xs shrink-0 flex items-center gap-1.5 border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {regexError && (
                  <p className="text-[10px] text-[var(--color-rose)] font-semibold">{regexError}</p>
                )}
                <p className="text-[10px] text-[var(--text-muted)]">
                  Supports <code className="text-[var(--text-main)]">|  *  +  ?  ( )  [a-z]  [^a]  .</code> — the parse tree (AST) appears alongside the build steps.
                </p>
              </div>
            </div>

            {/* Step-by-Step Walkthroughs */}
            <div>
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-2">
                <ListChecks className="w-3 h-3" />
                <span>Step-by-Step Walkthroughs</span>
              </h2>
              <div className="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)] border-t-2 border-t-[var(--color-ui-accent)] shadow-sm flex flex-col gap-3">
                {automatonType === 'NFA' ? (
                  <>
                    <Button
                      onClick={handleNfaToDfa}
                      disabled={nodes.length === 0}
                      className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
                    >
                      Convert NFA to DFA (Step)
                    </Button>
                    <Button
                      onClick={handleNfaToRegularGrammar}
                      disabled={nodes.length === 0}
                      className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
                    >
                      Convert to Regular Grammar
                    </Button>
                    {conversionResult && (
                      <div className="text-[11px] font-mono text-[var(--color-blue)] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-2 break-all relative whitespace-pre-line">
                        <button onClick={() => setConversionResult(null)} className="absolute right-1 top-0.5 text-[var(--text-muted)] hover:text-[var(--text-main)] bg-transparent border-none cursor-pointer">×</button>
                        {conversionResult}
                      </div>
                    )}
                  </>
                ) : automatonType === 'DFA' ? (
                  <>
                    <Button
                      onClick={handleMinimizeDfa}
                      disabled={nodes.length === 0}
                      className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
                    >
                      Minimize DFA (Step)
                    </Button>
                    <Button
                      onClick={() => { handlePumpingLemma(); }}
                      disabled={nodes.length === 0 || !inputString.trim()}
                      title="Uses the string in Simulation Input"
                      className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
                    >
                      Pumping Lemma (Step)
                    </Button>
                    <Button
                      onClick={handleDfaToRegex}
                      disabled={nodes.length === 0}
                      className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
                    >
                      Convert DFA to Regex (Step)
                    </Button>
                    <Button
                      onClick={handleNfaToRegularGrammar}
                      disabled={nodes.length === 0}
                      className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
                    >
                      Convert to Regular Grammar
                    </Button>
                    {conversionResult && (
                      <div className="text-[11px] font-mono text-[var(--color-blue)] bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-2 break-all relative whitespace-pre-line">
                        <button onClick={() => setConversionResult(null)} className="absolute right-1 top-0.5 text-[var(--text-muted)] hover:text-[var(--text-main)] bg-transparent border-none cursor-pointer">×</button>
                        {conversionResult}
                      </div>
                    )}
                    {pumpingLemmaError && (
                      <p className="text-[10px] text-[var(--color-rose)] font-semibold">{pumpingLemmaError}</p>
                    )}
                    {!inputString.trim() && (
                      <p className="text-[10px] text-[var(--text-muted)]">
                        Type an accepted string in Simulation Input first (length ≥ number of states).
                      </p>
                    )}
                  </>
                ) : (
                  <div className="text-[10px] text-[var(--text-muted)] text-center py-2">
                    No deterministic transformations for {automatonType}.
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={onOpenConversionHub}
              variant="secondary"
              className="flex items-center justify-center gap-2 !text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-main)] hover:bg-[var(--bg-secondary)]"
            >
              <BookOpen className="w-3.5 h-3.5" /> More Conversions & Transformations
            </Button>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="flex flex-col gap-5">
            {/* AI Grading Section */}
            <div>
              <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full" />
                <span>AI Grading & Feedback</span>
              </h2>
              <div className="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)] border-t-2 border-t-[var(--color-ui-accent)] shadow-sm flex flex-col gap-3">
                <label htmlFor="grading-language-description" className="text-xs text-[var(--text-muted)] mb-1 block font-bold uppercase">Language Description</label>
                <textarea
                  id="grading-language-description"
                  value={targetDescription}
                  onChange={(e) => setTargetDescription(e.target.value)}
                  placeholder="e.g. Accepts binary strings containing an even number of '0' symbols."
                  className="w-full h-16 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-2 text-xs focus:outline-none focus:border-[var(--color-ui-accent)] focus:ring-2 focus:ring-[var(--border-color)]/20 text-[var(--text-main)] hover:border-[var(--text-muted)] transition-all custom-scrollbar resize-none"
                />
                <Button
                  onClick={handleAIGrade}
                  disabled={nodes.length === 0 || !targetDescription.trim() || isGradingLoading}
                  className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all bg-[var(--color-ui-accent)] hover:bg-[var(--color-ui-accent-hover)] text-[var(--bg-primary)] font-bold border-none"
                >
                  <Sparkles className="w-4 h-4" /> {isGradingLoading ? "Grading..." : "Grade Canvas"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
