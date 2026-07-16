import { simulateDFA, simulateMealy, simulateMoore, simulateNFA, simulatePDA, simulateTuringMachine } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';
import type { AutomatonType } from './flowAutomaton';

export type BatchRow =
  | { input: string; kind: 'accept-reject'; accepted: boolean }
  | { input: string; kind: 'transducer'; output: string };

/** Runs a list of input strings through the current automaton, dispatching by type. Used by batch mode. */
export const runBatch = (automaton: Automaton, type: AutomatonType, inputs: string[]): BatchRow[] =>
  inputs.map(input => {
    try {
      switch (type) {
        case 'DFA':
          return { input, kind: 'accept-reject', accepted: simulateDFA(automaton, input).accepted };
        case 'NFA':
          return { input, kind: 'accept-reject', accepted: simulateNFA(automaton, input).accepted };
        case 'PDA':
          return { input, kind: 'accept-reject', accepted: simulatePDA(automaton, input).accepted };
        case 'TM':
          return { input, kind: 'accept-reject', accepted: simulateTuringMachine(automaton, input).accepted };
        case 'Mealy':
          return { input, kind: 'transducer', output: simulateMealy(automaton, input).outputString };
        case 'Moore':
          return { input, kind: 'transducer', output: simulateMoore(automaton, input).outputString };
      }
    } catch {
      return { input, kind: 'accept-reject', accepted: false };
    }
  });

/** Enumerates every string over `alphabet` up to `maxLength`, capped so the UI never has to render an unbounded table. */
export const generateLanguageSamples = (alphabet: string[], maxLength: number, cap = 1000): string[] => {
  const strings: string[] = [''];
  let previous = [''];
  for (let length = 1; length <= maxLength && strings.length < cap; length++) {
    const next: string[] = [];
    outer: for (const prefix of previous) {
      for (const c of alphabet) {
        next.push(prefix + c);
        if (strings.length + next.length >= cap) break outer;
      }
    }
    strings.push(...next);
    previous = next;
  }
  return strings.slice(0, cap);
};

export const batchRowsToCsv = (rows: BatchRow[]): string => {
  const header = 'input,result';
  const lines = rows.map(row => {
    const input = `"${row.input.replace(/"/g, '""')}"`;
    const result = row.kind === 'accept-reject' ? (row.accepted ? 'accept' : 'reject') : row.output;
    return `${input},"${result.replace(/"/g, '""')}"`;
  });
  return [header, ...lines].join('\n');
};

export const downloadText = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
