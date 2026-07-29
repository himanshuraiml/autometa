import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AutoUpdaterModal } from './components/AutoUpdaterModal';
import { useAutoUpdater } from './hooks/useAutoUpdater';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  useStore
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import type { Automaton } from '@autometa/simulation-engine';
import type { CFGRules } from '@autometa/rule-engine';
import '@xyflow/react/dist/style.css';

import { nodeTypes, edgeTypes } from '@autometa/graph-engine';
import { useGraphStore } from './store/useGraphStore';
import { StackVisualizer } from './components/StackVisualizer';
import { PdaBranches } from './components/PdaBranches';
import { TapeVisualizer } from './components/TapeVisualizer';
import { MultiTapeVisualizer } from './components/MultiTapeVisualizer';
import { TapeHistory } from './components/TapeHistory';
import { SettingsModal, type SettingsTab } from './components/SettingsModal';
import { EditorOnboarding } from './components/EditorOnboarding';
import { HelpCenterModal } from './components/HelpCenterModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastProvider';
import { NavSidebar, type AppView } from './components/NavSidebar';
import { EditorHeader } from './components/EditorHeader';
import { EditorSidebar } from './components/EditorSidebar';
import { TransformationPanel } from './components/TransformationPanel';
import { PlaybackBar } from './components/PlaybackBar';
import { TutorPanel } from './components/TutorPanel';
import { ProjectsModal } from './components/ProjectsModal';
import { GradingReportModal } from './components/GradingReportModal';
import { LayoutTools } from './components/LayoutTools';
import { PracticePanel } from './components/PracticePanel';
import { CanvasQuickActionBar } from './components/CanvasQuickActionBar';
import { ConversionHubModal } from './components/ConversionHubModal';
import { useSimulationPlayback } from './hooks/useSimulationPlayback';
import { useMediaExport } from './hooks/useMediaExport';
import { useProjectPersistence } from './hooks/useProjectPersistence';
import { useTransformations } from './hooks/useTransformations';
import { useGrading } from './hooks/useGrading';
import { useProfile } from './hooks/useProfile';
import { useExercises } from './hooks/useExercises';
import { useLessonPaths } from './hooks/useLessonPaths';
import { usePractice } from './hooks/usePractice';
import { useProjectLibrary } from './hooks/useProjectLibrary';
import { LESSON_HISTORY_KEY, LESSON_HISTORY_LIMIT, type SavedLesson } from './utils/lessonHistory';
import { PREDEFINED_TEMPLATES } from './data/templates';
import { toAutomaton, automatonToFlow } from './utils/flowAutomaton';
import type { AutomatonType } from './utils/flowAutomaton';
import type { ExerciseDTO } from './utils/apiClient';

// Heavy views load on demand so the editor's initial bundle stays small.
const GrammarEditor = lazy(() => import('./components/GrammarEditor').then(m => ({ default: m.GrammarEditor })));
const UnrestrictedGrammarEditor = lazy(() => import('./components/UnrestrictedGrammarEditor').then(m => ({ default: m.UnrestrictedGrammarEditor })));
const LessonBuilder = lazy(() => import('./components/LessonBuilder').then(m => ({ default: m.LessonBuilder })));
const DashboardView = lazy(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const PracticeHub = lazy(() => import('./components/PracticeHub').then(m => ({ default: m.PracticeHub })));
const ProjectLibrary = lazy(() => import('./components/ProjectLibrary').then(m => ({ default: m.ProjectLibrary })));
const MachineOperations = lazy(() => import('./components/MachineOperations').then(m => ({ default: m.MachineOperations })));

const GRAPH_BASED_EXERCISE_TYPES = new Set(['DFA', 'NFA', 'PDA', 'TM']);

const viewLoadingFallback = (
  <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
);

function Editor() {
  const {
    nodes, edges, nodeCounter, automatonType, setAutomatonType,
    onNodesChange, onEdgesChange, onConnect,
    addNode, deleteNode, deleteEdge, clearGraph, loadGraph,
    undo, redo, tapeCount,
  } = useGraphStore();

  const { screenToFlowPosition, getNodes } = useReactFlow();
  const { showToast } = useToast();
  const flowWrapperRef = useRef<HTMLDivElement>(null);

  // Track if the editor canvas is interactive (unlocked)
  const isInteractive = useStore((s) => s.nodesDraggable);

  // Clear node/edge selection when canvas is locked
  useEffect(() => {
    if (!isInteractive) {
      setSelectedNode(null);
      setSelectedEdge(null);
    }
  }, [isInteractive]);

  const getFlowViewportEl = () => flowWrapperRef.current?.querySelector<HTMLElement>('.react-flow__viewport') ?? null;

  // Selection state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);

  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [grammarModel, setGrammarModel] = useState<'cfg' | 'unrestricted'>('cfg');
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [selectedExampleIndex, setSelectedExampleIndex] = useState<string>("");

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('ai');
  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false);
  const [isConversionHubOpen, setIsConversionHubOpen] = useState(false);
  const autoUpdater = useAutoUpdater();

  const [showEditorOnboarding, setShowEditorOnboarding] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('autometa-theme');
      if (stored === 'light' || stored === 'dark') return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    // Initial sync
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const listener = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('autometa-theme')) {
        const next = e.matches ? 'dark' : 'light';
        setTheme(next);
        if (next === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  useEffect(() => {
    if (activeView === 'graph' && !localStorage.getItem('autometa_editor_onboarding_seen')) {
      setShowEditorOnboarding(true);
    }
  }, [activeView]);
  const dismissEditorOnboarding = () => {
    localStorage.setItem('autometa_editor_onboarding_seen', 'true');
    setShowEditorOnboarding(false);
  };

  // Simulation pipeline. onRunStarted needs the persistence hook created below,
  // so it goes through a ref that is assigned once both hooks exist.
  const saveCurrentToRecentRef = useRef<() => void>(() => {});
  const playback = useSimulationPlayback({
    automatonType,
    onRunStarted: () => saveCurrentToRecentRef.current(),
  });
  const { inputString, setInputString, simulationEvents, currentStep, isPlaying, setIsPlaying, getAutomatonData, stopSimulation, stepForward, stepBackward, blankSymbol } = playback;

  const persistence = useProjectPersistence({
    automatonType,
    inputString,
    setInputString,
    stopSimulation,
    onProjectLoaded: () => {
      setSelectedExampleIndex("");
      setActiveView('graph');
    },
  });
  saveCurrentToRecentRef.current = persistence.saveCurrentToRecent;

  const media = useMediaExport({ playback, getFlowViewportEl, getNodes });

  const transformations = useTransformations({ stopSimulation, getAutomatonData, inputString });

  // Shared by any tool that produces a fresh automaton to drop onto the canvas
  // (Compare & Combine results, Grammar Editor's CFG->PDA / Regular Grammar->NFA).
  const handleLoadAutomatonFromTool = (automaton: Automaton, type: AutomatonType) => {
    stopSimulation();
    persistence.setCurrentProjectId(null);
    const flow = automatonToFlow(automaton);
    setAutomatonType(type);
    loadGraph(flow.nodes, flow.edges, automaton.nodes.length + 1);
    setActiveView('graph');
  };

  const grading = useGrading({ automatonType, getAutomatonData });

  // Phase 5 — practice mode, exercise generation, and lesson paths.
  const profile = useProfile();
  const exercisesHook = useExercises();
  const lessonPathsHook = useLessonPaths();
  const practice = usePractice({ profileId: profile.activeProfileId });
  const library = useProjectLibrary();

  const handleSaveVersion = async () => {
    if (persistence.currentProjectId === null) {
      showToast('Save this project to the database first (Save DB), then you can save named versions of it.', 'info');
      return;
    }
    const label = window.prompt('Name this version (e.g. "before minimization"):', `v${new Date().toLocaleString()}`);
    if (!label) return;
    try {
      await library.saveVersion(persistence.currentProjectId, label, JSON.stringify(nodes), JSON.stringify(edges), nodeCounter);
      showToast(`Saved version "${label}".`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save version.', 'error');
    }
  };

  const handleStartExercise = (exercise: ExerciseDTO) => {
    practice.startExercise(exercise);
    if (GRAPH_BASED_EXERCISE_TYPES.has(exercise.automaton_type)) {
      stopSimulation();
      setAutomatonType(exercise.automaton_type as AutomatonType);
      persistence.setCurrentProjectId(null);
      loadGraph([], [], 0);
      setActiveView('graph');
    }
  };

  // Lesson history (localStorage-backed, shared by dashboard and lesson builder)
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

  // "DFA Minimizer" quick-start card loads a template and needs to wait for it to
  // actually land in the store (loadGraph -> re-render) before handleMinimizeDfa
  // can read a non-stale automaton via getAutomatonData().
  const [pendingMinimizerLoad, setPendingMinimizerLoad] = useState(false);

  const handleOpenMinimizerFromDashboard = () => {
    stopSimulation();
    const template = PREDEFINED_TEMPLATES[0];
    setAutomatonType('DFA');
    persistence.setCurrentProjectId(null);
    loadGraph(template.nodes, template.edges, template.nodes.length);
    setInputString(template.input);
    setSelectedExampleIndex("");
    setActiveView('graph');
    setPendingMinimizerLoad(true);
  };

  useEffect(() => {
    if (pendingMinimizerLoad && activeView === 'graph' && nodes.length > 0) {
      transformations.handleMinimizeDfa();
      setPendingMinimizerLoad(false);
    }
  }, [pendingMinimizerLoad, activeView, nodes]);

  // Conversion Hub's "Load into Grammar Editor" (e.g. after a PDA -> CFG conversion)
  // needs to switch to the Grammars view and hand the freshly-computed rules to
  // GrammarEditor's initialRules prop, then clear itself so revisiting the tab
  // later doesn't keep re-seeding the same grammar over the user's edits.
  const [pendingGrammarLoad, setPendingGrammarLoad] = useState<CFGRules | null>(null);

  const handleLoadGrammarFromHub = (rules: CFGRules) => {
    setPendingGrammarLoad(rules);
    setGrammarModel('cfg');
    setActiveView('grammars');
  };

  useEffect(() => {
    if (pendingGrammarLoad && activeView === 'grammars') {
      setPendingGrammarLoad(null);
    }
  }, [pendingGrammarLoad, activeView]);

  // Dashboard "Regex to NFA" quick-start: jump to the editor and focus the regex
  // input in the Algorithms panel — no template to load, the user provides the pattern.
  const regexInputRef = useRef<HTMLInputElement>(null);
  const [focusRegexInput, setFocusRegexInput] = useState(false);

  const handleOpenRegexToNfaFromDashboard = () => {
    setActiveView('graph');
    setFocusRegexInput(true);
  };

  useEffect(() => {
    if (focusRegexInput && activeView === 'graph') {
      regexInputRef.current?.focus();
      setFocusRegexInput(false);
    }
  }, [focusRegexInput, activeView]);

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
    if (!isInteractive) return;
    event.preventDefault();
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    addNode(position.x, position.y);
  };

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  };

  const handleEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  };

  const handlePaneClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  // Keyboard shortcuts (Editor view only): Cmd/Ctrl+Delete removes the selected
  // node or edge, Cmd/Ctrl+Z undoes and Cmd/Ctrl+Shift+Z (or Ctrl+Y) redoes the last
  // canvas edit, Space toggles simulation play/pause, Left/Right arrows step
  // the timeline, and "n" adds a new state without needing the mouse (React
  // Flow's own Tab/arrow-key node focus + Delete already cover the rest of
  // keyboard-only graph editing). Ignored while typing in any input/textarea/select.
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

      // A keyboard-focused state (Tab to reach it) uses arrow keys to nudge
      // its position — that's React Flow's own default behavior and must win
      // over the simulation-step shortcut below, or keyboard-only graph
      // editing would silently break arrow-key repositioning during/after a run.
      const isFocusedOnNode = !!target?.closest('.react-flow__node');
      if (isFocusedOnNode && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (!isInteractive) return;
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

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
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
        return;
      }

      // Keyboard-only equivalent of double-clicking the canvas: adds a state
      // near the middle of the current view without requiring a mouse.
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!isInteractive) return;
        e.preventDefault();
        const jitter = () => (Math.random() - 0.5) * 80;
        const position = screenToFlowPosition({ x: window.innerWidth / 2 + jitter(), y: window.innerHeight / 2 + jitter() });
        addNode(position.x, position.y);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, selectedNode, selectedEdge, deleteNode, deleteEdge, undo, redo, isPlaying, currentStep, simulationEvents.length, stepForward, stepBackward, addNode, screenToFlowPosition, isInteractive]);

  // Find current simulation event for PDA/TM data
  const currentEvent = currentStep >= 0 ? simulationEvents[currentStep] : null;
  const initialTape = () => {
    const tape: Record<number, string> = {};
    for (let i = 0; i < inputString.length; i++) {
      tape[i] = inputString[i];
    }
    return tape;
  };
  const activeStack: string[] = currentEvent ? (currentEvent as any).stack || [] : ['Z'];
  const activeTape: Record<number, string> = currentEvent ? (currentEvent as any).tape || initialTape() : initialTape();
  const activeHeadIndex: number = currentEvent ? (currentEvent as any).headIndex || 0 : 0;
  const activeTapes: Record<number, string>[] = currentEvent ? (currentEvent as any).tapes || [initialTape()] : [initialTape()];
  const activeHeadIndices: number[] = currentEvent ? (currentEvent as any).headIndices || [0] : [0];

  return (
    <div className="flex h-screen w-screen bg-[var(--bg-primary)] text-[var(--text-main)] overflow-hidden font-sans">
      {/* Global Left Navigation Sidebar */}
      {!isPresentationMode && (
        <NavSidebar
          activeView={activeView}
          onNavigate={(view) => {
            if (activeView === 'graph') {
              persistence.saveCurrentToRecent();
            }
            stopSimulation();
            setActiveView(view);
          }}
          onOpenHelp={() => setIsHelpCenterOpen(true)}
          onOpenSettings={() => { setSettingsInitialTab('general'); setIsSettingsOpen(true); }}
          onNewSimulation={() => {
            stopSimulation();
            clearGraph();
            persistence.setCurrentProjectId(null);
            setActiveView('graph');
          }}
        />
      )}

      {/* Right Work Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar (only for Editor viewports) */}
        {activeView === 'graph' && (
          <EditorHeader
            isEditorView={activeView === 'graph'}
            automatonType={automatonType}
            persistence={persistence}
            stopSimulation={stopSimulation}
            setInputString={setInputString}
            selectedExampleIndex={selectedExampleIndex}
            setSelectedExampleIndex={setSelectedExampleIndex}
            isExportingGif={media.isExportingGif}
            onExportGif={media.exportSimulationToGIF}
            getFlowViewportEl={getFlowViewportEl}
            getNodes={getNodes}
            onSaveVersion={handleSaveVersion}
          />
        )}

        {/* Main Workspace Layout */}
        <div className="flex-1 flex relative overflow-hidden bg-[var(--bg-primary)]">
        {activeView === 'dashboard' ? (
          <Suspense fallback={viewLoadingFallback}>
          <DashboardView
            onNavigate={(view) => setActiveView(view)}
            recentProjects={persistence.recentProjects}
            continueProject={persistence.continueProject}
            onSelectProject={persistence.handleSelectRecentProject}
            onViewHistory={persistence.loadProjectsFromDB}
            onOpenMinimizer={handleOpenMinimizerFromDashboard}
            onOpenRegexToNfa={handleOpenRegexToNfaFromDashboard}
            lessonHistory={lessonHistory}
            onSelectLesson={handleSelectLesson}
          />
          </Suspense>
        ) : activeView === 'grammars' ? (
          <div className="w-full h-full flex flex-col">
            <div className="flex justify-end gap-1 px-4 pt-3 shrink-0 bg-[var(--bg-secondary)]">
              {(['cfg', 'unrestricted'] as const).map(model => (
                <button
                  key={model}
                  onClick={() => setGrammarModel(model)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase cursor-pointer border transition-all ${
                    grammarModel === model
                      ? 'bg-[var(--color-ui-accent)] text-[var(--bg-primary)] border-transparent'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] bg-transparent border-[var(--border-color)]'
                  }`}
                >
                  {model === 'cfg' ? 'Context-Free' : 'Unrestricted (Type-0)'}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              <Suspense fallback={viewLoadingFallback}>
                {grammarModel === 'cfg'
                  ? <GrammarEditor onLoadAutomaton={handleLoadAutomatonFromTool} initialRules={pendingGrammarLoad} />
                  : <UnrestrictedGrammarEditor />}
              </Suspense>
            </div>
          </div>
        ) : activeView === 'practice' ? (
          <Suspense fallback={viewLoadingFallback}>
            <PracticeHub
              profile={profile}
              exercises={exercisesHook}
              lessonPaths={lessonPathsHook}
              practice={practice}
              onStartExercise={handleStartExercise}
            />
          </Suspense>
        ) : activeView === 'library' ? (
          <Suspense fallback={viewLoadingFallback}>
            <ProjectLibrary library={library} profile={profile} onOpenProject={persistence.selectProjectFromDB} />
          </Suspense>
        ) : activeView === 'operations' ? (
          <Suspense fallback={viewLoadingFallback}>
            <MachineOperations library={library} onLoadAutomaton={handleLoadAutomatonFromTool} />
          </Suspense>
        ) : activeView === 'lessons' ? (
          <Suspense fallback={viewLoadingFallback}>
          <LessonBuilder
            history={lessonHistory}
            onSaveLesson={saveLessonToHistory}
            lessonToLoad={pendingLesson}
            onLessonConsumed={() => setPendingLesson(null)}
            onLoadDiagram={(diagram) => {
              stopSimulation();
              setAutomatonType(diagram.type as AutomatonType);
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
              persistence.setCurrentProjectId(null);
              loadGraph(loadedNodes, loadedEdges, loadedNodes.length);
              if (diagram.exampleInput) setInputString(diagram.exampleInput);
              setActiveView('graph');
            }}
          />
          </Suspense>
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
                snapToGrid={snapToGrid}
                snapGrid={[24, 24]}
                proOptions={{ hideAttribution: true }}
                fitView
              >
                <Background color="#1e293b" gap={24} size={1} />
                {!isPresentationMode && <Controls className="!bg-black/60 !border-white/10 !text-white" />}
                {!isPresentationMode && (
                  <MiniMap
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    nodeColor={() => theme === 'dark' ? '#3f3f46' : '#d4d4d8'}
                    maskColor={theme === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(243, 244, 246, 0.6)'}
                  />
                )}
              </ReactFlow>
              {nodes.length === 0 && !isPresentationMode && !showEditorOnboarding && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center max-w-xs px-6 py-5 rounded-xl border border-dashed border-white/15 bg-black/20">
                    <p className="text-sm font-semibold text-gray-300">Add your first state to get started</p>
                    <p className="mt-1.5 text-xs text-gray-500">Double-click anywhere on the canvas, or press <kbd className="px-1 py-0.5 rounded bg-white/10 border border-white/10 text-gray-300">N</kbd></p>
                  </div>
                </div>
              )}
              {!isPresentationMode && (
                <div className="absolute top-3 left-3 right-3 z-20 flex items-start gap-3 pointer-events-none">
                  <div className="pointer-events-auto shrink-0">
                    <LayoutTools snapToGrid={snapToGrid} setSnapToGrid={setSnapToGrid} />
                  </div>
                  <div className="flex-1 flex justify-center min-w-0 pointer-events-none">
                    <div className="pointer-events-auto">
                      <CanvasQuickActionBar onOpenConversionHub={() => setIsConversionHubOpen(true)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Practice mode overlay — floats over the canvas so EditorSidebar
                  (node/edge property editing) stays visible and usable. */}
              {!isPresentationMode && practice.activeExercise && GRAPH_BASED_EXERCISE_TYPES.has(practice.activeExercise.automaton_type) && (
                <PracticePanel
                  practice={practice}
                  getGraphSubmission={() => {
                    const automaton = toAutomaton(nodes, edges, automatonType);
                    return { nodes: automaton.nodes, edges: automaton.edges };
                  }}
                  onExit={practice.clearExercise}
                />
              )}

              {/* Floating Turing Machine Tape Visualizer inside the canvas */}
              {automatonType === 'TM' && simulationEvents.length > 0 && (
                <div className="absolute bottom-4 left-4 right-4 z-20 max-w-4xl mx-auto">
                  {tapeCount > 1
                    ? <MultiTapeVisualizer tapes={activeTapes} headIndices={activeHeadIndices} blankSymbol={blankSymbol} />
                    : <TapeVisualizer tape={activeTape} headIndex={activeHeadIndex} blankSymbol={blankSymbol} />}
                </div>
              )}
              {automatonType === 'TM' && simulationEvents.length > 0 && <TapeHistory events={simulationEvents} currentStep={currentStep} automatonType={automatonType} blankSymbol={blankSymbol} onSelect={playback.jumpToEvent} />}
            </div>

            {/* PDA Stack Visualizer Column next to canvas */}
            {automatonType === 'PDA' && simulationEvents.length > 0 && (
              <div className="w-72 border-l border-white/10 glass-panel p-4 h-full overflow-y-auto custom-scrollbar">
                <PdaBranches
                  getAutomatonData={playback.getAutomatonData}
                  inputString={inputString}
                  stackSymbol={playback.stackSymbol}
                  acceptanceMode={playback.acceptanceMode}
                  simulationEvents={simulationEvents}
                  automatonType={automatonType}
                />
                <StackVisualizer stack={activeStack} />
              </div>
            )}

            {/* Right Sidebar Panel */}
            {!isPresentationMode && (
              transformations.transform ? (
                <TransformationPanel transformations={transformations} getAutomatonData={getAutomatonData} />
              ) : (
                <EditorSidebar
                  automatonType={automatonType}
                  playback={playback}
                  transformations={transformations}
                  grading={grading}
                  selectedNode={selectedNode}
                  selectedEdge={selectedEdge}
                  onDeleteSelectedNode={() => { if (selectedNode) { deleteNode(selectedNode.id); setSelectedNode(null); } }}
                  onDeleteSelectedEdge={() => { if (selectedEdge) { deleteEdge(selectedEdge.id); setSelectedEdge(null); } }}
                  regexInputRef={regexInputRef}
                  onOpenConversionHub={() => setIsConversionHubOpen(true)}
                />
              )
            )}
          </>
        )}
      </div>

      {/* Bottom Simulation Control Panel */}
      <PlaybackBar
        playback={playback}
        automatonType={automatonType}
        isRecording={media.isRecording}
        isExportingGif={media.isExportingGif}
        onStartRecording={media.startRecording}
        onStopRecording={media.stopRecording}
        onExportGif={media.exportSimulationToGIF}
      />

      <TutorPanel
        automatonType={automatonType}
        inputString={inputString}
        getAutomatonData={getAutomatonData}
        isPlaybackBarVisible={simulationEvents.length > 0}
      />

      <ProjectsModal
        isOpen={persistence.isProjectsListOpen}
        onClose={() => persistence.setIsProjectsListOpen(false)}
        saveName={persistence.saveName}
        onSaveNameChange={persistence.setSaveName}
        onSave={persistence.saveProjectToDB}
        projects={persistence.dbProjects}
        onSelectProject={persistence.selectProjectFromDB}
        onRefresh={persistence.loadProjectsFromDB}
      />

      {isPresentationMode && (
        <button
          onClick={() => setIsPresentationMode(false)}
          className="fixed top-4 right-4 z-50 px-4 py-2 bg-black/90 hover:bg-black border border-[#00e5a3]/30 rounded-lg text-xs font-black text-[#00e5a3] hover:text-white cursor-pointer shadow-glow-green"
        >
          Exit Presentation Mode
        </button>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsInitialTab}
        theme={theme}
        onChangeTheme={setTheme}
        onCheckForUpdates={autoUpdater.checkForUpdates}
      />

      <AutoUpdaterModal
        isOpen={autoUpdater.isOpen}
        onClose={() => autoUpdater.setIsOpen(false)}
        update={autoUpdater.update}
        status={autoUpdater.status}
        errorMessage={autoUpdater.errorMessage}
        progress={autoUpdater.progress}
        onCheckForUpdates={autoUpdater.checkForUpdates}
        onDownloadAndInstall={autoUpdater.downloadAndInstall}
        onRelaunch={autoUpdater.relaunchApp}
        currentVersion={autoUpdater.currentVersion}
      />

      <EditorOnboarding
        isOpen={showEditorOnboarding}
        onClose={dismissEditorOnboarding}
      />

      <ConversionHubModal
        isOpen={isConversionHubOpen}
        onClose={() => setIsConversionHubOpen(false)}
        onLoadToGrammarEditor={handleLoadGrammarFromHub}
      />

      <HelpCenterModal
        isOpen={isHelpCenterOpen}
        onClose={() => setIsHelpCenterOpen(false)}
        onReplayOnboarding={() => {
          setIsHelpCenterOpen(false);
          setActiveView('graph');
          setShowEditorOnboarding(true);
        }}
        onOpenShortcuts={() => {
          setIsHelpCenterOpen(false);
          setSettingsInitialTab('shortcuts');
          setIsSettingsOpen(true);
        }}
      />

      <GradingReportModal
        result={grading.gradingResult}
        onClose={() => grading.setGradingResult(null)}
      />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ReactFlowProvider>
          <Editor />
        </ReactFlowProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
