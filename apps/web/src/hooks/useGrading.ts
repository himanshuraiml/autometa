import { useState } from 'react';
import type { Automaton } from '@autometa/simulation-engine';
import { useGraphStore } from '../store/useGraphStore';
import { ApiError, gradeAutomaton } from '../utils/apiClient';
import { buildGradingSimulation } from '../utils/gradingSimulation';
import { getLLMConfig } from '../utils/llmConfig';
import type { AutomatonType } from '../utils/flowAutomaton';
import { useToast } from '../components/ToastProvider';

interface UseGradingArgs {
  automatonType: AutomatonType;
  getAutomatonData: () => Automaton;
}

/** AI grading of the canvas against a target-language description. */
export function useGrading({ automatonType, getAutomatonData }: UseGradingArgs) {
  const { nodes, edges } = useGraphStore();
  const { showToast } = useToast();

  const [targetDescription, setTargetDescription] = useState('');
  const [isGradingLoading, setIsGradingLoading] = useState(false);
  const [gradingResult, setGradingResult] = useState<string | null>(null);

  const handleAIGrade = async () => {
    setIsGradingLoading(true);
    setGradingResult(null);
    try {
      const llmConfig = getLLMConfig();

      // Acceptance testing runs locally in the simulation engine; the backend
      // only turns these results into tutoring feedback.
      const { alphabet, simulation_runs } = buildGradingSimulation(getAutomatonData(), automatonType);

      const data = await gradeAutomaton({
        description: targetDescription,
        automaton_type: automatonType,
        nodes: nodes.map(n => ({ id: n.id, label: (n.data?.label as string) || n.id, isStart: !!n.data?.isStart, isAccept: !!n.data?.isAccept })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: (e.data?.label as string) || '' })),
        alphabet,
        simulation_runs,
        provider: llmConfig.provider,
        api_key: llmConfig.api_key,
        model: llmConfig.model,
        base_url: llmConfig.base_url
      });
      setGradingResult(data.response || "No grading feedback returned.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error reaching the AI grading server.", 'error');
    } finally {
      setIsGradingLoading(false);
    }
  };

  return {
    targetDescription, setTargetDescription,
    isGradingLoading,
    gradingResult, setGradingResult,
    handleAIGrade,
  };
}

export type Grading = ReturnType<typeof useGrading>;
