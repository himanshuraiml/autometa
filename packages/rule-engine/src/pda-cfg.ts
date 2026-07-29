import type { Automaton } from '@autometa/simulation-engine';
import { isEpsilon } from '@autometa/simulation-engine';
import type { CFGRules } from './cfg';

/** Structured fields behind a single `input, pop -> push` PDA transition string. */
export interface PdaTransitionParts { read: string; pop: string; push: string; }

/** Parses one already-split PDA transition (e.g. from an edge label) into its fields. */
export const parsePdaTransitionParts = (text: string): PdaTransitionParts => {
  const match = text.match(/^\s*([^,]*?)\s*,\s*([^,]*?)\s*->\s*(.*?)\s*$/);
  return match ? { read: match[1], pop: match[2], push: match[3] } : { read: '', pop: '', push: '' };
};

/**
 * Converts a Pushdown Automaton (PDA) to a Context-Free Grammar (CFG)
 * using the standard Triple Construction algorithm:
 * Variables are of the form [p, A, q] representing starting in state p with stack top A
 * and ending in state q with stack top A popped.
 */
export const pdaToCFG = (pda: Automaton, initialStackSymbol: string = 'Z'): CFGRules => {
  const nodes = pda.nodes;
  const stateIds = nodes.map(n => n.id);
  const startNode = nodes.find(n => n.isStart) || nodes[0];
  if (!startNode) return { S: ['ε'] };

  const rules: CFGRules = {};
  const addProduction = (variable: string, rhs: string) => {
    if (!rules[variable]) rules[variable] = [];
    if (!rules[variable].includes(rhs)) {
      rules[variable].push(rhs);
    }
  };

  // 1. Collect all stack symbols from transition edges
  const stackSymbols = new Set<string>([initialStackSymbol]);
  const parsedTransitions: Array<{
    source: string;
    target: string;
    read: string;
    pop: string;
    pushSymbols: string[];
  }> = [];

  pda.edges.forEach(edge => {
    edge.symbols.forEach(symString => {
      const parts = parsePdaTransitionParts(symString);
      const read = parts.read.trim() || 'ε';
      const pop = parts.pop.trim() || 'ε';
      const push = parts.push.trim() || 'ε';

      if (pop !== 'ε') stackSymbols.add(pop);
      if (push !== 'ε') {
        push.split(/\s+/).forEach(s => {
          if (s && s !== 'ε') stackSymbols.add(s);
        });
      }

      const pushSymbols = push === 'ε' ? [] : push.split(/\s+/).filter(Boolean);

      parsedTransitions.push({
        source: edge.source,
        target: edge.target,
        read,
        pop,
        pushSymbols
      });
    });
  });

  const encodeVar = (p: string, A: string, q: string) => `[${p},${A},${q}]`;

  // 2. Start symbol productions: S -> [q0, Z0, q] for all q in Q
  stateIds.forEach(q => {
    addProduction('S', encodeVar(startNode.id, initialStackSymbol, q));
  });

  // 3. For each transition from state p to state r reading 'a', popping 'X', pushing 'Y1...Yk':
  parsedTransitions.forEach(({ source: p, target: r, read, pop: X, pushSymbols }) => {
    const aStr = isEpsilon(read) ? '' : read;

    if (pushSymbols.length === 0) {
      // Pop only: [p, X, r] -> a
      addProduction(encodeVar(p, X, r), aStr || 'ε');
    } else if (pushSymbols.length === 1) {
      // Pushing Y1: for all q in Q, [p, X, q] -> a [r, Y1, q]
      const Y1 = pushSymbols[0];
      stateIds.forEach(q => {
        const lhs = encodeVar(p, X, q);
        const rhs = (aStr ? aStr + ' ' : '') + encodeVar(r, Y1, q);
        addProduction(lhs, rhs);
      });
    } else if (pushSymbols.length === 2) {
      // Pushing Y1 Y2: for all q, q1 in Q, [p, X, q] -> a [r, Y1, q1] [q1, Y2, q]
      const Y1 = pushSymbols[0];
      const Y2 = pushSymbols[1];
      stateIds.forEach(q => {
        stateIds.forEach(q1 => {
          const lhs = encodeVar(p, X, q);
          const rhs = (aStr ? aStr + ' ' : '') + `${encodeVar(r, Y1, q1)} ${encodeVar(q1, Y2, q)}`;
          addProduction(lhs, rhs);
        });
      });
    } else {
      // Pushing k symbols: Y1...Yk
      const k = pushSymbols.length;
      const generateStateTuples = (depth: number, currentTuple: string[]): string[][] => {
        if (depth === k - 1) return [currentTuple];
        const res: string[][] = [];
        stateIds.forEach(s => {
          res.push(...generateStateTuples(depth + 1, [...currentTuple, s]));
        });
        return res;
      };

      const intermediateTuples = generateStateTuples(0, []);
      stateIds.forEach(qk => {
        intermediateTuples.forEach(states => {
          // states = [q1, q2, ..., q_{k-1}]
          const allStates = [r, ...states, qk];
          const vars: string[] = [];
          for (let i = 0; i < k; i++) {
            vars.push(encodeVar(allStates[i], pushSymbols[i], allStates[i + 1]));
          }
          const lhs = encodeVar(p, X, qk);
          const rhs = (aStr ? aStr + ' ' : '') + vars.join(' ');
          addProduction(lhs, rhs);
        });
      });
    }
  });

  return rules;
};
