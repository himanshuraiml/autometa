
import React, { useState, useEffect, useRef } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes, edgeTypes } from '@autometa/graph-engine';
import { useGraphStore } from './store/useGraphStore';
import { simulateDFA, simulateNFA, simulateMealy, simulateMoore, simulatePDA, simulateTuringMachine } from '@autometa/simulation-engine';
import type { Automaton, SimulationEvent } from '@autometa/simulation-engine';
import { generateTimeline } from '@autometa/timeline-engine';
import type { AnimationTimeline } from '@autometa/timeline-engine';
import { calculateRenderState } from '@autometa/animation-engine';
import type { RenderState } from '@autometa/animation-engine';
import { nfaToDfa, minimizeDFA } from '@autometa/rule-engine';
import { Button } from '@autometa/ui';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { StackVisualizer } from './components/StackVisualizer';
import { TapeVisualizer } from './components/TapeVisualizer';
import { GrammarEditor } from './components/GrammarEditor';
import { LessonBuilder } from './components/LessonBuilder';
import { DashboardView } from './components/DashboardView';
import { PluginManager } from './components/PluginManager';
import { LESSON_HISTORY_KEY, LESSON_HISTORY_LIMIT, type SavedLesson } from './utils/lessonHistory';
import { PREDEFINED_TEMPLATES } from './data/templates';
import {
  exportToSVG, exportToPNG, exportToHTML, exportToPDF,
  computeFlowCaptureBox, captureFlowFrame, encodeGIF, downloadGIF
} from './utils/exportUtils';
import {
  Play, Pause, ChevronRight, ChevronLeft, RotateCcw,
  Trash2, CheckCircle2, PlayCircle, FileDown, FileUp, Sparkles,
  Video, VideoOff, Tv, Home, Blocks, Plus, Settings, BookOpen, Film
} from 'lucide-react';

const IS_MAC_PLATFORM = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const DELETE_SHORTCUT_HINT = IS_MAC_PLATFORM ? '⌘⌫' : 'Ctrl+Del';

interface NfaToDfaRow {
  stateId: string;
  label: string;
  subset: string[];
  transitions: Record<string, { targetSubset: string[], targetStateId: string }>;
}

const computeNfaToDfaWalkthrough = (nfa: Automaton) => {
  const startNode = nfa.nodes.find(n => n.isStart);
  if (!startNode) return { alphabet: [], rows: [], finalDfa: { nodes: [], edges: [] } };

  const getEpsilonClosure = (states: Set<string>): Set<string> => {
    const closure = new Set<string>(states);
    const queue = Array.from(states);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const epsilonEdges = nfa.edges.filter(e => 
        e.source === current && 
        e.symbols.some(sym => {
          const s = sym.trim().toLowerCase();
          return s === '' || s === 'ε' || s === 'epsilon' || s === 'λ' || s === 'lambda';
        })
      );
      epsilonEdges.forEach(edge => {
        if (!closure.has(edge.target)) {
          closure.add(edge.target);
          queue.push(edge.target);
        }
      });
    }
    return closure;
  };

  const alphabet = new Set<string>();
  nfa.edges.forEach(e => {
    e.symbols.forEach(sym => {
      const s = sym.trim().toLowerCase();
      const isEps = s === '' || s === 'ε' || s === 'epsilon' || s === 'λ' || s === 'lambda';
      if (!isEps) alphabet.add(sym);
    });
  });
  const alphabetList = Array.from(alphabet).sort();

  const rows: NfaToDfaRow[] = [];
  const stateMap = new Map<string, string>();
  const unvisitedSets: Set<string>[] = [];

  const startClosure = getEpsilonClosure(new Set<string>([startNode.id]));
  const startKey = Array.from(startClosure).sort().join(',');
  const startDfaId = 'p0';
  stateMap.set(startKey, startDfaId);
  unvisitedSets.push(startClosure);

  const getDfaLabel = (subset: Set<string>): string => {
    const labels = Array.from(subset)
      .map(id => nfa.nodes.find(n => n.id === id)?.label || id)
      .sort();
    return `{${labels.join(',')}}`;
  };

  let stateCounter = 1;

  while (unvisitedSets.length > 0) {
    const currentSet = unvisitedSets.shift()!;
    const currentKey = Array.from(currentSet).sort().join(',');
    const currentDfaId = stateMap.get(currentKey)!;

    const row: NfaToDfaRow = {
      stateId: currentDfaId,
      label: getDfaLabel(currentSet),
      subset: Array.from(currentSet),
      transitions: {}
    };

    alphabetList.forEach(symbol => {
      const nextStates = new Set<string>();
      currentSet.forEach(stateId => {
        nfa.edges.forEach(edge => {
          if (edge.source === stateId && edge.symbols.includes(symbol)) {
            nextStates.add(edge.target);
          }
        });
      });

      if (nextStates.size > 0) {
        const closure = getEpsilonClosure(nextStates);
        const closureKey = Array.from(closure).sort().join(',');
        
        let targetId = stateMap.get(closureKey);
        if (!targetId) {
          targetId = `p${stateCounter++}`;
          stateMap.set(closureKey, targetId);
          unvisitedSets.push(closure);
        }

        row.transitions[symbol] = {
          targetSubset: Array.from(closure),
          targetStateId: targetId
        };
      }
    });

    rows.push(row);
  }

  const dfaNodes = rows.map(r => {
    const isStart = r.stateId === 'p0';
    const isAccept = r.subset.some(id => {
      const n = nfa.nodes.find(node => node.id === id);
      return !!n?.isAccept;
    });
    return {
      id: r.stateId,
      label: r.label,
      isStart,
      isAccept
    };
  });

  const dfaEdges: any[] = [];
  let edgeCounter = 0;
  rows.forEach(r => {
    Object.keys(r.transitions).forEach(sym => {
      const trans = r.transitions[sym];
      dfaEdges.push({
        id: `e-${r.stateId}-${trans.targetStateId}-${edgeCounter++}`,
        source: r.stateId,
        target: trans.targetStateId,
        symbols: [sym]
      });
    });
  });

  const consolidatedEdges: any[] = [];
  const edgeMap = new Map<string, string[]>();
  dfaEdges.forEach(e => {
    const key = `${e.source}->${e.target}`;
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key)!.push(...e.symbols);
  });
  edgeMap.forEach((syms, key) => {
    const [src, tgt] = key.split('->');
    consolidatedEdges.push({
      id: `e-${src}-${tgt}-${Date.now()}`,
      source: src,
      target: tgt,
      symbols: Array.from(new Set(syms)).sort()
    });
  });

  return {
    alphabet: alphabetList,
    rows,
    finalDfa: {
      nodes: dfaNodes,
      edges: consolidatedEdges
    }
  };
};

const computeMinimizationWalkthrough = (dfa: Automaton) => {
  const startNode = dfa.nodes.find(n => n.isStart);
  if (!startNode) return { pairs: [], finalDfa: { nodes: [], edges: [] } };

  const reachableIds = new Set<string>();
  const queue = [startNode.id];
  reachableIds.add(startNode.id);

  while (queue.length > 0) {
    const current = queue.shift()!;
    dfa.edges.forEach(e => {
      if (e.source === current && !reachableIds.has(e.target)) {
        reachableIds.add(e.target);
        queue.push(e.target);
      }
    });
  }

  const cleanNodes = dfa.nodes.filter(n => reachableIds.has(n.id));
  const cleanEdges = dfa.edges.filter(e => reachableIds.has(e.source) && reachableIds.has(e.target));

  const alphabet = new Set<string>();
  cleanEdges.forEach(e => e.symbols.forEach(s => alphabet.add(s)));
  const alphabetList = Array.from(alphabet).sort();

  const delta: Record<string, Record<string, string>> = {};
  cleanNodes.forEach(node => {
    delta[node.id] = {};
    alphabetList.forEach(symbol => {
      const edge = cleanEdges.find(e => e.source === node.id && e.symbols.includes(symbol));
      if (edge) delta[node.id][symbol] = edge.target;
    });
  });

  const nodeIds = cleanNodes.map(n => n.id);
  const n = nodeIds.length;

  const getPairKey = (id1: string, id2: string): string => {
    return [id1, id2].sort().join(',');
  };

  const distinguishable = new Set<string>();
  const pairTrace: Array<{
    pairKey: string;
    id1: string;
    id2: string;
    label1: string;
    label2: string;
    marked: boolean;
    reason: string;
    step: 'base' | 'iterative' | 'final';
  }> = [];

  const allPairs: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      allPairs.push(getPairKey(nodeIds[i], nodeIds[j]));
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const state1 = cleanNodes.find(node => node.id === nodeIds[i])!;
      const state2 = cleanNodes.find(node => node.id === nodeIds[j])!;
      const key = getPairKey(nodeIds[i], nodeIds[j]);
      
      if (state1.isAccept !== state2.isAccept) {
        distinguishable.add(key);
        pairTrace.push({
          pairKey: key,
          id1: state1.id,
          id2: state2.id,
          label1: state1.label,
          label2: state2.label,
          marked: true,
          reason: `Base case: ${state1.isAccept ? 'Accepting' : 'Non-accepting'} vs ${state2.isAccept ? 'Accepting' : 'Non-accepting'}`,
          step: 'base'
        });
      } else {
        pairTrace.push({
          pairKey: key,
          id1: state1.id,
          id2: state2.id,
          label1: state1.label,
          label2: state2.label,
          marked: false,
          reason: `Both states have same acceptance value: ${state1.isAccept ? 'Accepting' : 'Non-accepting'}`,
          step: 'base'
        });
      }
    }
  }

  let changed = true;
  let pass = 1;
  const iterations: any[] = [];

  while (changed && pass < 10) {
    changed = false;
    const markedThisPass: string[] = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const id1 = nodeIds[i];
        const id2 = nodeIds[j];
        const key = getPairKey(id1, id2);

        if (!distinguishable.has(key)) {
          for (const symbol of alphabetList) {
            const next1 = delta[id1]?.[symbol];
            const next2 = delta[id2]?.[symbol];

            if (next1 && next2 && next1 !== next2) {
              const nextKey = getPairKey(next1, next2);
              if (distinguishable.has(nextKey)) {
                distinguishable.add(key);
                markedThisPass.push(key);
                changed = true;

                const traceIdx = pairTrace.findIndex(pt => pt.pairKey === key);
                if (traceIdx !== -1) {
                  pairTrace[traceIdx].marked = true;
                  pairTrace[traceIdx].reason = `Pass ${pass}: Transitions on '${symbol}' lead to distinguishable pair {${next1}, ${next2}}`;
                  pairTrace[traceIdx].step = 'iterative';
                }
                break;
              }
            } else if ((next1 && !next2) || (!next1 && next2)) {
              distinguishable.add(key);
              markedThisPass.push(key);
              changed = true;

              const traceIdx = pairTrace.findIndex(pt => pt.pairKey === key);
              if (traceIdx !== -1) {
                pairTrace[traceIdx].marked = true;
                pairTrace[traceIdx].reason = `Pass ${pass}: One state has a transition on '${symbol}' but the other does not`;
                pairTrace[traceIdx].step = 'iterative';
              }
              break;
            }
          }
        }
      }
    }
    iterations.push({ pass, markedThisPass });
    pass++;
  }

  // Get minimized DFA from the rule engine
  const minDfa = minimizeDFA(dfa);

  return {
    pairs: pairTrace,
    iterations,
    finalDfa: minDfa
  };
};

function Editor() {
  const {
    nodes,
    edges,
    automatonType,
    setAutomatonType,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    deleteNode,
    deleteEdge,
    toggleStart,
    toggleAccept,
    updateEdgeLabel,
    clearGraph,
    loadGraph,
    nodeCounter
  } = useGraphStore();

  const { screenToFlowPosition, getNodes } = useReactFlow();
  const flowWrapperRef = useRef<HTMLDivElement>(null);

  const getFlowViewportEl = () => flowWrapperRef.current?.querySelector<HTMLElement>('.react-flow__viewport') ?? null;

  // Selection state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

  // Simulation & Timeline states
  const [inputString, setInputString] = useState('abb');
  const [simulationEvents, setSimulationEvents] = useState<SimulationEvent[]>([]);
  const [timeline, setTimeline] = useState<AnimationTimeline | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [currentStep, setCurrentStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // ms per step (smaller is faster)
  const [simulationResult, setSimulationResult] = useState<{ accepted: boolean; outputString?: string } | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'graph' | 'grammars' | 'lessons'>('dashboard');
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [selectedExampleIndex, setSelectedExampleIndex] = useState<string>("");
  const [isPluginsOpen, setIsPluginsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiProvider, setApiProvider] = useState<'Ollama' | 'Gemini' | 'OpenAI' | 'Groq'>('Ollama');
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');

  const [activeTransformation, setActiveTransformation] = useState<'nfaToDfa' | 'minimize' | null>(null);
  const [transformStepIndex, setTransformStepIndex] = useState(0);
  const [transformData, setTransformData] = useState<any>(null);

  const [targetDescription, setTargetDescription] = useState('');
  const [isGradingLoading, setIsGradingLoading] = useState(false);
  const [gradingResult, setGradingResult] = useState<string | null>(null);

  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [continueProject, setContinueProject] = useState<any>(null);

  const [lessonHistory, setLessonHistory] = useState<SavedLesson[]>([]);
  const [pendingLesson, setPendingLesson] = useState<SavedLesson | null>(null);

  useEffect(() => {
    const storedLessons = localStorage.getItem(LESSON_HISTORY_KEY);
    if (storedLessons) {
      try {
        setLessonHistory(JSON.parse(storedLessons));
      } catch {
        // ignore malformed history
      }
    }
  }, []);

  const saveLessonToHistory = (lesson: Omit<SavedLesson, 'id' | 'savedAt'>) => {
    const entry: SavedLesson = { ...lesson, id: 'lesson-' + Date.now(), savedAt: new Date().toISOString() };
    setLessonHistory(prev => {
      const updated = [entry, ...prev].slice(0, LESSON_HISTORY_LIMIT);
      localStorage.setItem(LESSON_HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const handleSelectLesson = (lesson: SavedLesson) => {
    setPendingLesson(lesson);
    setActiveView('lessons');
  };

  useEffect(() => {
    const storedRecent = localStorage.getItem('autometa_recent_projects');
    if (storedRecent) {
      setRecentProjects(JSON.parse(storedRecent));
    } else {
      const seeded = [
        {
          id: 'temp-1',
          name: "Binary Parity Checker",
          type: "DFA",
          description: "Accepts binary strings containing an even number of '0' symbols.",
          nodes: PREDEFINED_TEMPLATES[1].nodes,
          edges: PREDEFINED_TEMPLATES[1].edges,
          input: PREDEFINED_TEMPLATES[1].input,
          lastModified: "Yesterday"
        },
        {
          id: 'temp-2',
          name: "Email Validator",
          type: "NFA",
          description: "NFA that detects if the substring '101' appears anywhere in the input.",
          nodes: PREDEFINED_TEMPLATES[2].nodes,
          edges: PREDEFINED_TEMPLATES[2].edges,
          input: PREDEFINED_TEMPLATES[2].input,
          lastModified: "Oct 12"
        },
        {
          id: 'temp-5',
          name: "Balanced Parentheses",
          type: "PDA",
          description: "Pushdown Automaton that uses a stack to match equal counts of 'a' and 'b'.",
          nodes: PREDEFINED_TEMPLATES[5].nodes,
          edges: PREDEFINED_TEMPLATES[5].edges,
          input: PREDEFINED_TEMPLATES[5].input,
          lastModified: "Oct 08"
        },
        {
          id: 'temp-6',
          name: "Binary Inverter",
          type: "TM",
          description: "Turing Machine that moves to the end of a binary string, inverts bits on carry, and increments.",
          nodes: PREDEFINED_TEMPLATES[6].nodes,
          edges: PREDEFINED_TEMPLATES[6].edges,
          input: PREDEFINED_TEMPLATES[6].input,
          lastModified: "Sep 30"
        }
      ];
      setRecentProjects(seeded);
      localStorage.setItem('autometa_recent_projects', JSON.stringify(seeded));
    }

    const storedContinue = localStorage.getItem('autometa_continue_project');
    if (storedContinue) {
      setContinueProject(JSON.parse(storedContinue));
    } else {
      const defaultProj = {
        id: 'temp-0',
        name: "DFA for Regex `(a|b)*abb`",
        type: "DFA",
        description: "Complex state-machine modeling the lexical analysis for a custom subset of C-minus grammar.",
        nodes: PREDEFINED_TEMPLATES[0].nodes,
        edges: PREDEFINED_TEMPLATES[0].edges,
        input: PREDEFINED_TEMPLATES[0].input,
        lastModified: "2h ago"
      };
      setContinueProject(defaultProj);
      localStorage.setItem('autometa_continue_project', JSON.stringify(defaultProj));
    }
  }, []);

  const saveCurrentToRecent = () => {
    if (nodes.length === 0) return;
    const currentProj = {
      id: 'recent-' + Date.now(),
      name: automatonType === 'DFA' && inputString === 'abb' 
        ? "DFA for Regex `(a|b)*abb`" 
        : `${automatonType} Project: ${nodes.length} States`,
      type: automatonType,
      description: `Workspace simulation using input "${inputString}".`,
      nodes: nodes,
      edges: edges,
      input: inputString,
      lastModified: "Just now"
    };
    
    setContinueProject(currentProj);
    localStorage.setItem('autometa_continue_project', JSON.stringify(currentProj));

    setRecentProjects(prev => {
      const filtered = prev.filter(p => p.type !== currentProj.type);
      const updated = [currentProj, ...filtered].slice(0, 4);
      localStorage.setItem('autometa_recent_projects', JSON.stringify(updated));
      return updated;
    });
  };

  const handleSelectRecentProject = (proj: any) => {
    stopSimulation();
    setAutomatonType(proj.type);
    loadGraph(proj.nodes, proj.edges, proj.nodes.length);
    setInputString(proj.input);
    setSelectedExampleIndex("");
    setActiveView('graph');
  };

  // Keep track of original nodes/edges to restore after simulation
  const originalNodes = useRef<Node[]>([]);
  const originalEdges = useRef<Edge[]>([]);
  const lastTime = useRef<number | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Screen recording states and refs
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isExportingGif, setIsExportingGif] = useState(false);

  // Update selection details when nodes or edges change
  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find(n => n.id === selectedNode.id);
      setSelectedNode(updated || null);
    }
  }, [nodes]);

  useEffect(() => {
    if (selectedEdge) {
      const updated = edges.find(e => e.id === selectedEdge.id);
      setSelectedEdge(updated || null);
    }
  }, [edges]);

  // Handle double click on canvas to add node
  const onPaneDoubleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    addNode(position.x, position.y);
  };

  const handleNodeClick = (_: any, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  };

  const handleEdgeClick = (_: any, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  };

  const handlePaneClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  // Convert React Flow representation to SimulationEngine Automaton format
  const getAutomatonData = (): Automaton => {
    return {
      nodes: nodes.map(n => ({
        id: n.id,
        label: (n.data?.label as string) || n.id,
        isStart: !!n.data?.isStart,
        isAccept: !!n.data?.isAccept,
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        symbols: ((e.data?.label as string) || '').split(',').map(s => s.trim()).filter(Boolean),
      })),
    };
  };

  // Update visual nodes and edges inside Zustand GraphStore
  const updateVisualStates = (renderState: RenderState) => {
    useGraphStore.setState((state) => {
      const updatedNodes = state.nodes.map(n => {
        const visual = renderState.nodes[n.id];
        return {
          ...n,
          data: {
            ...n.data,
            glow: visual ? visual.glow : 0,
            scale: visual ? visual.scale : 1,
          }
        };
      });

      const updatedEdges = state.edges.map(e => {
        const visual = renderState.edges[e.id];
        return {
          ...e,
          data: {
            ...e.data,
            isActive: visual ? visual.active : false,
            traversalProgress: visual ? visual.traversalProgress : undefined,
          }
        };
      });

      return { nodes: updatedNodes, edges: updatedEdges };
    });
  };

  // Runs the current automaton against inputString without touching any component
  // state, so it can be reused by both startSimulation and offline exports (GIF).
  const buildSimulationResult = () => {
    const automaton = getAutomatonData();
    if (automatonType === 'DFA') return simulateDFA(automaton, inputString);
    if (automatonType === 'NFA') return simulateNFA(automaton, inputString);
    if (automatonType === 'Mealy') {
      const mealyRes = simulateMealy(automaton, inputString);
      return { accepted: true, events: mealyRes.events, outputString: mealyRes.outputString };
    }
    if (automatonType === 'Moore') {
      const mooreRes = simulateMoore(automaton, inputString);
      return { accepted: true, events: mooreRes.events, outputString: mooreRes.outputString };
    }
    if (automatonType === 'PDA') return simulatePDA(automaton, inputString);
    return simulateTuringMachine(automaton, inputString);
  };

  // Start Simulation
  const startSimulation = () => {
    stopSimulation(); // Reset any active simulation
    originalNodes.current = JSON.parse(JSON.stringify(nodes));
    originalEdges.current = JSON.parse(JSON.stringify(edges));

    const result = buildSimulationResult();

    setSimulationEvents(result.events);
    setSimulationResult({
      accepted: result.accepted,
      outputString: (result as any).outputString
    });

    // Generate timeline (800ms base step duration)
    const generatedTimeline = generateTimeline(result.events, 800);
    setTimeline(generatedTimeline);
    setPlayhead(0);

    const renderState = calculateRenderState(generatedTimeline, 0);
    updateVisualStates(renderState);
    setCurrentStep(renderState.symbolIndex);
    saveCurrentToRecent();
  };

  // Step Forward
  const stepForward = () => {
    if (!timeline) return;
    const nextKf = timeline.keyframes.find(kf => kf.startTime > playhead);
    if (nextKf) {
      setPlayhead(nextKf.startTime);
    } else {
      setPlayhead(timeline.duration);
      setIsPlaying(false);
    }
  };

  // Step Backward
  const stepBackward = () => {
    if (!timeline) return;
    const prevKfs = timeline.keyframes.filter(kf => kf.startTime < playhead - 10);
    if (prevKfs.length > 0) {
      const prevKf = prevKfs[prevKfs.length - 1];
      setPlayhead(prevKf.startTime);
    } else {
      setPlayhead(0);
    }
  };

  // Keyboard shortcuts (Editor view only): Cmd/Ctrl+Delete removes the selected
  // node or edge, Space toggles simulation play/pause, and Left/Right arrows step
  // the timeline. Ignored while the user is typing in any input/textarea/select.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeView !== 'graph') return;

      const target = e.target as HTMLElement | null;
      const isTypingTarget = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      if (isTypingTarget) return;

      if ((e.metaKey || e.ctrlKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        if (selectedNode) {
          deleteNode(selectedNode.id);
          setSelectedNode(null);
        } else if (selectedEdge) {
          deleteEdge(selectedEdge.id);
          setSelectedEdge(null);
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          setIsPlaying(false);
        } else if (currentStep < simulationEvents.length - 1) {
          setIsPlaying(true);
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        if (currentStep < simulationEvents.length - 1) {
          e.preventDefault();
          stepForward();
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        if (currentStep > 0) {
          e.preventDefault();
          stepBackward();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, selectedNode, selectedEdge, deleteNode, deleteEdge, isPlaying, currentStep, simulationEvents.length, stepForward, stepBackward]);

  // Playhead update loop driven by requestAnimationFrame
  useEffect(() => {
    if (isPlaying && timeline) {
      const loop = (timestamp: number) => {
        if (lastTime.current === null) {
          lastTime.current = timestamp;
        }
        const delta = timestamp - lastTime.current;
        lastTime.current = timestamp;

        // If playbackSpeed is 1000ms, standard rate (timeScale = 1).
        // If 500ms, 2x faster (timeScale = 2).
        const timeScale = 800 / playbackSpeed;

        setPlayhead(prev => {
          const next = prev + delta * timeScale;
          if (next >= timeline.duration) {
            setIsPlaying(false);
            return timeline.duration;
          }
          return next;
        });

        animationFrameId.current = requestAnimationFrame(loop);
      };
      animationFrameId.current = requestAnimationFrame(loop);
    } else {
      lastTime.current = null;
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
      }
    }

    return () => {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, timeline, playbackSpeed]);

  // Synchronize visual render state when playhead changes
  useEffect(() => {
    if (timeline) {
      const renderState = calculateRenderState(timeline, playhead);
      updateVisualStates(renderState);
      setCurrentStep(renderState.symbolIndex);
    }
  }, [playhead, timeline]);

  // Stop Simulation
  const stopSimulation = () => {
    setIsPlaying(false);
    lastTime.current = null;
    if (animationFrameId.current !== null) {
      cancelAnimationFrame(animationFrameId.current);
    }
    if (originalNodes.current.length > 0) {
      loadGraph(originalNodes.current, originalEdges.current, nodeCounter);
      originalNodes.current = [];
      originalEdges.current = [];
    }
    setSimulationEvents([]);
    setTimeline(null);
    setPlayhead(0);
    setSimulationResult(null);
    setCurrentStep(-1);
  };

  // AI Tutor state
  const [tutorMessages, setTutorMessages] = useState<{ sender: 'user' | 'tutor', text: string }[]>([
    { sender: 'tutor', text: "Hello! I am your AI Computer Science Tutor. Ask me any questions about formal languages, automata, or your current graph!" }
  ]);
  const [tutorInput, tutorInputSet] = useState('');
  const [tutorMode, setTutorMode] = useState<'Beginner' | 'Intermediate' | 'Advanced' | 'Professor'>('Intermediate');
  const [isTutorLoading, setIsTutorLoading] = useState(false);
  const [isTutorOpen, setIsTutorOpen] = useState(false);

  // DB Project state
  const [dbProjects, setDbProjects] = useState<any[]>([]);
  const [isProjectsListOpen, setIsProjectsListOpen] = useState(false);
  const [saveName, setSaveName] = useState('My DFA Project');

  // AI Tutor api request handler
  const askTutor = async (questionText?: string) => {
    const textToSend = questionText || tutorInput;
    if (!textToSend.trim()) return;

    const newMessages = [...tutorMessages, { sender: 'user' as const, text: textToSend }];
    setTutorMessages(newMessages);
    tutorInputSet('');
    setIsTutorLoading(true);

    // Scan user's question for algorithmic calculation keywords to trigger Rule Engine
    let calculationResult: string | null = null;
    const lowerQuestion = textToSend.toLowerCase();
    
    try {
      if (lowerQuestion.includes('minimize') || lowerQuestion.includes('minimization')) {
        const dfa = getAutomatonData();
        const minDfa = minimizeDFA(dfa);
        calculationResult = `DFA Minimization: Minimized DFA has ${minDfa.nodes.length} states: ${minDfa.nodes.map(n => n.label).join(', ')}`;
      } else if (lowerQuestion.includes('nfa to dfa') || lowerQuestion.includes('subset construction')) {
        const nfa = getAutomatonData();
        const dfa = nfaToDfa(nfa);
        calculationResult = `NFA-to-DFA: Equivalent DFA has ${dfa.nodes.length} states: ${dfa.nodes.map(n => n.label).join(', ')}`;
      }
    } catch (e) {
      calculationResult = "Error executing deterministic algorithm on current graph.";
    }

    const automatonContext = {
      type: automatonType,
      nodes: nodes.map(n => `${n.data?.label || n.id}${n.data?.isStart ? ' (Start)' : ''}${n.data?.isAccept ? ' (Accept)' : ''}`).join(', '),
      edges: edges.map(e => `${e.source} -> ${e.target} on '${e.data?.label || ''}'`).join('; '),
      input_string: inputString,
      rule_engine_calculation: calculationResult
    };

    try {
      const response = await fetch('http://localhost:8000/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          mode: tutorMode,
          context: automatonContext
        })
      });

      if (!response.ok) throw new Error('Tutor API failed');
      const data = await response.json();
      setTutorMessages(prev => [...prev, { sender: 'tutor' as const, text: data.response }]);
    } catch (err) {
      setTutorMessages(prev => [...prev, { sender: 'tutor' as const, text: "Error: Could not reach local AI Tutor backend. Verify the FastAPI server is running (`fastapi dev` or uvicorn)." }]);
    } finally {
      setIsTutorLoading(false);
    }
  };

  // Derives quick-ask prompts from the automaton currently on the canvas
  // (engine type, state/accept structure, input string) instead of static hints.
  const getSuggestedTutorPrompts = (): string[] => {
    if (nodes.length === 0) {
      return [
        "How do I build my first automaton?",
        "What's the difference between a DFA and an NFA?",
        "Explain start states and accept states"
      ];
    }

    const acceptLabels = nodes
      .filter(n => n.data?.isAccept)
      .map(n => (n.data?.label as string) || n.id);

    const prompts: string[] = [`Explain my current ${automatonType}'s structure`];

    if (automatonType === 'DFA') {
      prompts.push("Can this DFA be minimized?");
      prompts.push("Is this DFA missing any transitions?");
    } else if (automatonType === 'NFA') {
      prompts.push("Convert this NFA to an equivalent DFA");
      prompts.push("Does this NFA use epsilon transitions?");
    } else if (automatonType === 'PDA') {
      prompts.push(`How does the stack evolve for input "${inputString}"?`);
    } else if (automatonType === 'TM') {
      prompts.push(`Walk me through the tape for input "${inputString}"`);
    } else {
      prompts.push(`What output does this produce for "${inputString}"?`);
    }

    if (acceptLabels.length > 1) {
      prompts.push(`Why do states ${acceptLabels.join(', ')} all accept?`);
    } else if (inputString) {
      prompts.push(`Walk me through simulating "${inputString}" step by step`);
    }

    return prompts.slice(0, 4);
  };

  const saveProjectToDB = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName,
          automaton_type: automatonType,
          nodes_json: JSON.stringify(nodes),
          edges_json: JSON.stringify(edges),
          node_counter: nodeCounter
        })
      });
      if (response.ok) {
        alert("Project saved successfully to local SQLite database!");
      }
    } catch (err) {
      alert("Error: Could not connect to local database. Verify FastAPI is running.");
    }
  };

  const loadProjectsFromDB = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/projects');
      if (response.ok) {
        const data = await response.json();
        setDbProjects(data);
        setIsProjectsListOpen(true);
      }
    } catch (err) {
      alert("Error: Could not load projects. Verify FastAPI is running.");
    }
  };

  const selectProjectFromDB = (proj: any) => {
    try {
      const parsedNodes = JSON.parse(proj.nodes_json);
      const parsedEdges = JSON.parse(proj.edges_json);
      loadGraph(parsedNodes, parsedEdges, proj.node_counter);
      setAutomatonType(proj.automaton_type);
      setIsProjectsListOpen(false);
    } catch (err) {
      alert("Failed to load project details.");
    }
  };

  // Apply layout spacing to new graph nodes
  const applyLayoutToAutomaton = (automaton: Automaton) => {
    const radius = 180;
    const centerX = 250;
    const centerY = 250;
    const n = automaton.nodes.length;

    const reactFlowNodes: Node[] = automaton.nodes.map((node, idx) => {
      const angle = n > 1 ? (idx * 2 * Math.PI) / n : 0;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      return {
        id: node.id,
        type: 'state',
        position: { x, y },
        data: {
          label: node.label,
          isStart: node.isStart,
          isAccept: node.isAccept,
          isActive: false,
          scale: 1,
          glow: 0
        }
      };
    });

    const reactFlowEdges: Edge[] = automaton.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'transition',
      data: { label: edge.symbols.join(', ') }
    }));

    loadGraph(reactFlowNodes, reactFlowEdges, automaton.nodes.length + 1);
  };

  const saveSettings = () => {
    localStorage.setItem('autometa_api_provider', apiProvider);
    localStorage.setItem('autometa_gemini_key', geminiKey);
    localStorage.setItem('autometa_openai_key', openaiKey);
    localStorage.setItem('autometa_groq_key', groqKey);
    setIsSettingsOpen(false);
    alert("AI settings saved successfully!");
  };

  useEffect(() => {
    if (activeTransformation === 'nfaToDfa' && transformData) {
      const currentRow = transformData.rows[transformStepIndex];
      if (currentRow) {
        const activeIds = currentRow.subset;
        useGraphStore.setState((state) => ({
          nodes: state.nodes.map(n => ({
            ...n,
            data: {
              ...n.data,
              isActive: activeIds.includes(n.id)
            }
          }))
        }));
      }
    } else {
      useGraphStore.setState((state) => ({
        nodes: state.nodes.map(n => ({
          ...n,
          data: {
            ...n.data,
            isActive: false
          }
        }))
      }));
    }
  }, [activeTransformation, transformStepIndex, transformData]);

  const handleNfaToDfa = () => {
    stopSimulation();
    const nfa = getAutomatonData();
    const data = computeNfaToDfaWalkthrough(nfa);
    setTransformData(data);
    setActiveTransformation('nfaToDfa');
    setTransformStepIndex(0);
  };

  const handleMinimizeDfa = () => {
    stopSimulation();
    const dfa = getAutomatonData();
    const data = computeMinimizationWalkthrough(dfa);
    setTransformData(data);
    setActiveTransformation('minimize');
    setTransformStepIndex(0);
  };

  const handleAIGrade = async () => {
    setIsGradingLoading(true);
    setGradingResult(null);
    try {
      const provider = localStorage.getItem('autometa_api_provider') || 'Ollama';
      let apiKey = '';
      if (provider === 'Gemini') apiKey = localStorage.getItem('autometa_gemini_key') || '';
      else if (provider === 'OpenAI') apiKey = localStorage.getItem('autometa_openai_key') || '';
      else if (provider === 'Groq') apiKey = localStorage.getItem('autometa_groq_key') || '';

      const response = await fetch('http://localhost:8000/api/tutor/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: targetDescription,
          automaton_type: automatonType,
          nodes: nodes.map(n => ({ id: n.id, label: n.data?.label || n.id, isStart: !!n.data?.isStart, isAccept: !!n.data?.isAccept })),
          edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.data?.label || '' })),
          provider,
          api_key: apiKey
        })
      });

      if (!response.ok) throw new Error("Grading failed");
      const data = await response.json();
      setGradingResult(data.response || data.report || "No grading feedback returned.");
    } catch (err) {
      alert("Error reaching AI grading server. Verify FastAPI is running.");
    } finally {
      setIsGradingLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser" as any
        },
        audio: false
      });
      
      streamRef.current = stream;
      chunksRef.current = [];

      let mimeType = 'video/webm;codecs=vp9';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const isMp4 = mimeType.includes('mp4');
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `autometa-simulation-${new Date().getTime()}.${isMp4 ? 'mp4' : 'webm'}`;
        a.click();
        URL.revokeObjectURL(url);
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        setIsRecording(false);
      };

      stream.getVideoTracks()[0].onended = () => {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recorder.start();

      if (simulationEvents.length === 0) {
        startSimulation();
      } else {
        setIsPlaying(true);
      }
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const waitForPaint = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  // Steps the timeline offline (independent of the live playhead), capturing a
  // canvas frame at each sample so the exported GIF matches the on-screen animation.
  // Auto-starts a run from the current input if none is active yet, mirroring how
  // "Record MP4/WebM" kicks off a simulation when the user hasn't pressed Play.
  const exportSimulationToGIF = async () => {
    if (isExportingGif) return;
    if (nodes.length === 0) {
      alert("Add at least one state before exporting a GIF.");
      return;
    }
    const viewportEl = getFlowViewportEl();
    if (!viewportEl) return;

    const wasPlaying = isPlaying;
    setIsPlaying(false);
    setIsExportingGif(true);

    const savedPlayhead = playhead;
    const savedNodes = JSON.parse(JSON.stringify(nodes));
    const savedEdges = JSON.parse(JSON.stringify(edges));

    try {
      let activeTimeline = timeline;
      if (!activeTimeline) {
        const result = buildSimulationResult();
        activeTimeline = generateTimeline(result.events, 800);
        setSimulationEvents(result.events);
        setSimulationResult({ accepted: result.accepted, outputString: (result as any).outputString });
        setTimeline(activeTimeline);
      }
      if (activeTimeline.duration === 0) {
        alert("Nothing to animate — this input produces no transitions.");
        return;
      }

      const box = computeFlowCaptureBox(getNodes());
      const FRAME_STEP_MS = 100;
      const sampleTimes: number[] = [];
      for (let t = 0; t < activeTimeline.duration; t += FRAME_STEP_MS) sampleTimes.push(t);
      sampleTimes.push(activeTimeline.duration);

      const frames = [];
      for (let i = 0; i < sampleTimes.length; i++) {
        const t = sampleTimes[i];
        updateVisualStates(calculateRenderState(activeTimeline, t));
        await waitForPaint();
        const isLast = i === sampleTimes.length - 1;
        frames.push(await captureFlowFrame(viewportEl, box, isLast ? 600 : FRAME_STEP_MS));
      }

      downloadGIF(encodeGIF(frames), `autometa-simulation-${Date.now()}.gif`);
    } finally {
      useGraphStore.setState({ nodes: savedNodes, edges: savedEdges });
      setPlayhead(savedPlayhead);
      setIsExportingGif(false);
      if (wasPlaying) setIsPlaying(true);
    }
  };

  // Export project to file
  const exportProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(
      JSON.stringify({
        automatonType,
        nodes,
        edges,
        nodeCounter,
        version: "1.0.0"
      }, null, 2)
    );
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `autometa-${automatonType.toLowerCase()}.project`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import project from file
  const importProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const project = JSON.parse(e.target?.result as string);
        if (project.nodes && project.edges) {
          loadGraph(project.nodes, project.edges, project.nodeCounter || project.nodes.length);
          if (project.automatonType) setAutomatonType(project.automatonType);
        }
      } catch (err) {
        alert("Failed to parse project file.");
      }
    };
    reader.readAsText(file);
  };

  // Helper to render input string with current head character highlighted
  const renderInputStringWithHead = () => {
    const activeEvent = simulationEvents[currentStep];
    const headIndex = activeEvent ? (activeEvent.symbolIndex ?? -1) : -1;

    return (
      <div className="flex items-center gap-1 font-mono text-xl tracking-widest bg-black/40 px-4 py-2 rounded-lg border border-white/10 select-none">
        {inputString.split('').map((char, idx) => {
          const isCurrentHead = idx === headIndex;
          return (
            <span 
              key={idx} 
              className={`px-1.5 py-0.5 rounded transition-all duration-300 ${
                isCurrentHead 
                  ? 'bg-[#00f0ff] text-black font-bold scale-110 shadow-glow-blue' 
                  : idx < headIndex 
                    ? 'text-gray-500 line-through' 
                    : 'text-gray-200'
              }`}
            >
              {char}
            </span>
          );
        })}
        {inputString.length === 0 && <span className="text-gray-500">ε</span>}
        {headIndex >= inputString.length && (
          <span className="ml-1 px-1.5 py-0.5 rounded bg-[#39ff14] text-black text-xs font-bold uppercase animate-pulse">
            EOF
          </span>
        )}
      </div>
    );
  };

  // Find current simulation event for PDA/TM data
  const currentEvent = currentStep >= 0 ? simulationEvents[currentStep] : null;
  const activeStack = currentEvent ? (currentEvent as any).stack || [] : ['Z'];
  const activeTape = currentEvent ? (currentEvent as any).tape || (() => {
    const initTape: Record<number, string> = {};
    for (let i = 0; i < inputString.length; i++) {
      initTape[i] = inputString[i];
    }
    return initTape;
  })() : (() => {
    const initTape: Record<number, string> = {};
    for (let i = 0; i < inputString.length; i++) {
      initTape[i] = inputString[i];
    }
    return initTape;
  })();
  const activeHeadIndex = currentEvent ? (currentEvent as any).headIndex || 0 : 0;

  return (
    <div className="flex h-screen w-screen bg-[#060B1A] text-gray-100 overflow-hidden font-sans">
      {/* Global Left Navigation Sidebar */}
      {!isPresentationMode && (
        <aside className="w-[260px] h-screen bg-[#0A1024] border-r border-white/10 flex flex-col py-8 z-30 shrink-0 select-none">
          {/* Brand Logo & Title */}
          <div className="px-8 mb-8">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-1.5 bg-gradient-to-br from-[#00f0ff] to-[#ff007f] rounded-lg shadow-glow-blue animate-pulse">
                <Sparkles className="w-4 h-4 text-black" />
               </div>
               <h1 className="font-extrabold text-lg tracking-wider bg-gradient-to-r from-white via-gray-200 to-[#00f0ff] bg-clip-text text-transparent uppercase">
                 Autometa
               </h1>
            </div>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest pl-9">AI Studio • Neo Aurora</p>
          </div>

          {/* Navigation List */}
          <nav className="flex-1 flex flex-col gap-1 px-4">
            {[
              { id: 'dashboard', name: 'Home', icon: <Home className="w-4 h-4" /> },
              { id: 'graph', name: 'Editor', icon: <Tv className="w-4 h-4" /> },
              { id: 'grammars', name: 'Grammars', icon: <Blocks className="w-4 h-4" /> },
              { id: 'lessons', name: 'Lesson Builder', icon: <BookOpen className="w-4 h-4" /> }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => {
                  if (activeView === 'graph') {
                    saveCurrentToRecent();
                  }
                  stopSimulation();
                  setActiveView(item.id as any);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all border-none cursor-pointer ${
                  activeView === item.id
                    ? 'bg-white/5 text-white font-extrabold border-r-4 border-r-[#00f0ff]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 bg-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span className="text-xs">{item.name}</span>
                </div>
              </button>
            ))}
            
            {/* Settings button toggles Plugins Modal */}
            <button
              onClick={() => setIsPluginsOpen(true)}
              className="w-full flex items-center px-4 py-3 rounded-xl transition-all border-none cursor-pointer text-gray-400 hover:text-white hover:bg-white/5 bg-transparent"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4" />
                <span className="text-xs">Settings</span>
              </div>
            </button>
          </nav>

          {/* New Simulation Button */}
          <div className="px-6 mb-6">
            <button 
              onClick={() => {
                stopSimulation();
                clearGraph();
                setActiveView('graph');
              }}
              className="w-full py-3 bg-gradient-to-r from-[#00f0ff] to-[#ff007f] text-black font-extrabold text-xs rounded-full flex items-center justify-center gap-2 hover:opacity-95 active:scale-95 transition-all border-none cursor-pointer shadow-glow-blue/20 animate-pulse"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>New Simulation</span>
            </button>
          </div>

        </aside>
      )}

      {/* Right Work Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar (only for Editor viewports) */}
        {activeView !== 'dashboard' && (
          <header className="h-16 border-b border-white/10 glass-panel flex items-center justify-between px-6 z-10 select-none shrink-0">
            {/* Left: Brand Logo & Title */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-[#00f0ff] to-[#ff007f] rounded-lg shadow-glow-blue animate-pulse">
                <Sparkles className="w-5 h-5 text-black" />
              </div>
              <div>
                <h1 className="font-extrabold text-base tracking-wider bg-gradient-to-r from-white via-gray-200 to-[#00f0ff] bg-clip-text text-transparent uppercase">
                  AUTOMETA
                </h1>
                <p className="text-[9px] text-gray-400 font-medium uppercase tracking-widest">CS Animation Studio</p>
              </div>
            </div>
            {/* Middle: Configuration & Syllabus Toggles */}
            <div className="flex items-center gap-4 bg-black/40 p-1.5 px-3 rounded-xl border border-white/5 shadow-inner">
              {/* Automaton Type Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Engine:</span>
                <select 
                  value={automatonType}
                  onChange={(e) => {
                    stopSimulation();
                    setAutomatonType(e.target.value as any);
                    setSelectedExampleIndex("");
                  }}
                  className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00f0ff] font-bold cursor-pointer"
                >
                  <option value="DFA">DFA</option>
                  <option value="NFA">NFA</option>
                  <option value="Mealy">Mealy</option>
                  <option value="Moore">Moore</option>
                  <option value="PDA">PDA</option>
                  <option value="TM">Turing</option>
                </select>
              </div>

              <span className="h-4 w-px bg-white/10" />

              {/* Predefined Syllabus Select */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Syllabus:</span>
                <select 
                  value={selectedExampleIndex}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedExampleIndex(val);
                    if (val !== "") {
                      stopSimulation();
                      const idx = parseInt(val, 10);
                      const template = PREDEFINED_TEMPLATES[idx];
                      loadGraph(template.nodes, template.edges, template.nodes.length);
                      setInputString(template.input);
                    }
                  }}
                  className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00f0ff] font-bold cursor-pointer max-w-[160px]"
                >
                  <option value="">-- Choose --</option>
                  {PREDEFINED_TEMPLATES.map((tmpl, idx) => {
                    if (tmpl.type !== automatonType) return null;
                    return (
                      <option key={idx} value={idx.toString()}>
                        {tmpl.name}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Right: Workspace & File Control Actions */}
            <div className="flex items-center gap-2">
              {/* Database actions */}
              <Button variant="secondary" onClick={loadProjectsFromDB} className="flex items-center gap-1.5 !px-3 !py-1.5 text-xs">
                Load DB
              </Button>
              <Button variant="secondary" onClick={() => setIsProjectsListOpen(true)} className="flex items-center gap-1.5 !px-3 !py-1.5 text-xs">
                Save DB
              </Button>
              <Button variant="secondary" onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-1.5 !px-3 !py-1.5 text-xs">
                <Settings className="w-3.5 h-3.5" /> Settings
              </Button>

              {/* Project File actions */}
              <div className="relative">
                <button 
                  onClick={() => setIsExportOpen(!isExportOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-white/5 border border-white/10 hover:border-white/20 text-gray-300 transition-all duration-200 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" /> Export As...
                </button>
                {isExportOpen && (
                  <div className="absolute right-0 mt-1 w-40 rounded-xl bg-[#0c101d] border border-white/10 p-1.5 shadow-2xl z-50 flex flex-col gap-0.5 animate-slide-down animate-fade-in">
                    <button 
                      onClick={() => { exportProject(); setIsExportOpen(false); }} 
                      className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/5 rounded-md cursor-pointer border-none bg-transparent"
                    >
                      .project (Full Project)
                    </button>
                    <button
                      onClick={() => {
                        const viewportEl = getFlowViewportEl();
                        if (viewportEl) exportToSVG(viewportEl, getNodes(), automatonType).catch(console.error);
                        setIsExportOpen(false);
                      }}
                      className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/5 rounded-md cursor-pointer border-none bg-transparent"
                    >
                      Vector SVG
                    </button>
                    <button
                      onClick={() => {
                        const viewportEl = getFlowViewportEl();
                        if (viewportEl) exportToPNG(viewportEl, getNodes(), automatonType).catch(console.error);
                        setIsExportOpen(false);
                      }}
                      className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/5 rounded-md cursor-pointer border-none bg-transparent"
                    >
                      PNG Image
                    </button>
                    <button 
                      onClick={() => { exportToHTML(nodes, edges, automatonType); setIsExportOpen(false); }} 
                      className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/5 rounded-md cursor-pointer border-none bg-transparent"
                    >
                      Interactive HTML
                    </button>
                    <button
                      onClick={() => { exportToPDF(nodes, edges, automatonType); setIsExportOpen(false); }}
                      className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/5 rounded-md cursor-pointer border-none bg-transparent"
                    >
                      PDF / Print
                    </button>
                    <button
                      onClick={() => { exportSimulationToGIF(); setIsExportOpen(false); }}
                      disabled={isExportingGif}
                      className="text-left w-full px-2.5 py-1.5 text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/5 rounded-md cursor-pointer border-none bg-transparent disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isExportingGif ? 'Exporting GIF...' : 'GIF Animation'}
                    </button>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 glass-button text-gray-200 hover:text-white cursor-pointer">
                <FileUp className="w-3.5 h-3.5 text-gray-400" /> Import
                <input type="file" accept=".project" onChange={importProject} className="hidden" />
              </label>

              <Button variant="danger" onClick={() => { stopSimulation(); clearGraph(); }} className="flex items-center gap-1.5 !px-3 !py-1.5 text-xs">
                Reset
              </Button>
            </div>
          </header>
        )}

        {/* Main Workspace Layout */}
        <div className="flex-1 flex relative overflow-hidden bg-[#060B1A]">
        {activeView === 'dashboard' ? (
          <DashboardView 
            onNavigate={(view) => setActiveView(view)}
            onNewSimulation={() => {
              stopSimulation();
              clearGraph();
              setActiveView('graph');
            }}
            recentProjects={recentProjects}
            continueProject={continueProject}
            onSelectProject={handleSelectRecentProject}
            lessonHistory={lessonHistory}
            onSelectLesson={handleSelectLesson}
          />
        ) : activeView === 'grammars' ? (
          <GrammarEditor />
        ) : activeView === 'lessons' ? (
          <LessonBuilder
            history={lessonHistory}
            onSaveLesson={saveLessonToHistory}
            lessonToLoad={pendingLesson}
            onLessonConsumed={() => setPendingLesson(null)}
            onLoadDiagram={(diagram) => {
              stopSimulation();
              setAutomatonType(diagram.type as any);
              const loadedNodes: Node[] = diagram.nodes.map((n) => ({
                id: n.id,
                type: 'state',
                position: { x: n.x, y: n.y },
                data: { label: n.label, isStart: n.isStart, isAccept: n.isAccept, isActive: false, scale: 1, glow: 0 }
              }));
              const loadedEdges: Edge[] = diagram.edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                type: 'transition',
                data: { label: e.label }
              }));
              loadGraph(loadedNodes, loadedEdges, loadedNodes.length);
              if (diagram.exampleInput) setInputString(diagram.exampleInput);
              setActiveView('graph');
            }}
          />
        ) : (
          <>
            {/* React Flow Editor Workspace */}
            <div ref={flowWrapperRef} className="flex-1 h-full relative" onDoubleClick={onPaneDoubleClick}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
                onPaneClick={handlePaneClick}
                deleteKeyCode={["Backspace", "Delete"]}
                zoomOnDoubleClick={false}
                fitView
              >
                <Background color="#1e293b" gap={24} size={1} />
                {!isPresentationMode && <Controls className="!bg-black/60 !border-white/10 !text-white" />}
                {!isPresentationMode && (
                  <MiniMap 
                    style={{ background: '#0a0f1d' }}
                    nodeColor={() => '#1e293b'}
                    maskColor="rgba(0,0,0,0.5)"
                  />
                )}
              </ReactFlow>

              {/* Floating Turing Machine Tape Visualizer inside the canvas */}
              {automatonType === 'TM' && simulationEvents.length > 0 && (
                <div className="absolute bottom-4 left-4 right-4 z-20 max-w-4xl mx-auto">
                  <TapeVisualizer tape={activeTape} headIndex={activeHeadIndex} />
                </div>
              )}
            </div>

            {/* PDA Stack Visualizer Column next to canvas */}
            {automatonType === 'PDA' && simulationEvents.length > 0 && (
              <div className="w-72 border-l border-white/10 glass-panel p-4 h-full">
                <StackVisualizer stack={activeStack} />
              </div>
            )}

            {/* Right Sidebar Panel */}
            {!isPresentationMode && (
              activeTransformation ? (
                <aside className="w-[340px] border-l border-white/10 glass-panel p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar select-none">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#a855f7] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                      <span>{activeTransformation === 'nfaToDfa' ? 'NFA to DFA Steps' : 'DFA Minimizer'}</span>
                    </h2>
                    <button 
                      onClick={() => {
                        setActiveTransformation(null);
                        // Reset node active states
                        useGraphStore.setState((state) => ({
                          nodes: state.nodes.map(n => ({
                            ...n,
                            data: { ...n.data, isActive: false }
                          }))
                        }));
                      }}
                      className="text-xs text-gray-400 hover:text-white bg-transparent border-none cursor-pointer"
                    >
                      Exit
                    </button>
                  </div>

                  {activeTransformation === 'nfaToDfa' && transformData && (
                    <div className="flex flex-col gap-4">
                      <div className="text-xs text-gray-300">
                        Alphabet: <code className="text-[#00f0ff] font-mono">{transformData.alphabet.join(', ')}</code>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-gray-500 uppercase font-bold">Subset Construction Rows</span>
                        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                          {transformData.rows.slice(0, transformStepIndex + 1).map((row: any, idx: number) => (
                            <div key={idx} className="bg-black/40 border border-white/5 p-2 rounded-lg text-xs font-mono">
                              <div className="flex items-center justify-between border-b border-white/5 pb-1 mb-1">
                                <span className="text-[#00f0ff] font-bold">{row.stateId} ({row.label})</span>
                                <span className="text-gray-500">NFA: {`{${row.subset.join(',')}}`}</span>
                              </div>
                              {transformData.alphabet.map((sym: string) => {
                                const tr = row.transitions[sym];
                                return (
                                  <div key={sym} className="flex justify-between text-[11px] text-gray-300">
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
                        <span className="text-xs text-gray-400">
                          Step {transformStepIndex + 1} of {transformData.rows.length}
                        </span>
                        <div className="flex gap-2">
                          <Button 
                            variant="secondary"
                            disabled={transformStepIndex <= 0}
                            onClick={() => setTransformStepIndex(prev => prev - 1)}
                            className="!px-2.5 !py-1 text-xs"
                          >
                            Prev
                          </Button>
                          <Button 
                            disabled={transformStepIndex >= transformData.rows.length - 1}
                            onClick={() => setTransformStepIndex(prev => prev + 1)}
                            className="!px-2.5 !py-1 text-xs"
                          >
                            Next
                          </Button>
                        </div>
                      </div>

                      {transformStepIndex === transformData.rows.length - 1 && (
                        <Button 
                          onClick={() => {
                            applyLayoutToAutomaton(transformData.finalDfa);
                            setAutomatonType('DFA');
                            setActiveTransformation(null);
                          }}
                          className="w-full bg-[#a855f7] hover:bg-[#9333ea] text-white font-bold mt-2"
                        >
                          Apply DFA to Canvas
                        </Button>
                      )}
                    </div>
                  )}

                  {activeTransformation === 'minimize' && transformData && (
                    <div className="flex flex-col gap-4">
                      <span className="text-[10px] text-gray-500 uppercase font-bold">Myhill-Nerode Grid (Equivalent Pairs)</span>
                      
                      <div className="bg-black/50 border border-white/10 p-2.5 rounded-lg flex flex-col gap-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                        {transformData.pairs.map((p: any) => {
                          const isShown = transformStepIndex === 0 ? p.step === 'base' : true;
                          const isCurrentlyMarked = isShown && p.marked;
                          
                          return (
                            <div key={p.pairKey} className="flex items-center justify-between text-xs font-mono">
                              <span className="text-gray-300 font-bold">{`{${p.label1}, ${p.label2}}`}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isCurrentlyMarked ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                {isCurrentlyMarked ? 'Distinguishable' : 'Equivalent'}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="bg-black/40 border border-white/5 p-3 rounded-lg flex flex-col gap-1">
                        <span className="text-[10px] text-gray-500 uppercase font-bold">Trace & Explanation</span>
                        <div className="text-[11px] text-gray-300 max-h-32 overflow-y-auto custom-scrollbar">
                          {transformData.pairs
                            .filter((p: any) => p.marked && (transformStepIndex === 0 ? p.step === 'base' : true))
                            .map((p: any) => (
                              <div key={p.pairKey} className="border-b border-white/5 py-1">
                                <span className="font-bold text-[#00f0ff]">{`{${p.label1}, ${p.label2}}`}:</span> {p.reason}
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className="flex gap-2 justify-between items-center mt-3 pt-3 border-t border-white/10">
                        <span className="text-xs text-gray-400">
                          {transformStepIndex === 0 ? "Step 1: Base Case" : "Step 2: Iterative Passes"}
                        </span>
                        <div className="flex gap-2">
                          <Button 
                            variant="secondary"
                            disabled={transformStepIndex <= 0}
                            onClick={() => setTransformStepIndex(prev => prev - 1)}
                            className="!px-2.5 !py-1 text-xs"
                          >
                            Prev
                          </Button>
                          <Button 
                            disabled={transformStepIndex >= 1}
                            onClick={() => setTransformStepIndex(prev => prev + 1)}
                            className="!px-2.5 !py-1 text-xs"
                          >
                            Next
                          </Button>
                        </div>
                      </div>

                      {transformStepIndex === 1 && (
                        <Button 
                          onClick={() => {
                            applyLayoutToAutomaton(transformData.finalDfa);
                            setActiveTransformation(null);
                          }}
                          className="w-full bg-[#a855f7] hover:bg-[#9333ea] text-white font-bold mt-2"
                        >
                          Apply Minimization to Canvas
                        </Button>
                      )}
                    </div>
                  )}
                </aside>
              ) : (
                <aside className="w-[300px] border-l border-white/10 glass-panel p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar select-none">
                  {/* Selected Item Editor */}
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#00f0ff] rounded-full animate-ping" />
                      <span>Element Properties</span>
                    </h2>
                    
                    {selectedNode ? (
                      <div className="bg-white/5 p-4 rounded-xl border-y border-r border-white/5 border-l-4 border-l-[#00f0ff] shadow-glow-blue/5 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Selected State</span>
                          <span className="font-mono text-[#00f0ff] font-bold">{selectedNode.id}</span>
                        </div>

                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Label / Name</label>
                          <input 
                            type="text" 
                            value={selectedNode.data?.label as string || ''} 
                            onChange={(e) => {
                              const label = e.target.value;
                              useGraphStore.setState((state) => ({
                                nodes: state.nodes.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, label } } : n)
                              }));
                            }}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#00f0ff] text-white hover:border-white/20 transition-colors"
                          />
                          {automatonType === 'Moore' && (
                            <p className="text-[10px] text-gray-500 mt-1">
                              Moore format: <code className="text-[#00f0ff]">state/output</code> (e.g. <code className="text-[#00f0ff]">q0/1</code>).
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-200">Start State</span>
                          <input 
                            type="checkbox" 
                            checked={!!selectedNode.data?.isStart} 
                            onChange={() => toggleStart(selectedNode.id)}
                            className="w-4 h-4 rounded accent-[#00f0ff] cursor-pointer"
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-200">Accept State</span>
                          <input 
                            type="checkbox" 
                            checked={!!selectedNode.data?.isAccept} 
                            onChange={() => toggleAccept(selectedNode.id)}
                            className="w-4 h-4 rounded accent-[#ff007f] cursor-pointer"
                          />
                        </div>

                        <Button
                          variant="danger"
                          onClick={() => { deleteNode(selectedNode.id); setSelectedNode(null); }}
                          title={`Delete State (${DELETE_SHORTCUT_HINT})`}
                          className="w-full flex items-center justify-center gap-2 mt-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          <Trash2 className="w-4 h-4" /> Delete State
                        </Button>
                      </div>
                    ) : selectedEdge ? (
                      <div className="bg-white/5 p-4 rounded-xl border-y border-r border-white/5 border-l-4 border-l-[#00f0ff] shadow-glow-blue/5 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Selected Transition</span>
                          <span className="font-mono text-[#00f0ff] font-bold">Edge</span>
                        </div>

                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Transition Symbols</label>
                          <input 
                            type="text" 
                            value={selectedEdge.data?.label as string || ''} 
                            onChange={(e) => updateEdgeLabel(selectedEdge.id, e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#00f0ff] text-white font-mono hover:border-white/20 transition-colors"
                          />
                          {automatonType === 'Mealy' && (
                            <p className="text-[10px] text-gray-500 mt-1">
                              Mealy format: <code className="text-[#00f0ff]">input/output</code> (e.g. <code className="text-[#00f0ff]">0/1</code>).
                            </p>
                          )}
                          {automatonType === 'PDA' && (
                            <p className="text-[10px] text-gray-500 mt-1">
                              PDA format: <code className="text-[#00f0ff]">read, pop {'->'} push</code> (e.g. <code className="text-[#00f0ff]">a, Z {'->'} A Z</code>).
                            </p>
                          )}
                          {automatonType === 'TM' && (
                            <p className="text-[10px] text-gray-500 mt-1">
                              TM format: <code className="text-[#00f0ff]">read {'->'} write, dir</code> (e.g. <code className="text-[#00f0ff]">0 {'->'} 1, R</code>).
                            </p>
                          )}
                          {(automatonType === 'DFA' || automatonType === 'NFA') && (
                            <p className="text-[10px] text-gray-500 mt-1">Use comma to separate multiple symbols. Empty represents ε.</p>
                          )}
                        </div>

                        <Button
                          variant="danger"
                          onClick={() => { deleteEdge(selectedEdge.id); setSelectedEdge(null); }}
                          title={`Delete Transition (${DELETE_SHORTCUT_HINT})`}
                          className="w-full flex items-center justify-center gap-2 mt-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          <Trash2 className="w-4 h-4" /> Delete Transition
                        </Button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 bg-black/30 p-5 rounded-xl border border-dashed border-white/10 text-center animate-pulse">
                        Click a state or transition to inspect and edit its properties.
                      </div>
                    )}
                  </div>

                  {/* Simulation Configuration */}
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#ff007f] rounded-full animate-ping" />
                      <span>Simulation Input</span>
                    </h2>
                    <div className="bg-white/5 p-4 rounded-xl border-y border-r border-white/5 border-l-4 border-l-[#ff007f] shadow-glow-pink/5 flex flex-col gap-4">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Input String</label>
                        <input 
                          type="text" 
                          value={inputString} 
                          onChange={(e) => {
                            setInputString(e.target.value);
                            if (simulationEvents.length > 0) stopSimulation();
                          }}
                          disabled={simulationEvents.length > 0}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#ff007f] text-white font-mono disabled:opacity-50 hover:border-white/20 transition-colors"
                          placeholder="e.g. 0110"
                        />
                      </div>

                      {simulationEvents.length === 0 ? (
                        <Button 
                          onClick={startSimulation}
                          disabled={nodes.length === 0}
                          className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-glow-blue/20"
                        >
                          <PlayCircle className="w-4 h-4" /> Run Simulation
                        </Button>
                      ) : (
                        <Button 
                          variant="danger" 
                          onClick={stopSimulation}
                          className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          <RotateCcw className="w-4 h-4" /> Stop & Edit Graph
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* AI Grading Section */}
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-ping" />
                      <span>AI Grading & Feedback</span>
                    </h2>
                    <div className="bg-white/5 p-4 rounded-xl border-y border-r border-white/5 border-l-4 border-l-[#10b981] shadow-glow-green/5 flex flex-col gap-3">
                      <label className="text-xs text-gray-400 mb-1 block font-bold uppercase">Language Description</label>
                      <textarea
                        value={targetDescription}
                        onChange={(e) => setTargetDescription(e.target.value)}
                        placeholder="e.g. Accepts binary strings containing an even number of '0' symbols."
                        className="w-full h-16 bg-black/40 border border-white/10 rounded-lg p-2 text-xs focus:outline-none focus:border-[#10b981] text-white hover:border-white/20 transition-colors custom-scrollbar"
                      />
                      <Button 
                        onClick={handleAIGrade}
                        disabled={nodes.length === 0 || !targetDescription.trim() || isGradingLoading}
                        className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all bg-[#10b981] hover:bg-[#059669] text-white font-bold"
                      >
                        <Sparkles className="w-4 h-4" /> {isGradingLoading ? "Grading..." : "Grade Canvas"}
                      </Button>
                    </div>
                  </div>

                  {/* Algorithms & Conversions */}
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#a855f7] rounded-full animate-ping" />
                      <span>Algorithms</span>
                    </h2>
                    <div className="bg-white/5 p-4 rounded-xl border-y border-r border-white/5 border-l-4 border-l-[#a855f7] shadow-glow-purple/5 flex flex-col gap-2">
                      {automatonType === 'NFA' ? (
                        <Button 
                          onClick={handleNfaToDfa}
                          disabled={nodes.length === 0}
                          className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          Convert NFA to DFA (Step)
                        </Button>
                      ) : automatonType === 'DFA' ? (
                        <Button 
                          onClick={handleMinimizeDfa}
                          disabled={nodes.length === 0}
                          className="w-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          Minimize DFA (Step)
                        </Button>
                      ) : (
                        <div className="text-[10px] text-gray-500 text-center py-2">
                          No deterministic transformations for {automatonType}.
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
              )
            )}
          </>
        )}
      </div>

      {/* Bottom Simulation Control Panel */}
      {simulationEvents.length > 0 && (
        <div className="h-24 border-t border-white/10 glass-panel flex items-center justify-between px-8 z-10">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Active Run</span>
            {renderInputStringWithHead()}
            {(automatonType === 'Mealy' || automatonType === 'Moore') && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-bold uppercase">Transduced Output:</span>
                <span className="text-xs font-mono font-bold text-[#00f0ff] bg-black/40 px-2 py-0.5 rounded border border-white/5">
                  {(simulationResult as any)?.outputString || ""}
                </span>
              </div>
            )}
          </div>

          {/* Playback Button Group */}
          <div className="flex items-center gap-4">
            {isRecording ? (
              <button 
                onClick={stopRecording}
                className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 px-3 py-1.5 animate-pulse text-xs font-bold"
                title="Stop Recording"
              >
                <VideoOff className="w-4 h-4" /> Stop Rec
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="p-2 rounded-lg bg-white/5 hover:bg-[#00f0ff]/10 border border-white/10 hover:border-[#00f0ff]/30 text-white flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold"
                title="Record Simulation Video"
              >
                <Video className="w-4 h-4 text-[#00f0ff]" /> Record MP4/WebM
              </button>
            )}

            <button
              onClick={exportSimulationToGIF}
              disabled={isExportingGif}
              className="p-2 rounded-lg bg-white/5 hover:bg-[#00f0ff]/10 border border-white/10 hover:border-[#00f0ff]/30 text-white flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed"
              title="Export Simulation as GIF"
            >
              <Film className="w-4 h-4 text-[#00f0ff]" /> {isExportingGif ? 'Exporting GIF...' : 'Export GIF'}
            </button>

            <button
              onClick={stepBackward}
              disabled={currentStep <= 0}
              title="Previous step (←)"
              className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>

            {isPlaying ? (
              <button
                onClick={() => setIsPlaying(false)}
                title="Pause (Space)"
                className="p-3 bg-[#ff007f] rounded-full text-white shadow-glow-pink hover:scale-105 transition-all"
              >
                <Pause className="w-6 h-6 fill-white" />
              </button>
            ) : (
              <button
                onClick={() => setIsPlaying(true)}
                disabled={currentStep >= simulationEvents.length - 1}
                title="Play (Space)"
                className="p-3 bg-[#00f0ff] rounded-full text-black shadow-glow-blue hover:scale-105 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Play className="w-6 h-6 fill-black" />
              </button>
            )}

            <button
              onClick={stepForward}
              disabled={currentStep >= simulationEvents.length - 1}
              title="Next step (→)"
              className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Simulation Verdict Status */}
          <div className="flex items-center gap-4">
            {/* Speed slider */}
            <div className="flex flex-col gap-1 mr-4">
              <span className="text-[10px] text-gray-400 font-bold uppercase">Playback Speed</span>
              <div className="flex items-center gap-2">
                <input 
                  type="range" 
                  min="200" 
                  max="2000" 
                  step="100"
                  value={playbackSpeed} 
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="w-24 accent-[#00f0ff]" 
                />
                <span className="text-xs text-gray-400 font-mono">{(playbackSpeed/1000).toFixed(1)}s</span>
              </div>
            </div>

            {currentStep >= simulationEvents.length - 1 ? (
              simulationResult?.accepted ? (
                <div className="flex items-center gap-2 bg-[#39ff14]/15 border border-[#39ff14]/30 px-4 py-2 rounded-lg text-[#39ff14] shadow-glow-green font-bold text-sm animate-bounce">
                  <CheckCircle2 className="w-5 h-5" /> ACCEPTED
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-[#ff007f]/15 border border-[#ff007f]/30 px-4 py-2 rounded-lg text-[#ff007f] shadow-glow-pink font-bold text-sm">
                  <Trash2 className="w-5 h-5" /> REJECTED
                </div>
              )
            ) : (
              <div className="text-xs text-gray-400 animate-pulse uppercase tracking-wider font-bold">
                Step {currentStep + 1} of {simulationEvents.length}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating AI Tutor Toggle Button */}
      <button
        onClick={() => setIsTutorOpen(!isTutorOpen)}
        className={`fixed right-6 z-30 p-4 bg-gradient-to-br from-[#00f0ff] to-[#ff007f] hover:scale-105 active:scale-95 transition-all rounded-full shadow-glow-blue text-black font-extrabold flex items-center justify-center border-none cursor-pointer duration-300 ${
          simulationEvents.length > 0 ? 'bottom-28' : 'bottom-6'
        }`}
        title="Toggle AI Tutor"
      >
        <Sparkles className="w-6 h-6 animate-pulse" />
      </button>

      {/* AI Tutor Drawer Overlay */}
      {isTutorOpen && (
        <div className="fixed right-0 top-0 h-screen w-[420px] bg-[#0c101d] border-l border-white/10 shadow-2xl z-40 flex flex-col transition-all duration-300">
          <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/30">
            <div className="flex items-center gap-2 text-[#00f0ff] font-bold">
              <Sparkles className="w-5 h-5 animate-spin" /> AI TUTOR PANEL
            </div>
            <button onClick={() => setIsTutorOpen(false)} className="text-gray-400 hover:text-white font-bold text-xs bg-transparent border-none cursor-pointer">
              CLOSE
            </button>
          </div>

          {/* Mode Selector */}
          <div className="p-4 bg-white/2 border-b border-white/5 flex items-center justify-between text-xs">
            <span className="text-gray-400">Tutor Mode:</span>
            <select 
              value={tutorMode} 
              onChange={(e) => setTutorMode(e.target.value as any)}
              className="bg-black/60 border border-white/10 rounded px-2 py-1 text-[#00f0ff] focus:outline-none"
            >
              <option value="Beginner">Beginner (Analogies)</option>
              <option value="Intermediate">Intermediate (Normal)</option>
              <option value="Advanced">Advanced (Formulas)</option>
              <option value="Professor">Professor (Rigorous)</option>
            </select>
          </div>

          {/* Message List */}
          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4">
            {tutorMessages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="text-[9px] text-gray-500 mb-1">
                  {msg.sender === 'user' ? 'You' : `Tutor (${tutorMode})`}
                </div>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.sender === 'user' 
                    ? 'bg-[#00f0ff]/15 text-white border border-[#00f0ff]/30' 
                    : 'bg-white/5 text-gray-200 border border-white/5'
                }`}>
                  {msg.sender === 'user' ? (
                    msg.text
                  ) : (
                    <MarkdownRenderer text={msg.text} />
                  )}
                </div>
              </div>
            ))}
            {isTutorLoading && (
              <div className="flex items-center gap-2 text-xs text-[#00f0ff] animate-pulse">
                <Sparkles className="w-4 h-4 animate-spin" /> AI Tutor is thinking...
              </div>
            )}
          </div>

          {/* Preset Helper Prompts - derived from the automaton currently on the canvas */}
          <div className="p-4 bg-white/2 border-t border-white/5 flex gap-2 flex-wrap">
            {getSuggestedTutorPrompts().map((prompt) => (
              <button
                key={prompt}
                onClick={() => askTutor(prompt)}
                className="text-[10px] bg-white/5 hover:bg-[#00f0ff]/10 border border-white/10 hover:border-[#00f0ff]/30 px-2 py-1 rounded text-gray-300 cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <div className="p-4 border-t border-white/10 bg-black/20 flex gap-2">
            <input 
              type="text" 
              value={tutorInput}
              onChange={(e) => tutorInputSet(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') askTutor(); }}
              placeholder="Ask the AI Tutor..."
              className="flex-1 bg-black/60 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#00f0ff]"
            />
            <Button onClick={() => askTutor()} disabled={isTutorLoading}>
              Ask
            </Button>
          </div>
        </div>
      )}

      {/* Database Save/Load Modal Dialog */}
      {isProjectsListOpen && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c101d] border border-white/10 max-w-md w-full rounded-2xl p-6 flex flex-col gap-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h3 className="font-bold text-lg text-white">Database Projects Management</h3>
              <button onClick={() => setIsProjectsListOpen(false)} className="text-gray-400 hover:text-white bg-transparent border-none cursor-pointer text-sm">
                CLOSE
              </button>
            </div>

            {/* Save Section */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-gray-400 uppercase font-bold">Save Current Canvas</span>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={saveName} 
                  onChange={(e) => setSaveName(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00f0ff]"
                />
                <Button onClick={saveProjectToDB}>Save DB</Button>
              </div>
            </div>

            {/* Load Section */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-gray-400 uppercase font-bold">Load Saved Project</span>
              <div className="max-h-48 overflow-y-auto border border-white/5 rounded-lg flex flex-col bg-black/20">
                {dbProjects.length > 0 ? (
                  dbProjects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => selectProjectFromDB(proj)}
                      className="text-left px-4 py-3 hover:bg-white/5 transition-all border-b border-white/5 flex justify-between items-center text-sm bg-transparent border-none cursor-pointer w-full"
                    >
                      <div>
                        <div className="font-bold text-gray-200">{proj.name}</div>
                        <div className="text-[10px] text-gray-500">Created: {new Date(proj.created_at).toLocaleString()}</div>
                      </div>
                      <span className="bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/20 text-[10px] font-bold px-2 py-0.5 rounded">
                        {proj.automaton_type}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-gray-500">
                    No projects found in database.
                  </div>
                )}
              </div>
              <Button variant="secondary" onClick={loadProjectsFromDB} className="mt-2 text-center w-full">
                Refresh Database Projects List
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Plugins Modal Dialog */}
      {isPluginsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="bg-[#0a0f1d] border border-white/10 p-6 rounded-2xl w-full max-w-md shadow-2xl relative animate-slide-down animate-fade-in">
            <button
              onClick={() => setIsPluginsOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white cursor-pointer border-none bg-transparent font-bold text-sm"
            >
              ✕
            </button>
            <PluginManager />
          </div>
        </div>
      )}

      {isPresentationMode && (
        <button
          onClick={() => setIsPresentationMode(false)}
          className="fixed top-4 right-4 z-50 px-4 py-2 bg-black/90 hover:bg-black border border-[#00f0ff]/30 rounded-lg text-xs font-black text-[#00f0ff] hover:text-white cursor-pointer shadow-glow-blue"
        >
          Exit Presentation Mode
        </button>
      )}

      {/* AI Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0a0f1d] border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl animate-fade-in select-none">
            <div className="flex items-center gap-2 mb-2 pb-3 border-b border-white/10">
              <Settings className="w-5 h-5 text-[#00f0ff] animate-spin-slow" />
              <h3 className="text-base font-bold tracking-wider uppercase text-white">AI Tutor Configuration</h3>
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 font-bold uppercase">LLM Provider</label>
              <select
                value={apiProvider}
                onChange={(e) => setApiProvider(e.target.value as any)}
                className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00f0ff]"
              >
                <option value="Ollama">Local Ollama (Default)</option>
                <option value="Gemini">Gemini API (Google)</option>
                <option value="OpenAI">OpenAI API</option>
                <option value="Groq">Groq Cloud API</option>
              </select>
            </div>

            {apiProvider === 'Gemini' && (
              <div className="flex flex-col gap-1 animate-fade-in">
                <label className="text-xs text-gray-400 font-bold uppercase">Gemini API Key</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00f0ff] font-mono"
                />
              </div>
            )}

            {apiProvider === 'OpenAI' && (
              <div className="flex flex-col gap-1 animate-fade-in">
                <label className="text-xs text-gray-400 font-bold uppercase">OpenAI API Key</label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00f0ff] font-mono"
                />
              </div>
            )}

            {apiProvider === 'Groq' && (
              <div className="flex flex-col gap-1 animate-fade-in">
                <label className="text-xs text-gray-400 font-bold uppercase">Groq API Key</label>
                <input
                  type="password"
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  placeholder="gsk_..."
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00f0ff] font-mono"
                />
              </div>
            )}

            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-white/10">
              <Button variant="secondary" onClick={() => setIsSettingsOpen(false)}>Cancel</Button>
              <Button onClick={saveSettings}>Save Config</Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Grading Report Modal */}
      {gradingResult && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#0a0f1d] border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#10b981]" />
                <h3 className="text-base font-bold tracking-wider uppercase text-[#10b981]">AI Grading Report</h3>
              </div>
              <button 
                onClick={() => setGradingResult(null)}
                className="text-gray-400 hover:text-white bg-transparent border-none cursor-pointer text-sm"
              >
                ✕ Close
              </button>
            </div>
            
            <div className="prose prose-invert text-sm leading-relaxed text-gray-300">
              <MarkdownRenderer text={gradingResult} />
            </div>

            <div className="flex justify-end mt-2 pt-3 border-t border-white/10">
              <Button onClick={() => setGradingResult(null)}>Got It</Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
