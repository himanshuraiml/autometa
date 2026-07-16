import type { Automaton } from '@autometa/simulation-engine';
import { simulateDFA } from '@autometa/simulation-engine';

/**
 * Pumping Lemma for Regular Languages (DFA version)
 *
 * Given a DFA and a word w it accepts with |w| >= p (p = number of states),
 * simulates the run and applies the pigeonhole principle over the first p+1
 * states visited: since there are only p distinct states, some state must
 * repeat within the first p symbols read. That repeat yields a decomposition
 * w = xyz with |xy| <= p and |y| >= 1, where the DFA is guaranteed to also
 * accept xy^k z for every k >= 0 (the "pumped" strings).
 */
export interface PumpingDecomposition {
  p: number;
  word: string;
  statePath: string[];
  repeatIndexI: number;
  repeatIndexJ: number;
  x: string;
  y: string;
  z: string;
}

export const computePumpingDecomposition = (dfa: Automaton, word: string): PumpingDecomposition => {
  const p = dfa.nodes.length;
  if (p === 0) throw new Error('This DFA has no states.');
  if (!dfa.nodes.some((n) => n.isStart)) throw new Error('This DFA has no start state.');
  if (word.length < p) {
    throw new Error(`Pick a string of length at least p = ${p} (this DFA has ${p} states) for the Pumping Lemma to apply.`);
  }

  const result = simulateDFA(dfa, word);
  if (!result.accepted) {
    throw new Error(
      `"${word}" is not accepted by this DFA. Pick an accepted string of length ≥ ${p} so the Pumping Lemma guarantees pumped copies stay in the language.`
    );
  }

  const statePath = result.events
    .filter((e) => e.event === 'enter_state')
    .map((e) => e.stateId!);

  const seen = new Map<string, number>();
  let repeatI = -1;
  let repeatJ = -1;
  for (let idx = 0; idx <= p && idx < statePath.length; idx++) {
    const st = statePath[idx];
    if (seen.has(st)) {
      repeatI = seen.get(st)!;
      repeatJ = idx;
      break;
    }
    seen.set(st, idx);
  }
  if (repeatI === -1) {
    throw new Error('Could not find a repeated state in the first p symbols (unexpected for a DFA with p states).');
  }

  return {
    p,
    word,
    statePath,
    repeatIndexI: repeatI,
    repeatIndexJ: repeatJ,
    x: word.slice(0, repeatI),
    y: word.slice(repeatI, repeatJ),
    z: word.slice(repeatJ),
  };
};

export const pumpString = (decomposition: PumpingDecomposition, k: number): string =>
  decomposition.x + decomposition.y.repeat(Math.max(0, k)) + decomposition.z;

