export interface AutomatonNode {
  id: string;
  label: string;
  isStart: boolean;
  isAccept: boolean;
  isReject?: boolean;
}

export interface AutomatonEdge {
  id: string;
  source: string;
  target: string;
  symbols: string[]; // e.g. ["a"], ["b"], ["ε", "Epsilon", ""]
}

export interface Automaton {
  nodes: AutomatonNode[];
  edges: AutomatonEdge[];
  /** Present once persisted through `migrateAutomatonSchema`/`stampAutomatonSchema`; absent on in-memory automata built by editor conversions. */
  schemaVersion?: number;
}

/**
 * Automaton schema version. Bump this whenever the persisted shape of
 * `Automaton` changes, and add a branch to `migrateAutomatonSchema` for the
 * previous shape — mirrors the pattern in
 * apps/web/src/utils/projectFormat.ts.
 */
export const AUTOMATON_SCHEMA_VERSION = 1;

export const stampAutomatonSchema = (automaton: Automaton): Automaton => ({
  ...automaton,
  schemaVersion: AUTOMATON_SCHEMA_VERSION,
});

/**
 * Parses automaton JSON blobs written by this app, including data from
 * before schema versioning existed (no `schemaVersion` field).
 */
export const migrateAutomatonSchema = (value: unknown): Automaton => {
  if (!value || typeof value !== 'object') throw new Error('Automaton data must be a JSON object.');
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('Automaton data must contain nodes and edges arrays.');
  if (data.schemaVersion !== undefined && data.schemaVersion !== AUTOMATON_SCHEMA_VERSION) {
    throw new Error(`Unsupported automaton schema version: ${String(data.schemaVersion)}.`);
  }
  return { nodes: data.nodes as AutomatonNode[], edges: data.edges as AutomatonEdge[], schemaVersion: AUTOMATON_SCHEMA_VERSION };
};

export interface SimulationEvent {
  time: number;
  event: 'enter_state' | 'transition' | 'active_states' | 'accept' | 'reject';
  stateId?: string;           // state being entered
  activeStateIds?: string[];  // active states (primarily for NFA)
  edgeId?: string;            // edge traversed
  symbol?: string;            // symbol read
  symbolIndex?: number;       // character index in the input string
  // TM (single-tape)
  tape?: Record<number, string>;
  headIndex?: number;
  // TM (multi-tape, tapeCount > 1) — one entry per tape, in parallel arrays
  tapes?: Record<number, string>[];
  headIndices?: number[];
  // PDA
  stack?: string[];
}

export interface SimulationResult {
  accepted: boolean;
  events: SimulationEvent[];
}

// Check if a symbol represents an epsilon transition
export const isEpsilon = (symbol: string): boolean => {
  const s = symbol.trim().toLowerCase();
  return s === '' || s === 'ε' || s === 'epsilon' || s === 'λ' || s === 'lambda';
};

/**
 * Epsilon closure of a set of states, also reporting which epsilon edges were
 * traversed to reach it (used by the NFA simulator to animate those edges).
 */
export const getEpsilonClosureDetailed = (
  automaton: Automaton,
  states: Iterable<string>
): { closure: Set<string>; traversedEdges: Set<string> } => {
  const closure = new Set<string>(states);
  const queue = Array.from(closure);
  const traversedEdges = new Set<string>();

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
        traversedEdges.add(edge.id);
      }
    }
  }

  return { closure, traversedEdges };
};

/**
 * Epsilon closure of a set of states. The canonical implementation shared by
 * the NFA simulator, subset construction, and the walkthrough builders.
 */
export const getEpsilonClosure = (automaton: Automaton, states: Iterable<string>): Set<string> =>
  getEpsilonClosureDetailed(automaton, states).closure;

/**
 * Simulates a Deterministic Finite Automaton (DFA)
 */
export const simulateDFA = (automaton: Automaton, inputString: string): SimulationResult => {
  const events: SimulationEvent[] = [];
  let time = 0;

  const startNode = automaton.nodes.find(n => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: 'reject', symbolIndex: 0 }] };
  }

  let currentStateId = startNode.id;
  
  // Event: Enter Start State
  events.push({
    time: time++,
    event: 'enter_state',
    stateId: currentStateId,
    symbolIndex: 0,
  });

  events.push({
    time: time++,
    event: 'active_states',
    activeStateIds: [currentStateId],
    symbolIndex: 0,
  });

  for (let i = 0; i < inputString.length; i++) {
    const symbol = inputString[i];
    
    // Find transition from current state with matching symbol
    const edge = automaton.edges.find(e => 
      e.source === currentStateId && 
      e.symbols.some(sym => sym === symbol)
    );

    if (!edge) {
      // No transition found, reject
      events.push({
        time: time++,
        event: 'reject',
        symbolIndex: i,
      });
      return { accepted: false, events };
    }

    // Event: Transition
    events.push({
      time: time++,
      event: 'transition',
      edgeId: edge.id,
      symbol,
      symbolIndex: i,
    });

    currentStateId = edge.target;

    // Event: Enter Next State
    events.push({
      time: time++,
      event: 'enter_state',
      stateId: currentStateId,
      symbolIndex: i + 1,
    });

    events.push({
      time: time++,
      event: 'active_states',
      activeStateIds: [currentStateId],
      symbolIndex: i + 1,
    });
  }

  const finalNode = automaton.nodes.find(n => n.id === currentStateId);
  const accepted = !!finalNode?.isAccept;

  events.push({
    time: time++,
    event: accepted ? 'accept' : 'reject',
    stateId: currentStateId,
    symbolIndex: inputString.length,
  });

  return { accepted, events };
};

/**
 * Simulates a Non-Deterministic Finite Automaton (NFA / ε-NFA)
 */
export const simulateNFA = (automaton: Automaton, inputString: string): SimulationResult => {
  const events: SimulationEvent[] = [];
  let time = 0;

  const startNode = automaton.nodes.find(n => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: 'reject', symbolIndex: 0 }] };
  }

  // 1. Initial State Set (Epsilon closure of start state)
  const initialSet = new Set<string>([startNode.id]);
  const { closure: startClosure, traversedEdges: startEpsilonEdges } = getEpsilonClosureDetailed(automaton, initialSet);
  let activeStates = startClosure;

  events.push({
    time: time++,
    event: 'active_states',
    activeStateIds: Array.from(activeStates),
    symbolIndex: 0,
  });

  // Record initial epsilon transition events
  for (const edgeId of startEpsilonEdges) {
    events.push({
      time: time++,
      event: 'transition',
      edgeId,
      symbol: 'ε',
      symbolIndex: 0,
    });
  }

  // 2. Consume Input Symbols
  for (let i = 0; i < inputString.length; i++) {
    const symbol = inputString[i];
    const nextStates = new Set<string>();
    const traversedEdges = new Set<string>();

    // For each active state, find transitions matching the symbol
    for (const stateId of activeStates) {
      const transitions = automaton.edges.filter(e => 
        e.source === stateId && 
        e.symbols.some(sym => sym === symbol)
      );

      for (const t of transitions) {
        nextStates.add(t.target);
        traversedEdges.add(t.id);
      }
    }

    if (nextStates.size === 0) {
      // Dead end, reject
      events.push({
        time: time++,
        event: 'reject',
        symbolIndex: i,
      });
      return { accepted: false, events };
    }

    // Record the transition events
    for (const edgeId of traversedEdges) {
      events.push({
        time: time++,
        event: 'transition',
        edgeId,
        symbol,
        symbolIndex: i,
      });
    }

    // Get epsilon closure of the newly reached states
    const { closure: nextClosure, traversedEdges: nextEpsilonEdges } = getEpsilonClosureDetailed(automaton, nextStates);
    activeStates = nextClosure;

    events.push({
      time: time++,
      event: 'active_states',
      activeStateIds: Array.from(activeStates),
      symbolIndex: i + 1,
    });

    for (const edgeId of nextEpsilonEdges) {
      events.push({
        time: time++,
        event: 'transition',
        edgeId,
        symbol: 'ε',
        symbolIndex: i + 1,
      });
    }
  }

  // Check if any active state is an accept state
  const acceptStates = automaton.nodes.filter(n => n.isAccept).map(n => n.id);
  const accepted = Array.from(activeStates).some(id => acceptStates.includes(id));

  events.push({
    time: time++,
    event: accepted ? 'accept' : 'reject',
    activeStateIds: Array.from(activeStates),
    symbolIndex: inputString.length,
  });

  return { accepted, events };
};

/**
 * Simulates a Mealy Machine
 * Transition symbols are formatted as "input/output" (e.g., "0/1" or "a/x")
 */
export const simulateMealy = (automaton: Automaton, inputString: string): { outputString: string; events: SimulationEvent[] } => {
  const events: SimulationEvent[] = [];
  let time = 0;
  let outputString = "";

  const startNode = automaton.nodes.find(n => n.isStart);
  if (!startNode) {
    return { outputString: "", events: [{ time: 0, event: 'reject', symbolIndex: 0 }] };
  }

  let currentStateId = startNode.id;

  events.push({
    time: time++,
    event: 'enter_state',
    stateId: currentStateId,
    symbolIndex: 0,
  });

  events.push({
    time: time++,
    event: 'active_states',
    activeStateIds: [currentStateId],
    symbolIndex: 0,
  });

  for (let i = 0; i < inputString.length; i++) {
    const symbol = inputString[i];
    let foundEdge: AutomatonEdge | undefined = undefined;
    let transitionOutput = "";

    for (const edge of automaton.edges) {
      if (edge.source === currentStateId) {
        const match = edge.symbols.find(sym => {
          const parts = sym.split('/');
          return parts[0].trim() === symbol;
        });

        if (match) {
          foundEdge = edge;
          const parts = match.split('/');
          transitionOutput = parts[1] ? parts[1].trim() : "";
          break;
        }
      }
    }

    if (!foundEdge) {
      events.push({ time: time++, event: 'reject', symbolIndex: i });
      return { outputString, events };
    }

    outputString += transitionOutput;

    events.push({
      time: time++,
      event: 'transition',
      edgeId: foundEdge.id,
      symbol: `${symbol}/${transitionOutput}`,
      symbolIndex: i,
    });

    currentStateId = foundEdge.target;

    events.push({
      time: time++,
      event: 'enter_state',
      stateId: currentStateId,
      symbolIndex: i + 1,
    });

    events.push({
      time: time++,
      event: 'active_states',
      activeStateIds: [currentStateId],
      symbolIndex: i + 1,
    });
  }

  events.push({
    time: time++,
    event: 'accept',
    stateId: currentStateId,
    symbolIndex: inputString.length,
  });

  return { outputString, events };
};

/**
 * Simulates a Moore Machine
 * Node labels are formatted as "name/output" (e.g., "q0/1" or "q1/0")
 */
export const simulateMoore = (automaton: Automaton, inputString: string): { outputString: string; events: SimulationEvent[] } => {
  const events: SimulationEvent[] = [];
  let time = 0;
  let outputString = "";

  const startNode = automaton.nodes.find(n => n.isStart);
  if (!startNode) {
    return { outputString: "", events: [{ time: 0, event: 'reject', symbolIndex: 0 }] };
  }

  const getMooreOutput = (node: AutomatonNode): string => {
    const parts = node.label.split('/');
    return parts[1] ? parts[1].trim() : "";
  };

  let currentStateId = startNode.id;
  outputString += getMooreOutput(startNode);

  events.push({
    time: time++,
    event: 'enter_state',
    stateId: currentStateId,
    symbolIndex: 0,
  });

  events.push({
    time: time++,
    event: 'active_states',
    activeStateIds: [currentStateId],
    symbolIndex: 0,
  });

  for (let i = 0; i < inputString.length; i++) {
    const symbol = inputString[i];

    const edge = automaton.edges.find(e => 
      e.source === currentStateId && 
      e.symbols.some(sym => sym.trim() === symbol)
    );

    if (!edge) {
      events.push({ time: time++, event: 'reject', symbolIndex: i });
      return { outputString, events };
    }

    events.push({
      time: time++,
      event: 'transition',
      edgeId: edge.id,
      symbol,
      symbolIndex: i,
    });

    currentStateId = edge.target;
    const targetNode = automaton.nodes.find(n => n.id === currentStateId)!;
    outputString += getMooreOutput(targetNode);

    events.push({
      time: time++,
      event: 'enter_state',
      stateId: currentStateId,
      symbolIndex: i + 1,
    });

    events.push({
      time: time++,
      event: 'active_states',
      activeStateIds: [currentStateId],
      symbolIndex: i + 1,
    });
  }

  events.push({
    time: time++,
    event: 'accept',
    stateId: currentStateId,
    symbolIndex: inputString.length,
  });

  return { outputString, events };
};

/**
 * PDA Simulation state record
 */
export interface PdaStepState {
  stateId: string;
  stack: string[];
  inputIndex: number;
}

/** Whether a PDA path counts as accepting by reaching a designated accept state, or by emptying its stack, once the input is fully consumed. */
export type PdaAcceptanceMode = 'final-state' | 'empty-stack';

interface PdaPathNode {
  stateId: string;
  inputIndex: number;
  stack: string[];
  history: { event: 'enter_state' | 'transition', stateId?: string, edgeId?: string, symbol?: string, symbolIndex: number, stackState: string[] }[];
}

const parsePdaTransitionLabel = (label: string) => {
  const parts = label.split('->');
  if (parts.length !== 2) return null;

  const leftParts = parts[0].split(',');
  if (leftParts.length !== 2) return null;

  const inputSymbol = leftParts[0].trim();
  const popSymbol = leftParts[1].trim();
  const pushSymbols = parts[1].trim()
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => s !== '' && !isEpsilon(s));

  return { inputSymbol, popSymbol, pushSymbols };
};

const isPdaPathAccepting = (path: PdaPathNode, automaton: Automaton, inputString: string, acceptanceMode: PdaAcceptanceMode): boolean => {
  if (path.inputIndex !== inputString.length) return false;
  if (acceptanceMode === 'empty-stack') return path.stack.length === 0;
  return !!automaton.nodes.find(n => n.id === path.stateId)?.isAccept;
};

/**
 * Shared DFS exploration behind `simulatePDA`/`simulatePDAAllBranches`.
 * `collectAllLeaves: false` reproduces the original single-path behavior
 * exactly (stops the instant any accepting configuration is found, so later
 * branches are never explored — matching `simulatePDA`'s historical
 * contract). `collectAllLeaves: true` never short-circuits on acceptance;
 * every accepting configuration and every dead end (no further valid
 * transition) is instead recorded as one leaf of the exploration tree, up to
 * the same `maxSteps` budget.
 */
const explorePDA = (
  automaton: Automaton,
  inputString: string,
  initialStackSymbol: string,
  acceptanceMode: PdaAcceptanceMode,
  collectAllLeaves: boolean
): { successfulPath: PdaPathNode | null; lastVisitedPath: PdaPathNode | null; leaves: { path: PdaPathNode; accepted: boolean }[] } => {
  const startNode = automaton.nodes.find(n => n.isStart);
  const leaves: { path: PdaPathNode; accepted: boolean }[] = [];
  if (!startNode) return { successfulPath: null, lastVisitedPath: null, leaves };

  const queue: PdaPathNode[] = [{
    stateId: startNode.id,
    inputIndex: 0,
    stack: [initialStackSymbol],
    history: [
      { event: 'enter_state', stateId: startNode.id, symbolIndex: 0, stackState: [initialStackSymbol] }
    ]
  }];

  const maxSteps = 1000;
  let steps = 0;
  let successfulPath: PdaPathNode | null = null;
  let lastVisitedPath: PdaPathNode | null = null;

  while (queue.length > 0 && steps++ < maxSteps) {
    const current = queue.pop()!;
    lastVisitedPath = current;

    if (isPdaPathAccepting(current, automaton, inputString, acceptanceMode)) {
      if (!successfulPath) successfulPath = current;
      if (!collectAllLeaves) break;
      leaves.push({ path: current, accepted: true });
      continue;
    }

    const outgoingEdges = automaton.edges.filter(e => e.source === current.stateId);
    let branched = false;

    for (const edge of outgoingEdges) {
      for (const rawSym of edge.symbols) {
        const trans = parsePdaTransitionLabel(rawSym);
        if (!trans) continue;

        const { inputSymbol, popSymbol, pushSymbols } = trans;

        const isEpsInput = isEpsilon(inputSymbol);
        const matchesInput = !isEpsInput && current.inputIndex < inputString.length && inputString[current.inputIndex] === inputSymbol;

        if (!isEpsInput && !matchesInput) continue;

        const isEpsPop = isEpsilon(popSymbol);
        const stackTop = current.stack[0];

        if (!isEpsPop && stackTop !== popSymbol) continue;

        const nextStack = [...current.stack];
        if (!isEpsPop) {
          nextStack.shift();
        }
        nextStack.unshift(...pushSymbols);

        const nextInputIndex = matchesInput ? current.inputIndex + 1 : current.inputIndex;

        const nextHistory = [
          ...current.history,
          { event: 'transition' as const, edgeId: edge.id, symbol: rawSym, symbolIndex: current.inputIndex, stackState: [...nextStack] },
          { event: 'enter_state' as const, stateId: edge.target, symbolIndex: nextInputIndex, stackState: [...nextStack] }
        ];

        queue.push({
          stateId: edge.target,
          inputIndex: nextInputIndex,
          stack: nextStack,
          history: nextHistory
        });
        branched = true;
      }
    }

    if (!branched && collectAllLeaves) leaves.push({ path: current, accepted: false });
  }

  return { successfulPath, lastVisitedPath, leaves };
};

const mapPdaPathToEvents = (path: PdaPathNode, accepted: boolean): SimulationEvent[] => {
  let time = 0;
  const mappedEvents: SimulationEvent[] = path.history.map((h) => ({
    time: time++,
    event: h.event,
    stateId: h.stateId,
    edgeId: h.edgeId,
    symbol: h.symbol,
    symbolIndex: h.symbolIndex,
    stack: h.stackState
  }));

  mappedEvents.push({
    time: time++,
    event: accepted ? 'accept' : 'reject',
    stateId: path.stateId,
    symbolIndex: path.inputIndex,
    stack: path.stack
  });

  return mappedEvents;
};

/**
 * Simulates a Pushdown Automaton (PDA)
 * Edges labels format: "input, pop -> push" (e.g. "a, Z -> A Z" or "b, A -> ε")
 */
export const simulatePDA = (automaton: Automaton, inputString: string, initialStackSymbol: string = 'Z', acceptanceMode: PdaAcceptanceMode = 'final-state'): SimulationResult => {
  const startNode = automaton.nodes.find(n => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: 'reject', symbolIndex: 0 }] };
  }

  const { successfulPath, lastVisitedPath } = explorePDA(automaton, inputString, initialStackSymbol, acceptanceMode, false);

  const finalPath = successfulPath || lastVisitedPath;
  if (!finalPath) {
    return { accepted: false, events: [{ time: 0, event: 'reject', symbolIndex: 0 }] };
  }

  const accepted = !!successfulPath;

  return {
    accepted,
    events: mapPdaPathToEvents(finalPath, accepted)
  };
};

/** One fully-explored PDA path — accepted or a dead end — returned by `simulatePDAAllBranches`. */
export interface PdaBranchResult {
  accepted: boolean;
  events: SimulationEvent[];
}

/**
 * Explores every branch of a (possibly nondeterministic) PDA's execution, up
 * to the same step budget `simulatePDA` uses internally, and returns each
 * complete path found — not just the first success or the last path visited.
 * The live canvas animation keeps using `simulatePDA` unchanged; this is a
 * read-only, additional view onto the same exploration for visualization
 * (e.g. listing/comparing branches) so it can't affect simulation playback.
 */
export const simulatePDAAllBranches = (
  automaton: Automaton,
  inputString: string,
  initialStackSymbol: string = 'Z',
  acceptanceMode: PdaAcceptanceMode = 'final-state'
): PdaBranchResult[] => {
  const startNode = automaton.nodes.find(n => n.isStart);
  if (!startNode) return [{ accepted: false, events: [{ time: 0, event: 'reject', symbolIndex: 0 }] }];

  const { leaves } = explorePDA(automaton, inputString, initialStackSymbol, acceptanceMode, true);
  if (!leaves.length) return [{ accepted: false, events: [{ time: 0, event: 'reject', symbolIndex: 0 }] }];

  return leaves.map(({ path, accepted }) => ({ accepted, events: mapPdaPathToEvents(path, accepted) }));
};

/**
 * Simulates a Turing Machine
 * Edges labels format: "read -> write, direction" (e.g. "0 -> 0, R" or "_ -> 1, L")
 */
export const simulateTuringMachine = (
  automaton: Automaton,
  inputString: string,
  blankSymbol: string = '_',
  options?: { tapeBound?: 'input-length' | number }
): SimulationResult => {
  const events: SimulationEvent[] = [];
  let time = 0;
  // A Linear Bounded Automaton is a TM whose tape is restricted to (a linear
  // multiple of) the input's own length — `'input-length'` is the standard
  // single-tape-cell-per-input-symbol case. `null` means unbounded (default,
  // ordinary TM behavior).
  const tapeBound = options?.tapeBound === undefined
    ? null
    : options.tapeBound === 'input-length'
      ? Math.max(inputString.length, 1)
      : options.tapeBound;

  const startNode = automaton.nodes.find(n => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: 'reject', symbolIndex: 0 }] };
  }

  const parseTmTransition = (label: string) => {
    const parts = label.split('->');
    if (parts.length !== 2) return null;

    const readSymbol = parts[0].trim();
    const rightParts = parts[1].split(',');
    if (rightParts.length !== 2) return null;

    const writeSymbol = rightParts[0].trim();
    const direction = rightParts[1].trim().toUpperCase() as 'L' | 'R' | 'S';

    return {
      readSymbol,
      writeSymbol,
      direction
    };
  };

  const tape: Record<number, string> = {};
  for (let i = 0; i < inputString.length; i++) {
    tape[i] = inputString[i];
  }

  let currentStateId = startNode.id;
  let headIndex = 0;

  const maxSteps = 1000;
  let steps = 0;
  let halted = false;
  let accepted = false;

  const getTapeChar = (idx: number): string => {
    return tape[idx] === undefined ? blankSymbol : tape[idx];
  };

  events.push({
    time: time++,
    event: 'enter_state',
    stateId: currentStateId,
    symbolIndex: 0,
    tape: { ...tape },
    headIndex
  });

  events.push({
    time: time++,
    event: 'active_states',
    activeStateIds: [currentStateId],
    symbolIndex: 0,
    tape: { ...tape },
    headIndex
  });

  while (steps++ < maxSteps && !halted) {
    const currentNode = automaton.nodes.find(n => n.id === currentStateId);
    if (currentNode?.isAccept) {
      accepted = true;
      halted = true;
      break;
    }
    if (currentNode?.isReject) {
      halted = true;
      break;
    }

    const currentSymbol = getTapeChar(headIndex);
    let foundEdge: AutomatonEdge | undefined = undefined;
    let matchTrans = null;

    const outgoingEdges = automaton.edges.filter(e => e.source === currentStateId);
    for (const edge of outgoingEdges) {
      const match = edge.symbols.find(sym => {
        const trans = parseTmTransition(sym);
        return trans !== null && trans.readSymbol === currentSymbol;
      });

      if (match) {
        foundEdge = edge;
        matchTrans = parseTmTransition(match)!;
        break;
      }
    }

    if (!foundEdge || !matchTrans) {
      halted = true;
      break;
    }

    tape[headIndex] = matchTrans.writeSymbol;

    let nextHeadIndex = headIndex;
    if (matchTrans.direction === 'L') {
      nextHeadIndex--;
    } else if (matchTrans.direction === 'R') {
      nextHeadIndex++;
    }

    if (tapeBound !== null && (nextHeadIndex < 0 || nextHeadIndex >= tapeBound)) {
      // LBA convention: a move that would leave the bounded tape region halts
      // and rejects, rather than continuing on an unbounded tape.
      halted = true;
      break;
    }
    headIndex = nextHeadIndex;

    events.push({
      time: time++,
      event: 'transition',
      edgeId: foundEdge.id,
      symbol: `${currentSymbol}->${matchTrans.writeSymbol},${matchTrans.direction}`,
      symbolIndex: headIndex,
      tape: { ...tape },
      headIndex
    });

    currentStateId = foundEdge.target;

    events.push({
      time: time++,
      event: 'enter_state',
      stateId: currentStateId,
      symbolIndex: headIndex,
      tape: { ...tape },
      headIndex
    });

    events.push({
      time: time++,
      event: 'active_states',
      activeStateIds: [currentStateId],
      symbolIndex: headIndex,
      tape: { ...tape },
      headIndex
    });
  }

  const finalNode = automaton.nodes.find(n => n.id === currentStateId);
  const isFinalAccepted = accepted || !!finalNode?.isAccept;

  events.push({
    time: time++,
    event: isFinalAccepted ? 'accept' : 'reject',
    stateId: currentStateId,
    symbolIndex: headIndex,
    tape: { ...tape },
    headIndex
  });

  return {
    accepted: isFinalAccepted,
    events
  };
};

/** A Linear Bounded Automaton: a Turing machine whose tape is restricted to exactly the input's length. */
export const simulateLBA = (automaton: Automaton, inputString: string, blankSymbol: string = '_'): SimulationResult =>
  simulateTuringMachine(automaton, inputString, blankSymbol, { tapeBound: 'input-length' });

/**
 * Parses a multi-tape TM transition label: `r1,r2,...,rN -> w1,w2,...,wN ; d1,d2,...,dN`
 * (one transition per edge — see `transitionParser.ts`'s `parseMultiTapeTmTransitionParts`,
 * the UI-facing counterpart to this simulation-facing parser).
 */
const parseMultiTapeTmTransition = (label: string, tapeCount: number) => {
  const match = label.match(/^\s*(.*?)\s*->\s*(.*?)\s*;\s*(.*?)\s*$/);
  if (!match) return null;

  const reads = match[1].split(',').map(s => s.trim());
  const writes = match[2].split(',').map(s => s.trim());
  const directions = match[3].split(',').map(s => s.trim().toUpperCase());

  if (reads.length !== tapeCount || writes.length !== tapeCount || directions.length !== tapeCount) return null;
  if (!directions.every(d => d === 'L' || d === 'R' || d === 'S')) return null;

  return { reads, writes, directions: directions as ('L' | 'R' | 'S')[] };
};

/**
 * Simulates a multi-tape Turing Machine: `tapeCount` independent tapes/heads
 * stepped in lockstep by one transition per step. Tape 0 seeds from
 * `inputString` (the standard convention); every other tape starts blank.
 * Single-tape `simulateTuringMachine` is untouched — this is a separate
 * opt-in path used only when a machine declares `tapeCount > 1`.
 */
export const simulateMultiTapeTuringMachine = (
  automaton: Automaton,
  inputString: string,
  tapeCount: number,
  blankSymbol: string = '_'
): SimulationResult => {
  const events: SimulationEvent[] = [];
  let time = 0;

  const startNode = automaton.nodes.find(n => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: 'reject', symbolIndex: 0 }] };
  }

  const tapes: Record<number, string>[] = Array.from({ length: tapeCount }, () => ({}));
  for (let i = 0; i < inputString.length; i++) tapes[0][i] = inputString[i];

  let currentStateId = startNode.id;
  const headIndices = Array(tapeCount).fill(0);

  const maxSteps = 1000;
  let steps = 0;
  let halted = false;
  let accepted = false;

  const getTapeChar = (tapeIdx: number, headIdx: number): string => tapes[tapeIdx][headIdx] === undefined ? blankSymbol : tapes[tapeIdx][headIdx];
  const snapshotTapes = (): Record<number, string>[] => tapes.map(t => ({ ...t }));

  events.push({ time: time++, event: 'enter_state', stateId: currentStateId, symbolIndex: 0, tapes: snapshotTapes(), headIndices: [...headIndices] });
  events.push({ time: time++, event: 'active_states', activeStateIds: [currentStateId], symbolIndex: 0, tapes: snapshotTapes(), headIndices: [...headIndices] });

  while (steps++ < maxSteps && !halted) {
    const currentNode = automaton.nodes.find(n => n.id === currentStateId);
    if (currentNode?.isAccept) { accepted = true; halted = true; break; }
    if (currentNode?.isReject) { halted = true; break; }

    const currentSymbols = headIndices.map((headIdx, tapeIdx) => getTapeChar(tapeIdx, headIdx));
    let foundEdge: AutomatonEdge | undefined;
    let matchTrans: ReturnType<typeof parseMultiTapeTmTransition> = null;

    const outgoingEdges = automaton.edges.filter(e => e.source === currentStateId);
    for (const edge of outgoingEdges) {
      for (const sym of edge.symbols) {
        const trans = parseMultiTapeTmTransition(sym, tapeCount);
        if (trans && trans.reads.every((r, i) => r === currentSymbols[i])) {
          foundEdge = edge;
          matchTrans = trans;
          break;
        }
      }
      if (foundEdge) break;
    }

    if (!foundEdge || !matchTrans) { halted = true; break; }

    for (let i = 0; i < tapeCount; i++) {
      tapes[i][headIndices[i]] = matchTrans.writes[i];
      if (matchTrans.directions[i] === 'L') headIndices[i]--;
      else if (matchTrans.directions[i] === 'R') headIndices[i]++;
    }

    events.push({
      time: time++,
      event: 'transition',
      edgeId: foundEdge.id,
      symbol: `${currentSymbols.join(',')}->${matchTrans.writes.join(',')};${matchTrans.directions.join(',')}`,
      symbolIndex: headIndices[0],
      tapes: snapshotTapes(),
      headIndices: [...headIndices]
    });

    currentStateId = foundEdge.target;

    events.push({ time: time++, event: 'enter_state', stateId: currentStateId, symbolIndex: headIndices[0], tapes: snapshotTapes(), headIndices: [...headIndices] });
    events.push({ time: time++, event: 'active_states', activeStateIds: [currentStateId], symbolIndex: headIndices[0], tapes: snapshotTapes(), headIndices: [...headIndices] });
  }

  const finalNode = automaton.nodes.find(n => n.id === currentStateId);
  const isFinalAccepted = accepted || !!finalNode?.isAccept;

  events.push({ time: time++, event: isFinalAccepted ? 'accept' : 'reject', stateId: currentStateId, symbolIndex: headIndices[0], tapes: snapshotTapes(), headIndices: [...headIndices] });

  return { accepted: isFinalAccepted, events };
};

/** Automaton types whose acceptance behavior can be batch-tested via a plain input string. */
export type BatchTestableType = 'DFA' | 'NFA' | 'PDA' | 'TM';

export interface BatchTestResult {
  input: string;
  accepted: boolean;
}

/**
 * Runs a fixed list of input strings against an automaton and reports
 * accept/reject per string, dispatching to the matching simulator. Shared by
 * semantic grading (compare a submission's behavior against a reference
 * solution) and batch mode (run many inputs at once).
 */
export const runBatchTests = (
  automaton: Automaton,
  type: BatchTestableType,
  inputs: string[]
): BatchTestResult[] => {
  const simulate =
    type === 'DFA' ? simulateDFA :
    type === 'NFA' ? simulateNFA :
    type === 'PDA' ? simulatePDA :
    simulateTuringMachine;

  return inputs.map(input => {
    try {
      return { input, accepted: simulate(automaton, input).accepted };
    } catch {
      return { input, accepted: false };
    }
  });
};
