import type { Automaton, AutomatonNode, AutomatonEdge } from '@autometa/simulation-engine';
import { getEpsilonClosure, isEpsilon } from '@autometa/simulation-engine';

export interface EquivalenceResult {
  equivalent: boolean;
  /** Shortest string accepted by exactly one machine; empty string is represented by ''. */
  counterexample?: string;
}

/**
 * Compares two DFA/NFA/ε-NFA machines by BFS over their product subsets.
 * Missing transitions naturally lead to the empty subset, so incomplete DFAs
 * are compared with the same language semantics as the simulator.
 */
export const findLanguageCounterexample = (left: Automaton, right: Automaton): EquivalenceResult => {
  const startLeft = left.nodes.find(node => node.isStart);
  const startRight = right.nodes.find(node => node.isStart);
  if (!startLeft || !startRight) throw new Error('Both machines need a start state.');

  const alphabet = [...new Set([...left.edges, ...right.edges].flatMap(edge => edge.symbols).filter(symbol => !isEpsilon(symbol)))].sort();
  const advance = (machine: Automaton, states: Set<string>, symbol: string) => {
    const next = new Set<string>();
    for (const state of states) for (const edge of machine.edges) if (edge.source === state && edge.symbols.includes(symbol)) next.add(edge.target);
    return getEpsilonClosure(machine, next);
  };
  const accepts = (machine: Automaton, states: Set<string>) => [...states].some(id => machine.nodes.find(node => node.id === id)?.isAccept);
  const key = (states: Set<string>) => [...states].sort().join(',') || '∅';
  const leftStart = getEpsilonClosure(left, [startLeft.id]);
  const rightStart = getEpsilonClosure(right, [startRight.id]);
  const queue: Array<{ left: Set<string>; right: Set<string>; word: string }> = [{ left: leftStart, right: rightStart, word: '' }];
  const visited = new Set([`${key(leftStart)}|${key(rightStart)}`]);

  while (queue.length) {
    const current = queue.shift()!;
    if (accepts(left, current.left) !== accepts(right, current.right)) return { equivalent: false, counterexample: current.word };
    for (const symbol of alphabet) {
      const nextLeft = advance(left, current.left, symbol);
      const nextRight = advance(right, current.right, symbol);
      const pairKey = `${key(nextLeft)}|${key(nextRight)}`;
      if (!visited.has(pairKey)) {
        visited.add(pairKey);
        queue.push({ left: nextLeft, right: nextRight, word: current.word + symbol });
      }
    }
  }
  return { equivalent: true };
};

export type DfaLanguageOperation = 'union' | 'intersection' | 'difference';

type TotalDfaState = string | null;

const dfaAlphabet = (automaton: Automaton) => [...new Set(automaton.edges.flatMap(edge => edge.symbols).filter(symbol => !isEpsilon(symbol)))].sort();
const dfaStep = (automaton: Automaton, state: TotalDfaState, symbol: string): TotalDfaState => {
  if (state === null) return null;
  return automaton.edges.find(edge => edge.source === state && edge.symbols.includes(symbol))?.target ?? null;
};
const dfaAccepts = (automaton: Automaton, state: TotalDfaState) => state !== null && !!automaton.nodes.find(node => node.id === state)?.isAccept;

/** One product-state row of the union/intersection/difference construction walkthrough. */
export interface CombineDfaRow {
  stateId: string;
  label: string;
  leftLabel: string;
  rightLabel: string;
  isAccept: boolean;
  transitions: Record<string, string>;
}

export interface CombineDfaWalkthrough {
  operation: DfaLanguageOperation;
  alphabet: string[];
  rows: CombineDfaRow[];
  finalDfa: Automaton;
}

/**
 * Product construction for union/intersection/difference with a per-pair
 * trace, for the editor's language-operations walkthrough. `combineDFA` is
 * the plain-result variant of the same algorithm.
 */
export const combineDFASteps = (left: Automaton, right: Automaton, operation: DfaLanguageOperation): CombineDfaWalkthrough => {
  const leftStart = left.nodes.find(node => node.isStart);
  const rightStart = right.nodes.find(node => node.isStart);
  if (!leftStart || !rightStart) throw new Error('Both DFAs need a start state.');
  const alphabet = [...new Set([...dfaAlphabet(left), ...dfaAlphabet(right)])].sort();
  const encode = (a: TotalDfaState, b: TotalDfaState) => `${a ?? '∅'}|${b ?? '∅'}`;
  const label = (a: TotalDfaState, b: TotalDfaState) => `⟨${a ?? '∅'}, ${b ?? '∅'}⟩`;
  const stateLabel = (automaton: Automaton, state: TotalDfaState) => state === null ? '∅' : (automaton.nodes.find(node => node.id === state)?.label || state);
  const accepts = (a: TotalDfaState, b: TotalDfaState) => operation === 'union' ? dfaAccepts(left, a) || dfaAccepts(right, b) : operation === 'intersection' ? dfaAccepts(left, a) && dfaAccepts(right, b) : dfaAccepts(left, a) && !dfaAccepts(right, b);
  const start: [TotalDfaState, TotalDfaState] = [leftStart.id, rightStart.id];
  const queue: Array<[TotalDfaState, TotalDfaState]> = [start];
  const ids = new Map([[encode(...start), 'p0']]);
  const rows: CombineDfaRow[] = [];
  const nodes: AutomatonNode[] = [];
  const edges: AutomatonEdge[] = [];
  while (queue.length) {
    const [a, b] = queue.shift()!;
    const source = ids.get(encode(a, b))!;
    nodes.push({ id: source, label: label(a, b), isStart: source === 'p0', isAccept: accepts(a, b) });
    const transitions: Record<string, string> = {};
    for (const symbol of alphabet) {
      const next: [TotalDfaState, TotalDfaState] = [dfaStep(left, a, symbol), dfaStep(right, b, symbol)];
      const key = encode(...next);
      if (!ids.has(key)) { ids.set(key, `p${ids.size}`); queue.push(next); }
      const target = ids.get(key)!;
      edges.push({ id: `e-${source}-${target}-${symbol}`, source, target, symbols: [symbol] });
      transitions[symbol] = target;
    }
    rows.push({ stateId: source, label: label(a, b), leftLabel: stateLabel(left, a), rightLabel: stateLabel(right, b), isAccept: accepts(a, b), transitions });
  }
  return { operation, alphabet, rows, finalDfa: { nodes, edges } };
};

/** Creates a complete product DFA for union, intersection, or left-minus-right. */
export const combineDFA = (left: Automaton, right: Automaton, operation: DfaLanguageOperation): Automaton =>
  combineDFASteps(left, right, operation).finalDfa;

/** Complements a DFA after totalizing missing transitions with an implicit sink state. */
export const complementDFA = (dfa: Automaton): Automaton => {
  const start = dfa.nodes.find(node => node.isStart);
  if (!start) throw new Error('DFA needs a start state.');
  const alphabet = dfaAlphabet(dfa);
  const states: TotalDfaState[] = [...dfa.nodes.map(node => node.id), null];
  const nodes = states.map(state => ({ id: state ?? 'sink', label: state ? (dfa.nodes.find(node => node.id === state)?.label || state) : 'sink', isStart: state === start.id, isAccept: !dfaAccepts(dfa, state) }));
  const edges = states.flatMap(state => alphabet.map(symbol => ({ id: `e-${state ?? 'sink'}-${symbol}`, source: state ?? 'sink', target: dfaStep(dfa, state, symbol) ?? 'sink', symbols: [symbol] })));
  return { nodes, edges };
};

/** Copies an automaton's nodes/edges with every id prefixed, so two machines can be merged without id collisions. */
const namespaceAutomaton = (automaton: Automaton, prefix: string): Automaton => ({
  nodes: automaton.nodes.map(node => ({ ...node, id: `${prefix}${node.id}` })),
  edges: automaton.edges.map(edge => ({ ...edge, id: `${prefix}${edge.id}`, source: `${prefix}${edge.source}`, target: `${prefix}${edge.target}` })),
});

/**
 * NFA concatenation (Thompson-style): epsilon-bridges every accept state of
 * `left` to `right`'s start state. `left`'s original accept states stop being
 * accepting (only `right`'s do), so a string is accepted only after fully
 * matching `left` then `right`.
 */
export const concatenateNFA = (left: Automaton, right: Automaton): Automaton => {
  const a = namespaceAutomaton(left, 'a-');
  const b = namespaceAutomaton(right, 'b-');
  const aStart = a.nodes.find(node => node.isStart);
  const bStart = b.nodes.find(node => node.isStart);
  if (!aStart || !bStart) throw new Error('Both machines need a start state.');
  const nodes: AutomatonNode[] = [
    ...a.nodes.map(node => ({ ...node, isAccept: false })),
    ...b.nodes.map(node => ({ ...node, isStart: false })),
  ];
  const bridgeEdges: AutomatonEdge[] = a.nodes.filter(node => node.isAccept).map((node, index) => ({
    id: `e-concat-bridge-${index}`, source: node.id, target: bStart.id, symbols: ['ε'],
  }));
  return { nodes, edges: [...a.edges, ...b.edges, ...bridgeEdges] };
};

/**
 * NFA Kleene star: a new start/accept "wrapper" state (accepting handles the
 * empty string) epsilon-bridges into the original machine, with every
 * original accept state epsilon-bridging back to the wrapper to allow repeats.
 */
export const starNFA = (input: Automaton): Automaton => {
  const a = namespaceAutomaton(input, 's-');
  const aStart = a.nodes.find(node => node.isStart);
  if (!aStart) throw new Error('Machine needs a start state.');
  const wrapperId = '__star_wrapper__';
  const wrapper: AutomatonNode = { id: wrapperId, label: '★', isStart: true, isAccept: true };
  const nodes: AutomatonNode[] = [wrapper, ...a.nodes.map(node => ({ ...node, isStart: false }))];
  const toStart: AutomatonEdge = { id: 'e-star-to-start', source: wrapperId, target: aStart.id, symbols: ['ε'] };
  const loopEdges: AutomatonEdge[] = a.nodes.filter(node => node.isAccept).map((node, index) => ({
    id: `e-star-loop-${index}`, source: node.id, target: wrapperId, symbols: ['ε'],
  }));
  return { nodes, edges: [...a.edges, toStart, ...loopEdges] };
};

/**
 * NFA reversal: every edge is flipped, the old start state(s) become the new
 * accept state(s), and a new single start state epsilon-bridges to every old
 * accept state.
 */
export const reverseNFA = (input: Automaton): Automaton => {
  const oldStarts = input.nodes.filter(node => node.isStart);
  if (!oldStarts.length) throw new Error('Machine needs a start state.');
  const wrapperId = '__reverse_start__';
  const wrapper: AutomatonNode = { id: wrapperId, label: 'start', isStart: true, isAccept: false };
  const nodes: AutomatonNode[] = [
    wrapper,
    ...input.nodes.map(node => ({ ...node, isStart: false, isAccept: oldStarts.some(start => start.id === node.id) })),
  ];
  const reversedEdges: AutomatonEdge[] = input.edges.map(edge => ({ ...edge, id: `rev-${edge.id}`, source: edge.target, target: edge.source }));
  const bridgeEdges: AutomatonEdge[] = input.nodes.filter(node => node.isAccept).map((node, index) => ({
    id: `e-reverse-bridge-${index}`, source: wrapperId, target: node.id, symbols: ['ε'],
  }));
  return { nodes, edges: [...reversedEdges, ...bridgeEdges] };
};

const regexUnion = (left: string | null, right: string | null) => !left ? right : !right || left === right ? left : `(${left}|${right})`;
const regexConcat = (...parts: Array<string | null>) => parts.some(part => !part) ? null : parts.filter(part => part !== 'ε').map(part => `(${part})`).join('') || 'ε';
const regexStar = (value: string | null) => !value || value === 'ε' ? 'ε' : `(${value})*`;

/** One GNFA-elimination step of the DFA→regex walkthrough: the state just removed and the resulting transition matrix. */
export interface DfaToRegexStep {
  removedState: string;
  removedLabel: string;
  matrix: Array<{ fromLabel: string; toLabel: string; regex: string }>;
}

export interface DfaToRegexWalkthrough {
  steps: DfaToRegexStep[];
  result: string;
}

/**
 * GNFA state elimination with a per-removed-state trace, for the editor's
 * DFA→regex walkthrough panel. `dfaToRegex` is the plain-result variant.
 */
export const dfaToRegexSteps = (dfa: Automaton): DfaToRegexWalkthrough => {
  const start = dfa.nodes.find(node => node.isStart);
  if (!start) throw new Error('DFA needs a start state.');
  const accepts = dfa.nodes.filter(node => node.isAccept);
  if (!accepts.length) return { steps: [], result: '∅' };
  const entry = '__entry__'; const exit = '__exit__';
  const states = [entry, ...dfa.nodes.map(node => node.id), exit];
  const stateLabel = (id: string) => id === entry ? 'Entry' : id === exit ? 'Exit' : (dfa.nodes.find(node => node.id === id)?.label || id);
  const matrix = new Map<string, string>();
  const get = (from: string, to: string) => matrix.get(`${from}|${to}`) || null;
  const put = (from: string, to: string, value: string | null) => { if (value) matrix.set(`${from}|${to}`, value); };
  put(entry, start.id, 'ε');
  accepts.forEach(node => put(node.id, exit, regexUnion(get(node.id, exit), 'ε')));
  dfa.edges.forEach(edge => put(edge.source, edge.target, regexUnion(get(edge.source, edge.target), edge.symbols.join('|'))));

  const snapshot = (): Array<{ fromLabel: string; toLabel: string; regex: string }> => {
    const rows: Array<{ fromLabel: string; toLabel: string; regex: string }> = [];
    for (const from of states) for (const to of states) {
      const value = get(from, to);
      if (value) rows.push({ fromLabel: stateLabel(from), toLabel: stateLabel(to), regex: value });
    }
    return rows;
  };

  const steps: DfaToRegexStep[] = [];
  for (const removed of dfa.nodes.map(node => node.id)) {
    for (const from of states) for (const to of states) {
      if (from === removed || to === removed) continue;
      put(from, to, regexUnion(get(from, to), regexConcat(get(from, removed), regexStar(get(removed, removed)), get(removed, to))));
    }
    for (const from of states) matrix.delete(`${from}|${removed}`);
    for (const to of states) matrix.delete(`${removed}|${to}`);
    steps.push({ removedState: removed, removedLabel: stateLabel(removed), matrix: snapshot() });
  }
  return { steps, result: get(entry, exit) || '∅' };
};

/** Converts a DFA to a regular expression using GNFA state elimination. */
export const dfaToRegex = (dfa: Automaton): string => dfaToRegexSteps(dfa).result;

/**
 * Converts a Non-Deterministic Finite Automaton (NFA) to a Deterministic Finite Automaton (DFA)
 * using the Subset Construction algorithm.
 */
export const nfaToDfa = (nfa: Automaton): Automaton => {
  const startNode = nfa.nodes.find(n => n.isStart);
  if (!startNode) {
    return { nodes: [], edges: [] };
  }

  // 1. Calculate the NFA alphabet (excluding epsilons)
  const alphabet = new Set<string>();
  nfa.edges.forEach(e => {
    e.symbols.forEach(sym => {
      if (!isEpsilon(sym)) alphabet.add(sym);
    });
  });
  const alphabetList = Array.from(alphabet).sort();

  // 2. Setup state structures
  const dfaNodes: AutomatonNode[] = [];
  const dfaEdges: AutomatonEdge[] = [];
  
  // Maps a sorted list of NFA states to a DFA node ID
  const dfaStateMap = new Map<string, string>();
  const unvisitedSets: Set<string>[] = [];

  // 3. Start state set
  const startClosure = getEpsilonClosure(nfa, new Set<string>([startNode.id]));
  const startKey = Array.from(startClosure).sort().join(',');
  const startId = 'p0';
  dfaStateMap.set(startKey, startId);
  unvisitedSets.push(startClosure);

  // Helper to format new state labels (e.g. {q0,q1})
  const getLabel = (states: Set<string>): string => {
    const sortedLabels = Array.from(states)
      .map(id => nfa.nodes.find(n => n.id === id)?.label || id)
      .sort();
    return `{${sortedLabels.join(',')}}`;
  };

  const isAccepting = (states: Set<string>): boolean => {
    return Array.from(states).some(id => {
      const n = nfa.nodes.find(node => node.id === id);
      return !!n?.isAccept;
    });
  };

  dfaNodes.push({
    id: startId,
    label: getLabel(startClosure),
    isStart: true,
    isAccept: isAccepting(startClosure)
  });

  let stateCounter = 1;

  // 4. Subset construction main loop
  while (unvisitedSets.length > 0) {
    const currentSet = unvisitedSets.shift()!;
    const currentKey = Array.from(currentSet).sort().join(',');
    const currentDfaId = dfaStateMap.get(currentKey)!;

    for (const symbol of alphabetList) {
      const targetStates = new Set<string>();
      
      // Find all transitions from the current subset on this symbol
      currentSet.forEach(stateId => {
        nfa.edges.forEach(edge => {
          if (edge.source === stateId && edge.symbols.includes(symbol)) {
            targetStates.add(edge.target);
          }
        });
      });

      if (targetStates.size === 0) continue;

      // Epsilon closure of target states
      const closure = getEpsilonClosure(nfa, targetStates);
      const closureKey = Array.from(closure).sort().join(',');

      let targetDfaId = dfaStateMap.get(closureKey);
      if (!targetDfaId) {
        // We found a new DFA state!
        targetDfaId = `p${stateCounter++}`;
        dfaStateMap.set(closureKey, targetDfaId);
        unvisitedSets.push(closure);

        dfaNodes.push({
          id: targetDfaId,
          label: getLabel(closure),
          isStart: false,
          isAccept: isAccepting(closure)
        });
      }

      // Add the transition edge to DFA
      dfaEdges.push({
        id: `dfa-edge-${currentDfaId}-${targetDfaId}-${symbol}`,
        source: currentDfaId,
        target: targetDfaId,
        symbols: [symbol]
      });
    }
  }

  // Combine edges going to the same target into a single edge with multiple symbols
  const consolidatedEdges: AutomatonEdge[] = [];
  const edgeMap = new Map<string, string[]>(); // key: source-target, val: symbols

  dfaEdges.forEach(edge => {
    const key = `${edge.source}->${edge.target}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, []);
    }
    edgeMap.get(key)!.push(...edge.symbols);
  });

  let edgeCounter = 0;
  edgeMap.forEach((symbols, key) => {
    const [source, target] = key.split('->');
    consolidatedEdges.push({
      id: `e-${source}-${target}-${edgeCounter++}`,
      source,
      target,
      symbols: Array.from(new Set(symbols)).sort()
    });
  });

  return {
    nodes: dfaNodes,
    edges: consolidatedEdges
  };
};

/**
 * Minimizes a Deterministic Finite Automaton (DFA) using the Table-Filling Algorithm.
 */
export const minimizeDFA = (dfa: Automaton): Automaton => {
  const startNode = dfa.nodes.find(n => n.isStart);
  if (!startNode) return dfa;

  // 1. Remove unreachable states
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

  if (cleanNodes.length <= 1) {
    return { nodes: cleanNodes, edges: cleanEdges };
  }

  // 2. Identify alphabet
  const alphabet = new Set<string>();
  cleanEdges.forEach(e => e.symbols.forEach(s => alphabet.add(s)));
  const alphabetList = Array.from(alphabet);

  // 3. Create transition lookups for quick access: delta[stateId][symbol] = targetId
  const delta: Record<string, Record<string, string>> = {};
  cleanNodes.forEach(node => {
    delta[node.id] = {};
    alphabetList.forEach(symbol => {
      const edge = cleanEdges.find(e => e.source === node.id && e.symbols.includes(symbol));
      // For DFA, assume a transition or self-loop/sink state. If no transition, leave undefined
      if (edge) delta[node.id][symbol] = edge.target;
    });
  });

  const nodeIds = cleanNodes.map(n => n.id);
  const n = nodeIds.length;

  // 4. Myhill-Nerode Table filling. Table maps: 'id1,id2' -> boolean (true if distinguishable)
  const distinguishable = new Set<string>();
  const getPairKey = (id1: string, id2: string): string => {
    return [id1, id2].sort().join(',');
  };

  // Mark pairs where one is accept state and other is not
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const state1 = cleanNodes.find(node => node.id === nodeIds[i])!;
      const state2 = cleanNodes.find(node => node.id === nodeIds[j])!;
      if (state1.isAccept !== state2.isAccept) {
        distinguishable.add(getPairKey(nodeIds[i], nodeIds[j]));
      }
    }
  }

  // Iterate to find other distinguishable pairs
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const id1 = nodeIds[i];
        const id2 = nodeIds[j];
        const key = getPairKey(id1, id2);

        if (!distinguishable.has(key)) {
          for (const symbol of alphabetList) {
            const next1 = delta[id1][symbol];
            const next2 = delta[id2][symbol];

            // If transitions are to different distinguishable states, mark this pair
            if (next1 && next2 && next1 !== next2) {
              const nextKey = getPairKey(next1, next2);
              if (distinguishable.has(nextKey)) {
                distinguishable.add(key);
                changed = true;
                break;
              }
            } else if ((next1 && !next2) || (!next1 && next2)) {
              // One has transition on symbol, other doesn't
              distinguishable.add(key);
              changed = true;
              break;
            }
          }
        }
      }
    }
  }

  // 5. Merge equivalent states (connected components of indistinguishable states)
  const parent: Record<string, string> = {};
  nodeIds.forEach(id => { parent[id] = id; });

  const findParent = (id: string): string => {
    if (parent[id] === id) return id;
    return findParent(parent[id]);
  };

  const unionStates = (id1: string, id2: string) => {
    const root1 = findParent(id1);
    const root2 = findParent(id2);
    if (root1 !== root2) {
      parent[root1] = root2;
    }
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const id1 = nodeIds[i];
      const id2 = nodeIds[j];
      if (!distinguishable.has(getPairKey(id1, id2))) {
        unionStates(id1, id2);
      }
    }
  }

  // Map each state to its group root
  const groups: Record<string, string[]> = {};
  nodeIds.forEach(id => {
    const root = findParent(id);
    if (!groups[root]) groups[root] = [];
    groups[root].push(id);
  });

  // 6. Build minimized nodes
  const minNodes: AutomatonNode[] = [];
  const groupIds = Object.keys(groups);
  
  groupIds.forEach((rootId, idx) => {
    const memberIds = groups[rootId];
    const isStart = memberIds.includes(startNode.id);
    const isAccept = memberIds.some(id => {
      const node = cleanNodes.find(node => node.id === id);
      return !!node?.isAccept;
    });

    const labels = memberIds
      .map(id => cleanNodes.find(node => node.id === id)?.label || id)
      .sort();

    minNodes.push({
      id: `min-${idx}`,
      label: labels.join(''),
      isStart,
      isAccept
    });
  });

  // 7. Build minimized edges
  const minEdges: AutomatonEdge[] = [];
  const minEdgeMap = new Map<string, string[]>(); // key: srcIdx->targetIdx, val: symbols

  groupIds.forEach((srcRoot, srcIdx) => {
    const srcMembers = groups[srcRoot];
    alphabetList.forEach(symbol => {
      // Find where any member transitions on this symbol
      const targetState = delta[srcMembers[0]][symbol];
      if (targetState) {
        const targetRoot = findParent(targetState);
        const targetIdx = groupIds.indexOf(targetRoot);
        
        const key = `min-${srcIdx}->min-${targetIdx}`;
        if (!minEdgeMap.has(key)) {
          minEdgeMap.set(key, []);
        }
        minEdgeMap.get(key)!.push(symbol);
      }
    });
  });

  let edgeIdx = 0;
  minEdgeMap.forEach((symbols, key) => {
    const [source, target] = key.split('->');
    minEdges.push({
      id: `min-edge-${edgeIdx++}`,
      source,
      target,
      symbols: Array.from(new Set(symbols)).sort()
    });
  });

  return {
    nodes: minNodes,
    edges: minEdges
  };
};

/**
 * One row of the NFA→DFA subset-construction walkthrough: the DFA state a
 * subset of NFA states became, and where each alphabet symbol leads.
 */
export interface NfaToDfaRow {
  stateId: string;
  label: string;
  subset: string[];
  transitions: Record<string, { targetSubset: string[]; targetStateId: string }>;
}

export interface NfaToDfaWalkthrough {
  alphabet: string[];
  rows: NfaToDfaRow[];
  finalDfa: Automaton;
}

/**
 * Subset construction with a step-by-step trace, for the editor's NFA→DFA
 * walkthrough panel. `nfaToDfa` is the plain-result variant of the same
 * algorithm.
 */
export const nfaToDfaSteps = (nfa: Automaton): NfaToDfaWalkthrough => {
  const startNode = nfa.nodes.find(n => n.isStart);
  if (!startNode) return { alphabet: [], rows: [], finalDfa: { nodes: [], edges: [] } };

  const alphabet = new Set<string>();
  nfa.edges.forEach(e => {
    e.symbols.forEach(sym => {
      if (!isEpsilon(sym)) alphabet.add(sym);
    });
  });
  const alphabetList = Array.from(alphabet).sort();

  const rows: NfaToDfaRow[] = [];
  const stateMap = new Map<string, string>();
  const unvisitedSets: Set<string>[] = [];

  const startClosure = getEpsilonClosure(nfa, new Set<string>([startNode.id]));
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
        const closure = getEpsilonClosure(nfa, nextStates);
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

  const dfaNodes: AutomatonNode[] = rows.map(r => ({
    id: r.stateId,
    label: r.label,
    isStart: r.stateId === startDfaId,
    isAccept: r.subset.some(id => !!nfa.nodes.find(node => node.id === id)?.isAccept)
  }));

  // Consolidate parallel transitions (same source/target) into one multi-symbol edge.
  const edgeMap = new Map<string, string[]>();
  rows.forEach(r => {
    Object.keys(r.transitions).forEach(sym => {
      const key = `${r.stateId}->${r.transitions[sym].targetStateId}`;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key)!.push(sym);
    });
  });

  const dfaEdges: AutomatonEdge[] = [];
  let edgeCounter = 0;
  edgeMap.forEach((syms, key) => {
    const [src, tgt] = key.split('->');
    dfaEdges.push({
      id: `e-${src}-${tgt}-${edgeCounter++}`,
      source: src,
      target: tgt,
      symbols: Array.from(new Set(syms)).sort()
    });
  });

  return {
    alphabet: alphabetList,
    rows,
    finalDfa: { nodes: dfaNodes, edges: dfaEdges }
  };
};

/** One entry of the table-filling (Myhill–Nerode) walkthrough. */
export interface MinimizationPair {
  pairKey: string;
  id1: string;
  id2: string;
  label1: string;
  label2: string;
  marked: boolean;
  reason: string;
  step: 'base' | 'iterative' | 'final';
}

export interface MinimizationWalkthrough {
  pairs: MinimizationPair[];
  iterations: { pass: number; markedThisPass: string[] }[];
  finalDfa: Automaton;
}

/**
 * Table-filling DFA minimization with a per-pair trace, for the editor's
 * minimization walkthrough panel. `minimizeDFA` produces the final automaton.
 */
export const minimizeDFASteps = (dfa: Automaton): MinimizationWalkthrough => {
  const startNode = dfa.nodes.find(n => n.isStart);
  if (!startNode) return { pairs: [], iterations: [], finalDfa: { nodes: [], edges: [] } };

  // Only reachable states participate in the walkthrough.
  const reachableIds = new Set<string>([startNode.id]);
  const queue = [startNode.id];
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
  const getPairKey = (id1: string, id2: string): string => [id1, id2].sort().join(',');

  const distinguishable = new Set<string>();
  const pairTrace: MinimizationPair[] = [];

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
  const iterations: { pass: number; markedThisPass: string[] }[] = [];

  while (changed && pass < 10) {
    changed = false;
    const markedThisPass: string[] = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const id1 = nodeIds[i];
        const id2 = nodeIds[j];
        const key = getPairKey(id1, id2);
        if (distinguishable.has(key)) continue;

        for (const symbol of alphabetList) {
          const next1 = delta[id1]?.[symbol];
          const next2 = delta[id2]?.[symbol];

          const markWith = (reason: string) => {
            distinguishable.add(key);
            markedThisPass.push(key);
            changed = true;
            const trace = pairTrace.find(pt => pt.pairKey === key);
            if (trace) {
              trace.marked = true;
              trace.reason = reason;
              trace.step = 'iterative';
            }
          };

          if (next1 && next2 && next1 !== next2) {
            if (distinguishable.has(getPairKey(next1, next2))) {
              markWith(`Pass ${pass}: Transitions on '${symbol}' lead to distinguishable pair {${next1}, ${next2}}`);
              break;
            }
          } else if ((next1 && !next2) || (!next1 && next2)) {
            markWith(`Pass ${pass}: One state has a transition on '${symbol}' but the other does not`);
            break;
          }
        }
      }
    }
    iterations.push({ pass, markedThisPass });
    pass++;
  }

  return {
    pairs: pairTrace,
    iterations,
    finalDfa: minimizeDFA(dfa)
  };
};
