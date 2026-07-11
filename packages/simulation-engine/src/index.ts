export interface AutomatonNode {
  id: string;
  label: string;
  isStart: boolean;
  isAccept: boolean;
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
}

export interface SimulationEvent {
  time: number;
  event: 'enter_state' | 'transition' | 'active_states' | 'accept' | 'reject';
  stateId?: string;           // state being entered
  activeStateIds?: string[];  // active states (primarily for NFA)
  edgeId?: string;            // edge traversed
  symbol?: string;            // symbol read
  symbolIndex?: number;       // character index in the input string
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

  // Epsilon closure helper
  const getEpsilonClosure = (states: Set<string>): { closure: Set<string>, traversedEdges: Set<string> } => {
    const closure = new Set<string>(states);
    const queue = Array.from(states);
    const traversedEdges = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      // Find all epsilon transitions from current
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

  // 1. Initial State Set (Epsilon closure of start state)
  const initialSet = new Set<string>([startNode.id]);
  const { closure: startClosure, traversedEdges: startEpsilonEdges } = getEpsilonClosure(initialSet);
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
    const { closure: nextClosure, traversedEdges: nextEpsilonEdges } = getEpsilonClosure(nextStates);
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

/**
 * Simulates a Pushdown Automaton (PDA)
 * Edges labels format: "input, pop -> push" (e.g. "a, Z -> A Z" or "b, A -> ε")
 */
export const simulatePDA = (automaton: Automaton, inputString: string, initialStackSymbol: string = 'Z'): SimulationResult => {
  let time = 0;

  const startNode = automaton.nodes.find(n => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: 'reject', symbolIndex: 0 }] };
  }

  const parsePdaTransition = (label: string) => {
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

    return {
      inputSymbol,
      popSymbol,
      pushSymbols
    };
  };

  interface PathNode {
    stateId: string;
    inputIndex: number;
    stack: string[];
    history: { event: 'enter_state' | 'transition', stateId?: string, edgeId?: string, symbol?: string, symbolIndex: number, stackState: string[] }[];
  }

  const queue: PathNode[] = [{
    stateId: startNode.id,
    inputIndex: 0,
    stack: [initialStackSymbol],
    history: [
      { event: 'enter_state', stateId: startNode.id, symbolIndex: 0, stackState: [initialStackSymbol] }
    ]
  }];

  const maxSteps = 1000;
  let steps = 0;
  let successfulPath: PathNode | null = null;
  let lastFailedPath: PathNode | null = null;

  while (queue.length > 0 && steps++ < maxSteps) {
    const current = queue.pop()!;
    lastFailedPath = current;

    const currentNode = automaton.nodes.find(n => n.id === current.stateId);
    if (current.inputIndex === inputString.length && currentNode?.isAccept) {
      successfulPath = current;
      break;
    }

    const outgoingEdges = automaton.edges.filter(e => e.source === current.stateId);

    for (const edge of outgoingEdges) {
      for (const rawSym of edge.symbols) {
        const trans = parsePdaTransition(rawSym);
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
      }
    }
  }

  const finalPath = successfulPath || lastFailedPath;
  if (!finalPath) {
    return { accepted: false, events: [{ time: 0, event: 'reject', symbolIndex: 0 }] };
  }

  const mappedEvents: any[] = finalPath.history.map((h) => ({
    time: time++,
    event: h.event,
    stateId: h.stateId,
    edgeId: h.edgeId,
    symbol: h.symbol,
    symbolIndex: h.symbolIndex,
    stack: h.stackState
  }));

  const accepted = !!successfulPath;
  mappedEvents.push({
    time: time++,
    event: accepted ? 'accept' : 'reject',
    stateId: finalPath.stateId,
    symbolIndex: finalPath.inputIndex,
    stack: finalPath.stack
  });

  return {
    accepted,
    events: mappedEvents
  };
};

/**
 * Simulates a Turing Machine
 * Edges labels format: "read -> write, direction" (e.g. "0 -> 0, R" or "_ -> 1, L")
 */
export const simulateTuringMachine = (automaton: Automaton, inputString: string, blankSymbol: string = '_'): SimulationResult => {
  const events: SimulationEvent[] = [];
  let time = 0;

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
  } as any);

  events.push({
    time: time++,
    event: 'active_states',
    activeStateIds: [currentStateId],
    symbolIndex: 0,
    tape: { ...tape },
    headIndex
  } as any);

  while (steps++ < maxSteps && !halted) {
    const currentNode = automaton.nodes.find(n => n.id === currentStateId);
    if (currentNode?.isAccept) {
      accepted = true;
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

    if (matchTrans.direction === 'L') {
      headIndex--;
    } else if (matchTrans.direction === 'R') {
      headIndex++;
    }

    events.push({
      time: time++,
      event: 'transition',
      edgeId: foundEdge.id,
      symbol: `${currentSymbol}->${matchTrans.writeSymbol},${matchTrans.direction}`,
      symbolIndex: headIndex,
      tape: { ...tape },
      headIndex
    } as any);

    currentStateId = foundEdge.target;

    events.push({
      time: time++,
      event: 'enter_state',
      stateId: currentStateId,
      symbolIndex: headIndex,
      tape: { ...tape },
      headIndex
    } as any);

    events.push({
      time: time++,
      event: 'active_states',
      activeStateIds: [currentStateId],
      symbolIndex: headIndex,
      tape: { ...tape },
      headIndex
    } as any);
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
  } as any);

  return {
    accepted: isFinalAccepted,
    events
  };
};
