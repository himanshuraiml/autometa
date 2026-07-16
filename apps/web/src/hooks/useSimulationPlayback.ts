import { useEffect, useRef, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  simulateDFA, simulateNFA, simulateMealy, simulateMoore, simulatePDA, simulateTuringMachine, simulateMultiTapeTuringMachine
} from '@autometa/simulation-engine';
import type { SimulationEvent, PdaAcceptanceMode } from '@autometa/simulation-engine';
import { generateTimeline } from '@autometa/timeline-engine';
import type { AnimationTimeline } from '@autometa/timeline-engine';
import { calculateRenderState } from '@autometa/animation-engine';
import type { RenderState } from '@autometa/animation-engine';
import { useGraphStore } from '../store/useGraphStore';
import { toAutomaton } from '../utils/flowAutomaton';
import type { AutomatonType } from '../utils/flowAutomaton';

export interface SimulationRunResult {
  accepted: boolean;
  events: SimulationEvent[];
  outputString?: string;
}

/** Push an animation-engine render state into the canvas nodes/edges. */
export const updateVisualStates = (renderState: RenderState) => {
  useGraphStore.setState((state) => ({
    nodes: state.nodes.map(n => {
      const visual = renderState.nodes[n.id];
      return {
        ...n,
        data: {
          ...n.data,
          glow: visual ? visual.glow : 0,
          scale: visual ? visual.scale : 1,
        }
      };
    }),
    edges: state.edges.map(e => {
      const visual = renderState.edges[e.id];
      return {
        ...e,
        data: {
          ...e.data,
          isActive: visual ? visual.active : false,
          traversalProgress: visual ? visual.traversalProgress : undefined,
        }
      };
    }),
  }));
};

interface UseSimulationPlaybackArgs {
  automatonType: AutomatonType;
  /** Called when a fresh run starts (used to record the workspace as "recent"). */
  onRunStarted?: () => void;
}

/**
 * Owns the whole simulate → timeline → animate pipeline: running the current
 * automaton, the requestAnimationFrame playhead loop, step navigation, and
 * restoring the canvas when a run stops.
 */
export function useSimulationPlayback({ automatonType, onRunStarted }: UseSimulationPlaybackArgs) {
  const { nodes, edges, nodeCounter, loadGraph, tapeCount } = useGraphStore();

  const [inputString, setInputString] = useState('abb');
  const [blankSymbol, setBlankSymbol] = useState('_');
  const [stackSymbol, setStackSymbol] = useState('Z');
  const [acceptanceMode, setAcceptanceMode] = useState<PdaAcceptanceMode>('final-state');
  const [simulationEvents, setSimulationEvents] = useState<SimulationEvent[]>([]);
  const [timeline, setTimeline] = useState<AnimationTimeline | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [currentStep, setCurrentStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // ms per step (smaller is faster)
  const [simulationResult, setSimulationResult] = useState<{ accepted: boolean; outputString?: string } | null>(null);

  // Canvas content to restore after a run's visual highlighting is discarded.
  const originalNodes = useRef<Node[]>([]);
  const originalEdges = useRef<Edge[]>([]);
  const lastTime = useRef<number | null>(null);
  const animationFrameId = useRef<number | null>(null);

  const getAutomatonData = () => toAutomaton(nodes, edges, automatonType, tapeCount);

  // Runs the current automaton against inputString without touching any component
  // state, so it can be reused by both startSimulation and offline exports (GIF).
  const runInput = (input: string): SimulationRunResult => {
    const automaton = getAutomatonData();
    if (automatonType === 'DFA') return simulateDFA(automaton, input);
    if (automatonType === 'NFA') return simulateNFA(automaton, input);
    if (automatonType === 'Mealy') {
      const mealyRes = simulateMealy(automaton, input);
      return { accepted: true, events: mealyRes.events, outputString: mealyRes.outputString };
    }
    if (automatonType === 'Moore') {
      const mooreRes = simulateMoore(automaton, input);
      return { accepted: true, events: mooreRes.events, outputString: mooreRes.outputString };
    }
    if (automatonType === 'PDA') return simulatePDA(automaton, input, stackSymbol || 'Z', acceptanceMode);
    if (tapeCount > 1) return simulateMultiTapeTuringMachine(automaton, input, tapeCount, blankSymbol || '_');
    return simulateTuringMachine(automaton, input, blankSymbol || '_');
  };
  const buildSimulationResult = (): SimulationRunResult => runInput(inputString);

  const stopSimulation = () => {
    setIsPlaying(false);
    lastTime.current = null;
    if (animationFrameId.current !== null) {
      cancelAnimationFrame(animationFrameId.current);
    }
    if (originalNodes.current.length > 0) {
      loadGraph(originalNodes.current, originalEdges.current, nodeCounter, { preserveHistory: true });
      originalNodes.current = [];
      originalEdges.current = [];
    }
    setSimulationEvents([]);
    setTimeline(null);
    setPlayhead(0);
    setSimulationResult(null);
    setCurrentStep(-1);
  };

  const startSimulation = () => {
    stopSimulation(); // Reset any active simulation
    originalNodes.current = JSON.parse(JSON.stringify(nodes));
    originalEdges.current = JSON.parse(JSON.stringify(edges));

    const result = buildSimulationResult();

    setSimulationEvents(result.events);
    setSimulationResult({
      accepted: result.accepted,
      outputString: result.outputString
    });

    // Generate timeline (800ms base step duration)
    const generatedTimeline = generateTimeline(result.events, 800);
    setTimeline(generatedTimeline);
    setPlayhead(0);

    const renderState = calculateRenderState(generatedTimeline, 0);
    updateVisualStates(renderState);
    setCurrentStep(renderState.symbolIndex);
    onRunStarted?.();
  };

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

  const jumpToEvent = (eventIndex: number) => {
    if (!timeline) return;
    const frame = timeline.keyframes[eventIndex];
    if (frame) { setIsPlaying(false); setPlayhead(frame.startTime); }
  };

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

  return {
    inputString, setInputString,
    blankSymbol, setBlankSymbol,
    stackSymbol, setStackSymbol,
    acceptanceMode, setAcceptanceMode,
    simulationEvents, setSimulationEvents,
    timeline, setTimeline,
    playhead, setPlayhead,
    currentStep,
    isPlaying, setIsPlaying,
    playbackSpeed, setPlaybackSpeed,
    simulationResult, setSimulationResult,
    getAutomatonData,
    runInput,
    buildSimulationResult,
    startSimulation,
    stopSimulation,
    stepForward,
    stepBackward,
    jumpToEvent,
  };
}

export type SimulationPlayback = ReturnType<typeof useSimulationPlayback>;
