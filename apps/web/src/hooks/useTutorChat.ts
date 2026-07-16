import { useState } from 'react';
import { minimizeDFA, nfaToDfa } from '@autometa/rule-engine';
import type { Automaton } from '@autometa/simulation-engine';
import { useGraphStore } from '../store/useGraphStore';
import { ApiError, chatWithTutor } from '../utils/apiClient';
import { getLLMConfig } from '../utils/llmConfig';
import type { AutomatonType } from '../utils/flowAutomaton';

export type TutorMode = 'Beginner' | 'Intermediate' | 'Advanced' | 'Professor';

export interface TutorMessage {
  sender: 'user' | 'tutor';
  text: string;
}

interface UseTutorChatArgs {
  automatonType: AutomatonType;
  inputString: string;
  getAutomatonData: () => Automaton;
}

/**
 * AI tutor conversation state. Questions that mention a deterministic
 * algorithm (minimization, subset construction) are answered by the rule
 * engine first and the result is passed to the LLM as ground truth.
 */
export function useTutorChat({ automatonType, inputString, getAutomatonData }: UseTutorChatArgs) {
  const { nodes, edges } = useGraphStore();

  const [tutorMessages, setTutorMessages] = useState<TutorMessage[]>([
    { sender: 'tutor', text: "Hello! I am your AI Computer Science Tutor. Ask me any questions about formal languages, automata, or your current graph!" }
  ]);
  const [tutorInput, setTutorInput] = useState('');
  const [tutorMode, setTutorMode] = useState<TutorMode>('Intermediate');
  const [isTutorLoading, setIsTutorLoading] = useState(false);
  const [isTutorOpen, setIsTutorOpen] = useState(false);

  const askTutor = async (questionText?: string) => {
    const textToSend = questionText || tutorInput;
    if (!textToSend.trim()) return;

    const newMessages = [...tutorMessages, { sender: 'user' as const, text: textToSend }];
    setTutorMessages(newMessages);
    setTutorInput('');
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
    } catch {
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
      const llmConfig = getLLMConfig();
      const data = await chatWithTutor({
        prompt: textToSend,
        mode: tutorMode,
        context: automatonContext,
        provider: llmConfig.provider,
        api_key: llmConfig.api_key,
        model: llmConfig.model,
        base_url: llmConfig.base_url
      });
      setTutorMessages(prev => [...prev, { sender: 'tutor' as const, text: data.response }]);
    } catch (err) {
      const text = err instanceof ApiError
        ? `Error: ${err.message}`
        : "Error: Could not reach the local AI Tutor backend.";
      setTutorMessages(prev => [...prev, { sender: 'tutor' as const, text }]);
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

  return {
    tutorMessages,
    tutorInput, setTutorInput,
    tutorMode, setTutorMode,
    isTutorLoading,
    isTutorOpen, setIsTutorOpen,
    askTutor,
    getSuggestedTutorPrompts,
  };
}
