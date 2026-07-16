import { isEpsilon, simulateDFA, simulateNFA } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';

// The backend caps simulation_runs at 1000 entries; with test strings up to
// length 3 that means at most 9 alphabet symbols (1 + 9 + 81 + 729 = 820).
const MAX_ALPHABET = 9;
const MAX_TEST_LENGTH = 3;

const extractAlphabet = (automaton: Automaton): string[] => {
  const chars = new Set<string>();
  for (const edge of automaton.edges) {
    for (const symbol of edge.symbols) {
      const part = symbol.trim();
      if (!part || isEpsilon(part)) continue;
      for (const char of part) chars.add(char);
    }
  }
  return Array.from(chars).sort().slice(0, MAX_ALPHABET);
};

const buildTestStrings = (alphabet: string[]): string[] => {
  const strings: string[] = [''];
  let previous = [''];
  for (let length = 1; length <= MAX_TEST_LENGTH; length++) {
    const next: string[] = [];
    for (const prefix of previous) {
      for (const char of alphabet) {
        next.push(prefix + char);
      }
    }
    strings.push(...next);
    previous = next;
  }
  return strings;
};

export interface GradingSimulation {
  alphabet: string[];
  simulation_runs: { input: string; accepted: boolean }[];
}

/**
 * Runs the grading test suite locally with @autometa/simulation-engine — the
 * single source of truth for automaton semantics — so the backend never has to
 * reimplement acceptance logic. Only DFA/NFA are exhaustively testable this
 * way; other machine types return no runs and the grader falls back to purely
 * structural feedback.
 */
export const buildGradingSimulation = (
  automaton: Automaton,
  automatonType: string,
): GradingSimulation => {
  if (automatonType !== 'DFA' && automatonType !== 'NFA') {
    return { alphabet: [], simulation_runs: [] };
  }

  const alphabet = extractAlphabet(automaton);
  if (alphabet.length === 0) {
    return { alphabet: [], simulation_runs: [] };
  }

  const simulate = automatonType === 'DFA' ? simulateDFA : simulateNFA;
  const simulation_runs = buildTestStrings(alphabet).map((input) => {
    try {
      return { input, accepted: simulate(automaton, input).accepted };
    } catch {
      return { input, accepted: false };
    }
  });

  return { alphabet, simulation_runs };
};
