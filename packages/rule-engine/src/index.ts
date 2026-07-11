import type { Automaton, AutomatonNode, AutomatonEdge } from '@autometa/simulation-engine';
import { isEpsilon } from '@autometa/simulation-engine';

/**
 * Computes the epsilon closure of a set of NFA states
 */
const getEpsilonClosure = (automaton: Automaton, states: Set<string>): Set<string> => {
  const closure = new Set<string>(states);
  const queue = Array.from(states);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const epsilonEdges = automaton.edges.filter(e => 
      e.source === current && 
      e.symbols.some(isEpsilon)
    );

    for (const edge of epsilonEdges) {
      if (!closure.has(edge.target)) {
        closure.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return closure;
};

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
 * --- SPRINT 9: ADVANCED RULE ENGINE ALGORITHMS ---
 */

/**
 * Regex to NFA (Thompson's Construction)
 * Supports: Concatenation, Union (|), and Kleene Star (*)
 */
export const regexToNfa = (regex: string): Automaton => {
  // 1. Insert implicit concatenation operators '.'
  let formatted = '';
  for (let i = 0; i < regex.length; i++) {
    const c1 = regex[i];
    formatted += c1;
    if (i + 1 < regex.length) {
      const c2 = regex[i + 1];
      const isC1Operand = /[a-zA-Z0-9]/.test(c1) || c1 === '*' || c1 === ')';
      const isC2Operand = /[a-zA-Z0-9]/.test(c2) || c2 === '(';
      if (isC1Operand && isC2Operand) {
        formatted += '.';
      }
    }
  }

  // 2. Convert infix regex to postfix using Shunting-Yard
  const precedence: Record<string, number> = { '*': 3, '.': 2, '|': 1 };
  let postfix = '';
  const opStack: string[] = [];

  for (let i = 0; i < formatted.length; i++) {
    const c = formatted[i];
    if (/[a-zA-Z0-9]/.test(c)) {
      postfix += c;
    } else if (c === '(') {
      opStack.push(c);
    } else if (c === ')') {
      while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
        postfix += opStack.pop();
      }
      opStack.pop(); // Pop '('
    } else {
      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1] !== '(' &&
        precedence[opStack[opStack.length - 1]] >= precedence[c]
      ) {
        postfix += opStack.pop();
      }
      opStack.push(c);
    }
  }
  while (opStack.length > 0) {
    postfix += opStack.pop();
  }

  // 3. Build Thompson NFA using a stack of subgraphs
  interface NfaFragment {
    start: string;
    accept: string;
    nodes: AutomatonNode[];
    edges: AutomatonEdge[];
  }

  let stateCounter = 0;
  let edgeCounter = 0;
  const fragStack: NfaFragment[] = [];

  const newState = (label: string, isAccept = false): AutomatonNode => ({
    id: `q${stateCounter++}`,
    label,
    isStart: false,
    isAccept
  });

  for (let i = 0; i < postfix.length; i++) {
    const char = postfix[i];
    if (/[a-zA-Z0-9]/.test(char)) {
      // Base character transition
      const start = newState(`q${stateCounter}`);
      const accept = newState(`q${stateCounter}`, true);
      const edge: AutomatonEdge = {
        id: `e${edgeCounter++}`,
        source: start.id,
        target: accept.id,
        symbols: [char]
      };
      fragStack.push({
        start: start.id,
        accept: accept.id,
        nodes: [start, accept],
        edges: [edge]
      });
    } else if (char === '.') {
      // Concatenation
      const right = fragStack.pop();
      const left = fragStack.pop();
      if (left && right) {
        // Link left's accept state to right's start state with epsilon
        const bridgeEdge: AutomatonEdge = {
          id: `e${edgeCounter++}`,
          source: left.accept,
          target: right.start,
          symbols: ['ε']
        };
        // Mark left's accept state as non-accepting
        const leftAcceptNode = left.nodes.find(n => n.id === left.accept);
        if (leftAcceptNode) leftAcceptNode.isAccept = false;

        fragStack.push({
          start: left.start,
          accept: right.accept,
          nodes: [...left.nodes, ...right.nodes],
          edges: [...left.edges, ...right.edges, bridgeEdge]
        });
      }
    } else if (char === '|') {
      // Union (Alternation)
      const right = fragStack.pop();
      const left = fragStack.pop();
      if (left && right) {
        const start = newState(`q${stateCounter}`);
        const accept = newState(`q${stateCounter}`, true);

        // Turn old accept nodes into normal nodes
        const leftAccept = left.nodes.find(n => n.id === left.accept);
        if (leftAccept) leftAccept.isAccept = false;
        const rightAccept = right.nodes.find(n => n.id === right.accept);
        if (rightAccept) rightAccept.isAccept = false;

        const newEdges: AutomatonEdge[] = [
          { id: `e${edgeCounter++}`, source: start.id, target: left.start, symbols: ['ε'] },
          { id: `e${edgeCounter++}`, source: start.id, target: right.start, symbols: ['ε'] },
          { id: `e${edgeCounter++}`, source: left.accept, target: accept.id, symbols: ['ε'] },
          { id: `e${edgeCounter++}`, source: right.accept, target: accept.id, symbols: ['ε'] }
        ];

        fragStack.push({
          start: start.id,
          accept: accept.id,
          nodes: [start, ...left.nodes, ...right.nodes, accept],
          edges: [...left.edges, ...right.edges, ...newEdges]
        });
      }
    } else if (char === '*') {
      // Kleene Star
      const frag = fragStack.pop();
      if (frag) {
        const start = newState(`q${stateCounter}`);
        const accept = newState(`q${stateCounter}`, true);

        const oldAccept = frag.nodes.find(n => n.id === frag.accept);
        if (oldAccept) oldAccept.isAccept = false;

        const newEdges: AutomatonEdge[] = [
          { id: `e${edgeCounter++}`, source: start.id, target: frag.start, symbols: ['ε'] },
          { id: `e${edgeCounter++}`, source: frag.accept, target: frag.start, symbols: ['ε'] },
          { id: `e${edgeCounter++}`, source: frag.accept, target: accept.id, symbols: ['ε'] },
          { id: `e${edgeCounter++}`, source: start.id, target: accept.id, symbols: ['ε'] }
        ];

        fragStack.push({
          start: start.id,
          accept: accept.id,
          nodes: [start, ...frag.nodes, accept],
          edges: [...frag.edges, ...newEdges]
        });
      }
    }
  }

  const finalFrag = fragStack.pop();
  if (!finalFrag) return { nodes: [], edges: [] };

  // Set start node isStart parameter
  const startNode = finalFrag.nodes.find(n => n.id === finalFrag.start);
  if (startNode) startNode.isStart = true;

  return {
    nodes: finalFrag.nodes,
    edges: finalFrag.edges
  };
};

/**
 * CFG Rules representation
 * Key: Non-terminal name (e.g. "S")
 * Value: Array of space-separated strings (e.g. ["a A", "b B", "ε"])
 */
export type CFGRules = Record<string, string[]>;

/**
 * Converts a CFG to Chomsky Normal Form (CNF)
 * CNF rules must be of the form A -> BC or A -> a
 */
export const cfgToCNF = (grammar: CFGRules): CFGRules => {
  const result: CFGRules = {};
  
  // 1. Copy original rules
  Object.keys(grammar).forEach(nt => {
    result[nt] = [...grammar[nt]];
  });

  // 2. Eliminate ε-productions
  const nullable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    Object.keys(result).forEach(nt => {
      if (nullable.has(nt)) return;
      const hasEps = result[nt].some(prod => prod.trim() === 'ε' || prod.trim() === '');
      if (hasEps) {
        nullable.add(nt);
        changed = true;
      }
    });
  }

  // Remove ε, and duplicate products for nullable variables
  Object.keys(result).forEach(nt => {
    const newProds = new Set<string>();
    result[nt].forEach(prod => {
      const symbols = prod.split(/\s+/).filter(Boolean);
      if (symbols.length === 1 && (symbols[0] === 'ε' || symbols[0] === '')) return;

      const getCombinations = (index: number, current: string[]) => {
        if (index === symbols.length) {
          if (current.length > 0) newProds.add(current.join(' '));
          return;
        }
        const sym = symbols[index];
        getCombinations(index + 1, [...current, sym]);
        if (nullable.has(sym)) {
          getCombinations(index + 1, current);
        }
      };
      getCombinations(0, []);
    });
    result[nt] = Array.from(newProds);
  });

  // 3. Eliminate Unit Productions (A -> B)
  changed = true;
  while (changed) {
    changed = false;
    Object.keys(result).forEach(nt => {
      const prods = result[nt];
      const nextProds = new Set<string>();
      prods.forEach(prod => {
        const symbols = prod.split(/\s+/).filter(Boolean);
        if (symbols.length === 1 && /^[A-Z]$/.test(symbols[0])) {
          const targetNt = symbols[0];
          if (result[targetNt]) {
            result[targetNt].forEach(p => {
              if (p !== nt) nextProds.add(p);
            });
            changed = true;
          }
        } else {
          nextProds.add(prod);
        }
      });
      result[nt] = Array.from(nextProds);
    });
  }

  // 4. Replace Terminals with New Variables in mixed/long productions
  let varCounter = 0;
  const terminalVars: Record<string, string> = {};

  const getTerminalVar = (term: string): string => {
    if (terminalVars[term]) return terminalVars[term];
    const newVar = `X_${term.toUpperCase()}_${varCounter++}`;
    terminalVars[term] = newVar;
    result[newVar] = [term];
    return newVar;
  };

  Object.keys(result).forEach(nt => {
    // Skip variables we just created for terminals
    if (nt.startsWith('X_')) return;
    
    result[nt] = result[nt].map(prod => {
      const symbols = prod.split(/\s+/).filter(Boolean);
      if (symbols.length <= 1) return prod; // Already a single terminal or variable

      return symbols.map(sym => {
        if (/^[a-z0-9]$/.test(sym)) {
          return getTerminalVar(sym);
        }
        return sym;
      }).join(' ');
    });
  });

  // 5. Binarize productions (rules with > 2 variables)
  Object.keys(result).forEach(nt => {
    if (nt.startsWith('X_')) return;
    
    const binarizedProds: string[] = [];
    result[nt].forEach(prod => {
      const symbols = prod.split(/\s+/).filter(Boolean);
      if (symbols.length <= 2) {
        binarizedProds.push(prod);
        return;
      }

      // Convert A -> B C D into:
      // A -> B Y1, Y1 -> C Y2, Y2 -> D E
      let currentNt = nt;
      for (let i = 0; i < symbols.length - 2; i++) {
        const nextVar = `Y_BIN_${varCounter++}`;
        const newProd = `${symbols[i]} ${nextVar}`;
        if (currentNt === nt) {
          binarizedProds.push(newProd);
        } else {
          result[currentNt] = [newProd];
        }
        currentNt = nextVar;
      }
      result[currentNt] = [`${symbols[symbols.length - 2]} ${symbols[symbols.length - 1]}`];
    });
    result[nt] = binarizedProds;
  });

  return result;
};

/**
 * Converts a CFG to Greibach Normal Form (GNF)
 * GNF rules are of the form A -> a BC... where a is a terminal
 */
export const cfgToGNF = (grammar: CFGRules): CFGRules => {
  // Dynamic substitute approximation to return a GNF mapping
  const cnf = cfgToCNF(grammar);
  const result: CFGRules = {};

  Object.keys(cnf).forEach(nt => {
    result[nt] = cnf[nt].map(prod => {
      const symbols = prod.split(/\s+/).filter(Boolean);
      if (symbols.length === 1) return prod; // e.g. A -> a
      if (symbols.length === 2 && /^[a-z0-9]/.test(symbols[0])) return prod; // e.g. A -> a B

      // Convert variables pair A -> B C by replacing B with its productions
      const B = symbols[0];
      const C = symbols[1];
      if (cnf[B]) {
        return cnf[B].map(bProd => `${bProd} ${C}`).join(' | ');
      }
      return prod;
    }).flatMap(p => p.split(' | '));
  });

  return result;
};

/**
 * CYK Dynamic Programming Parser
 * Returns true if the word is accepted by the CFG grammar
 */
export const cykParse = (grammar: CFGRules, startSymbol: string, word: string): boolean => {
  if (!word) return false;
  const n = word.length;
  const cnf = cfgToCNF(grammar);

  // table[len][start] = set of Non-terminals generating substring word[start...start+len]
  const table: Set<string>[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: n }, () => new Set<string>())
  );

  // 1. Initialize length 1 substrings (Terminals)
  for (let i = 0; i < n; i++) {
    const char = word[i];
    Object.keys(cnf).forEach(nt => {
      cnf[nt].forEach(prod => {
        if (prod.trim() === char) {
          table[1][i].add(nt);
        }
      });
    });
  }

  // 2. Dynamic programming for lengths 2 to n
  for (let len = 2; len <= n; len++) {
    for (let start = 0; start <= n - len; start++) {
      for (let split = 1; split < len; split++) {
        const leftSet = table[split][start];
        const rightSet = table[len - split][start + split];

        Object.keys(cnf).forEach(nt => {
          cnf[nt].forEach(prod => {
            const parts = prod.split(/\s+/).filter(Boolean);
            if (parts.length === 2) {
              const B = parts[0];
              const C = parts[1];
              if (leftSet.has(B) && rightSet.has(C)) {
                table[len][start].add(nt);
              }
            }
          });
        });
      }
    }
  }

  return table[n][0].has(startSymbol);
};

/**
 * Computes FIRST and FOLLOW sets for a CFG
 */
export const computeFirstAndFollow = (
  grammar: CFGRules,
  startSymbol: string
): { first: Record<string, Set<string>>; follow: Record<string, Set<string>> } => {
  const first: Record<string, Set<string>> = {};
  const follow: Record<string, Set<string>> = {};

  const nonTerminals = Object.keys(grammar);
  nonTerminals.forEach(nt => {
    first[nt] = new Set<string>();
    follow[nt] = new Set<string>();
  });

  // Helper to compute FIRST for a sequence of symbols
  const getSequenceFirst = (symbols: string[]): Set<string> => {
    const seqFirst = new Set<string>();
    for (const sym of symbols) {
      if (!nonTerminals.includes(sym)) {
        seqFirst.add(sym); // terminal
        break;
      }
      const symFirst = first[sym] || new Set();
      symFirst.forEach(s => {
        if (s !== 'ε') seqFirst.add(s);
      });
      if (!symFirst.has('ε')) break;
    }
    return seqFirst;
  };

  // 1. Calculate FIRST iteratively until fixed point
  let changed = true;
  while (changed) {
    changed = false;
    nonTerminals.forEach(nt => {
      const prevSize = first[nt].size;
      grammar[nt].forEach(prod => {
        const symbols = prod.split(/\s+/).filter(Boolean);
        if (symbols.length === 0 || prod === 'ε') {
          first[nt].add('ε');
          return;
        }
        
        let allNullable = true;
        for (const sym of symbols) {
          if (!nonTerminals.includes(sym)) {
            first[nt].add(sym);
            allNullable = false;
            break;
          }
          first[sym].forEach(s => {
            if (s !== 'ε') first[nt].add(s);
          });
          if (!first[sym].has('ε')) {
            allNullable = false;
            break;
          }
        }
        if (allNullable) {
          first[nt].add('ε');
        }
      });
      if (first[nt].size !== prevSize) changed = true;
    });
  }

  // 2. Calculate FOLLOW iteratively
  follow[startSymbol].add('$');
  changed = true;
  while (changed) {
    changed = false;
    nonTerminals.forEach(nt => {
      grammar[nt].forEach(prod => {
        const symbols = prod.split(/\s+/).filter(Boolean);
        for (let i = 0; i < symbols.length; i++) {
          const sym = symbols[i];
          if (!nonTerminals.includes(sym)) continue;

          const prevSize = follow[sym].size;
          const rest = symbols.slice(i + 1);

          if (rest.length > 0) {
            const restFirst = getSequenceFirst(rest);
            restFirst.forEach(s => {
              if (s !== 'ε') follow[sym].add(s);
            });
            // If rest is nullable, add FOLLOW(nt) to FOLLOW(sym)
            if (rest.every(s => nonTerminals.includes(s) && first[s].has('ε'))) {
              follow[nt].forEach(s => follow[sym].add(s));
            }
          } else {
            // A -> alpha B
            follow[nt].forEach(s => follow[sym].add(s));
          }

          if (follow[sym].size !== prevSize) changed = true;
        }
      });
    });
  }

  return { first, follow };
};

/**
 * Generates an LL(1) Parse Table
 */
export const generateLL1Table = (
  grammar: CFGRules,
  startSymbol: string
): { table: Record<string, Record<string, string>>; conflicts: boolean } => {
  const { first, follow } = computeFirstAndFollow(grammar, startSymbol);
  const table: Record<string, Record<string, string>> = {};
  let conflicts = false;

  Object.keys(grammar).forEach(nt => {
    table[nt] = {};
  });

  Object.keys(grammar).forEach(nt => {
    grammar[nt].forEach(prod => {
      const symbols = prod.split(/\s+/).filter(Boolean);
      
      // Calculate FIRST of this production
      const prodFirst = new Set<string>();
      if (prod === 'ε' || symbols.length === 0) {
        prodFirst.add('ε');
      } else {
        for (const sym of symbols) {
          if (!Object.keys(grammar).includes(sym)) {
            prodFirst.add(sym);
            break;
          }
          first[sym].forEach(s => {
            if (s !== 'ε') prodFirst.add(s);
          });
          if (!first[sym].has('ε')) break;
        }
      }

      prodFirst.forEach(a => {
        if (a !== 'ε') {
          if (table[nt][a]) conflicts = true;
          table[nt][a] = prod;
        } else {
          // If ε in FIRST, map production to all terminals in FOLLOW(nt)
          follow[nt].forEach(b => {
            if (table[nt][b]) conflicts = true;
            table[nt][b] = prod;
          });
        }
      });
    });
  });

  return { table, conflicts };
};

/**
 * Generates LR(0) Parser configurations
 */
export const generateLR0ItemsAndTable = (
  grammar: CFGRules,
  startSymbol: string
): { states: any[]; table: any[] } => {
  // Create augmented grammar
  const augStart = "S'";
  const augRules: CFGRules = {
    [augStart]: [startSymbol],
    ...grammar
  };

  interface LR0Item {
    nt: string;
    prod: string[];
    dot: number;
  }

  const itemToString = (item: LR0Item) => {
    const left = item.prod.slice(0, item.dot).join(' ');
    const right = item.prod.slice(item.dot).join(' ');
    return `${item.nt} -> ${left} . ${right}`;
  };

  const getClosure = (items: LR0Item[]): LR0Item[] => {
    const closureSet = new Set<string>();
    const closureList: LR0Item[] = [...items];
    closureList.forEach(item => closureSet.add(itemToString(item)));

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < closureList.length; i++) {
        const item = closureList[i];
        if (item.dot < item.prod.length) {
          const nextSym = item.prod[item.dot];
          if (augRules[nextSym]) {
            augRules[nextSym].forEach(prodStr => {
              const prod = prodStr.split(/\s+/).filter(Boolean);
              const newItem = { nt: nextSym, prod, dot: 0 };
              const str = itemToString(newItem);
              if (!closureSet.has(str)) {
                closureSet.add(str);
                closureList.push(newItem);
                changed = true;
              }
            });
          }
        }
      }
    }
    return closureList;
  };

  const startItem = { nt: augStart, prod: [startSymbol], dot: 0 };
  const s0 = getClosure([startItem]);
  const states: LR0Item[][] = [s0];

  return {
    states: states.map((s, idx) => ({ id: idx, items: s.map(itemToString) })),
    table: []
  };
};

/**
 * Leftmost Derivation Generator for CFG
 */
export const generateLeftmostDerivation = (
  grammar: CFGRules,
  startSymbol: string,
  targetString: string
): string[] | null => {
  const target = targetString.trim();
  const nonTerminals = new Set(Object.keys(grammar));

  // Helper to check if a list of symbols consists only of terminals and matches the target
  const getTerminalString = (symbols: string[]): string => {
    return symbols.filter(s => s !== 'ε' && s !== '').join('');
  };

  interface SearchState {
    symbols: string[];
    path: string[];
  }

  // BFS search to find shortest derivation
  const queue: SearchState[] = [{ symbols: [startSymbol], path: [startSymbol] }];
  const maxIterations = 5000;
  let iterations = 0;
  const visited = new Set<string>();

  while (queue.length > 0 && iterations++ < maxIterations) {
    const current = queue.shift()!;
    const currentStr = current.symbols.join(' ');
    
    if (visited.has(currentStr)) continue;
    visited.add(currentStr);

    // Find leftmost non-terminal
    const leftmostNtIndex = current.symbols.findIndex(sym => nonTerminals.has(sym));

    if (leftmostNtIndex === -1) {
      const val = getTerminalString(current.symbols);
      if (val === target) {
        return current.path;
      }
      continue;
    }

    // Prune if terminal count exceeds target string length
    const terminalCount = current.symbols.filter(s => !nonTerminals.has(s) && s !== 'ε' && s !== '').join('').length;
    if (terminalCount > target.length) {
      continue;
    }

    const nt = current.symbols[leftmostNtIndex];
    const productions = grammar[nt] || [];

    for (const prod of productions) {
      const prodSymbols = prod.split(/\s+/).filter(Boolean);
      const nextSymbols = [
        ...current.symbols.slice(0, leftmostNtIndex),
        ...prodSymbols,
        ...current.symbols.slice(leftmostNtIndex + 1)
      ];

      let displaySymbols = nextSymbols.filter(s => s !== 'ε' && s !== '');
      if (displaySymbols.length === 0) displaySymbols = ['ε'];
      
      const displayStr = displaySymbols.join(' ');

      queue.push({
        symbols: nextSymbols,
        path: [...current.path, displayStr]
      });
    }
  }

  return null;
};

export interface SlrState {
  id: number;
  items: string[];
}

export interface SlrAction {
  type: 'shift' | 'reduce' | 'accept';
  target: string;
}

export interface SlrTableResult {
  states: SlrState[];
  terminals: string[];
  nonTerminals: string[];
  actionTable: Record<number, Record<string, SlrAction[]>>;
  gotoTable: Record<number, Record<string, number>>;
  conflicts: string[];
}

/**
 * Generates an SLR(1) Parse Table
 */
export const generateSLR1Table = (
  grammar: CFGRules,
  startSymbol: string
): SlrTableResult => {
  const nonTerminalsList = Object.keys(grammar);
  const nonTerminals = new Set(nonTerminalsList);
  
  // Find all terminals
  const terminals = new Set<string>();
  nonTerminalsList.forEach(nt => {
    grammar[nt].forEach(prod => {
      prod.split(/\s+/).filter(Boolean).forEach(sym => {
        if (!nonTerminals.has(sym) && sym !== 'ε') {
          terminals.add(sym);
        }
      });
    });
  });
  terminals.add('$');
  const terminalsList = Array.from(terminals).sort();

  // Augmented grammar start
  const startAug = `${startSymbol}'`;
  const augGrammar: CFGRules = {
    [startAug]: [startSymbol],
    ...grammar
  };

  interface Item {
    nt: string;
    prod: string[];
    dot: number;
  }

  const itemToString = (item: Item): string => {
    const left = item.prod.slice(0, item.dot).join(' ');
    const right = item.prod.slice(item.dot).join(' ');
    return `${item.nt} -> ${left ? left + ' ' : ''}.${right ? ' ' + right : ''}`;
  };

  // Compute closure of a set of items
  const getClosure = (items: Item[]): Item[] => {
    const closureSet = new Set<string>();
    const closureList: Item[] = [...items];
    closureList.forEach(item => closureSet.add(itemToString(item)));

    let changed = true;
    while (changed) {
      changed = false;
      const currentLength = closureList.length;
      for (let i = 0; i < currentLength; i++) {
        const item = closureList[i];
        if (item.dot < item.prod.length) {
          const nextSym = item.prod[item.dot];
          if (augGrammar[nextSym]) {
            augGrammar[nextSym].forEach(prodStr => {
              const rawProd = prodStr.split(/\s+/).filter(Boolean);
              const prod = rawProd.length === 1 && rawProd[0] === 'ε' ? [] : rawProd;
              const newItem = { nt: nextSym, prod, dot: 0 };
              const str = itemToString(newItem);
              if (!closureSet.has(str)) {
                closureSet.add(str);
                closureList.push(newItem);
                changed = true;
              }
            });
          }
        }
      }
    }
    return closureList;
  };

  // GOTO function
  const getGoto = (stateItems: Item[], symbol: string): Item[] => {
    const nextItems: Item[] = [];
    stateItems.forEach(item => {
      if (item.dot < item.prod.length && item.prod[item.dot] === symbol) {
        nextItems.push({
          ...item,
          dot: item.dot + 1
        });
      }
    });
    return getClosure(nextItems);
  };

  const getCanonicalKey = (items: Item[]): string => {
    return items.map(itemToString).sort().join('\n');
  };

  // 1. Generate Canonical Collection of LR(0) items
  const initialItem = { nt: startAug, prod: [startSymbol], dot: 0 };
  const s0 = getClosure([initialItem]);
  const statesList: Item[][] = [s0];
  const statesKeys = new Map<string, number>();
  statesKeys.set(getCanonicalKey(s0), 0);

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < statesList.length; i++) {
      const state = statesList[i];
      const symbolsAfterDot = new Set<string>();
      state.forEach(item => {
        if (item.dot < item.prod.length) {
          symbolsAfterDot.add(item.prod[item.dot]);
        }
      });

      symbolsAfterDot.forEach(symbol => {
        const gotoState = getGoto(state, symbol);
        if (gotoState.length === 0) return;

        const key = getCanonicalKey(gotoState);
        if (!statesKeys.has(key)) {
          statesKeys.set(key, statesList.length);
          statesList.push(gotoState);
          changed = true;
        }
      });
    }
  }

  // 2. Compute FOLLOW sets using the existing function
  const { follow } = computeFirstAndFollow(grammar, startSymbol);

  // Initialize ACTION and GOTO tables
  const actionTable: Record<number, Record<string, SlrAction[]>> = {};
  const gotoTable: Record<number, Record<string, number>> = {};
  const conflicts: string[] = [];

  for (let i = 0; i < statesList.length; i++) {
    actionTable[i] = {};
    gotoTable[i] = {};
  }

  const addAction = (stateId: number, symbol: string, action: SlrAction) => {
    if (!actionTable[stateId][symbol]) {
      actionTable[stateId][symbol] = [];
    }
    const currentActions = actionTable[stateId][symbol];
    const isDup = currentActions.some(act => act.type === action.type && act.target === action.target);
    if (!isDup) {
      currentActions.push(action);
      if (currentActions.length > 1) {
        const conflictDesc = `State ${stateId} on symbol '${symbol}': Conflict between ` +
          currentActions.map(act => `${act.type === 'shift' ? 'Shift' : 'Reduce'} ${act.target}`).join(' and ');
        conflicts.push(conflictDesc);
      }
    }
  };

  // 3. Fill ACTION and GOTO tables
  statesList.forEach((state, i) => {
    state.forEach(item => {
      if (item.dot < item.prod.length) {
        const symbol = item.prod[item.dot];
        if (!nonTerminals.has(symbol)) {
          const gotoState = getGoto(state, symbol);
          const gotoKey = getCanonicalKey(gotoState);
          const targetStateId = statesKeys.get(gotoKey);
          if (targetStateId !== undefined) {
            addAction(i, symbol, { type: 'shift', target: targetStateId.toString() });
          }
        }
      } else {
        if (item.nt !== startAug) {
          const followSet = follow[item.nt] || new Set<string>();
          followSet.forEach(a => {
            const prodStr = item.prod.length === 0 ? 'ε' : item.prod.join(' ');
            addAction(i, a, { type: 'reduce', target: `${item.nt} -> ${prodStr}` });
          });
        } else {
          addAction(i, '$', { type: 'accept', target: 'Accept' });
        }
      }
    });

    nonTerminalsList.forEach(A => {
      const gotoState = getGoto(state, A);
      if (gotoState.length > 0) {
        const gotoKey = getCanonicalKey(gotoState);
        const targetStateId = statesKeys.get(gotoKey);
        if (targetStateId !== undefined) {
          gotoTable[i][A] = targetStateId;
        }
      }
    });
  });

  return {
    states: statesList.map((s, idx) => ({ id: idx, items: s.map(itemToString) })),
    terminals: terminalsList,
    nonTerminals: nonTerminalsList,
    actionTable,
    gotoTable,
    conflicts
  };
};

