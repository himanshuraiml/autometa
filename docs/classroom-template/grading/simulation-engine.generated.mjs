// AUTO-GENERATED from packages/simulation-engine/src/index.ts — do not edit; regenerate via 'bun run build:grading-template'.

// packages/simulation-engine/src/index.ts
var AUTOMATON_SCHEMA_VERSION = 1;
var stampAutomatonSchema = (automaton) => ({
  ...automaton,
  schemaVersion: AUTOMATON_SCHEMA_VERSION
});
var migrateAutomatonSchema = (value) => {
  if (!value || typeof value !== "object")
    throw new Error("Automaton data must be a JSON object.");
  const data = value;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges))
    throw new Error("Automaton data must contain nodes and edges arrays.");
  if (data.schemaVersion !== undefined && data.schemaVersion !== AUTOMATON_SCHEMA_VERSION) {
    throw new Error(`Unsupported automaton schema version: ${String(data.schemaVersion)}.`);
  }
  return { nodes: data.nodes, edges: data.edges, schemaVersion: AUTOMATON_SCHEMA_VERSION };
};
var isEpsilon = (symbol) => {
  const s = symbol.trim().toLowerCase();
  return s === "" || s === "ε" || s === "epsilon" || s === "λ" || s === "lambda";
};
var getEpsilonClosureDetailed = (automaton, states) => {
  const closure = new Set(states);
  const queue = Array.from(closure);
  const traversedEdges = new Set;
  while (queue.length > 0) {
    const current = queue.shift();
    const epsilonEdges = automaton.edges.filter((e) => e.source === current && e.symbols.some(isEpsilon));
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
var getEpsilonClosure = (automaton, states) => getEpsilonClosureDetailed(automaton, states).closure;
var simulateDFA = (automaton, inputString) => {
  const events = [];
  let time = 0;
  const startNode = automaton.nodes.find((n) => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: "reject", symbolIndex: 0 }] };
  }
  let currentStateId = startNode.id;
  events.push({
    time: time++,
    event: "enter_state",
    stateId: currentStateId,
    symbolIndex: 0
  });
  events.push({
    time: time++,
    event: "active_states",
    activeStateIds: [currentStateId],
    symbolIndex: 0
  });
  for (let i = 0;i < inputString.length; i++) {
    const symbol = inputString[i];
    const edge = automaton.edges.find((e) => e.source === currentStateId && e.symbols.some((sym) => sym === symbol));
    if (!edge) {
      events.push({
        time: time++,
        event: "reject",
        symbolIndex: i
      });
      return { accepted: false, events };
    }
    events.push({
      time: time++,
      event: "transition",
      edgeId: edge.id,
      symbol,
      symbolIndex: i
    });
    currentStateId = edge.target;
    events.push({
      time: time++,
      event: "enter_state",
      stateId: currentStateId,
      symbolIndex: i + 1
    });
    events.push({
      time: time++,
      event: "active_states",
      activeStateIds: [currentStateId],
      symbolIndex: i + 1
    });
  }
  const finalNode = automaton.nodes.find((n) => n.id === currentStateId);
  const accepted = !!finalNode?.isAccept;
  events.push({
    time: time++,
    event: accepted ? "accept" : "reject",
    stateId: currentStateId,
    symbolIndex: inputString.length
  });
  return { accepted, events };
};
var simulateNFA = (automaton, inputString) => {
  const events = [];
  let time = 0;
  const startNode = automaton.nodes.find((n) => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: "reject", symbolIndex: 0 }] };
  }
  const initialSet = new Set([startNode.id]);
  const { closure: startClosure, traversedEdges: startEpsilonEdges } = getEpsilonClosureDetailed(automaton, initialSet);
  let activeStates = startClosure;
  events.push({
    time: time++,
    event: "active_states",
    activeStateIds: Array.from(activeStates),
    symbolIndex: 0
  });
  for (const edgeId of startEpsilonEdges) {
    events.push({
      time: time++,
      event: "transition",
      edgeId,
      symbol: "ε",
      symbolIndex: 0
    });
  }
  for (let i = 0;i < inputString.length; i++) {
    const symbol = inputString[i];
    const nextStates = new Set;
    const traversedEdges = new Set;
    for (const stateId of activeStates) {
      const transitions = automaton.edges.filter((e) => e.source === stateId && e.symbols.some((sym) => sym === symbol));
      for (const t of transitions) {
        nextStates.add(t.target);
        traversedEdges.add(t.id);
      }
    }
    if (nextStates.size === 0) {
      events.push({
        time: time++,
        event: "reject",
        symbolIndex: i
      });
      return { accepted: false, events };
    }
    for (const edgeId of traversedEdges) {
      events.push({
        time: time++,
        event: "transition",
        edgeId,
        symbol,
        symbolIndex: i
      });
    }
    const { closure: nextClosure, traversedEdges: nextEpsilonEdges } = getEpsilonClosureDetailed(automaton, nextStates);
    activeStates = nextClosure;
    events.push({
      time: time++,
      event: "active_states",
      activeStateIds: Array.from(activeStates),
      symbolIndex: i + 1
    });
    for (const edgeId of nextEpsilonEdges) {
      events.push({
        time: time++,
        event: "transition",
        edgeId,
        symbol: "ε",
        symbolIndex: i + 1
      });
    }
  }
  const acceptStates = automaton.nodes.filter((n) => n.isAccept).map((n) => n.id);
  const accepted = Array.from(activeStates).some((id) => acceptStates.includes(id));
  events.push({
    time: time++,
    event: accepted ? "accept" : "reject",
    activeStateIds: Array.from(activeStates),
    symbolIndex: inputString.length
  });
  return { accepted, events };
};
var simulateMealy = (automaton, inputString) => {
  const events = [];
  let time = 0;
  let outputString = "";
  const startNode = automaton.nodes.find((n) => n.isStart);
  if (!startNode) {
    return { outputString: "", events: [{ time: 0, event: "reject", symbolIndex: 0 }] };
  }
  let currentStateId = startNode.id;
  events.push({
    time: time++,
    event: "enter_state",
    stateId: currentStateId,
    symbolIndex: 0
  });
  events.push({
    time: time++,
    event: "active_states",
    activeStateIds: [currentStateId],
    symbolIndex: 0
  });
  for (let i = 0;i < inputString.length; i++) {
    const symbol = inputString[i];
    let foundEdge = undefined;
    let transitionOutput = "";
    for (const edge of automaton.edges) {
      if (edge.source === currentStateId) {
        const match = edge.symbols.find((sym) => {
          const parts = sym.split("/");
          return parts[0].trim() === symbol;
        });
        if (match) {
          foundEdge = edge;
          const parts = match.split("/");
          transitionOutput = parts[1] ? parts[1].trim() : "";
          break;
        }
      }
    }
    if (!foundEdge) {
      events.push({ time: time++, event: "reject", symbolIndex: i });
      return { outputString, events };
    }
    outputString += transitionOutput;
    events.push({
      time: time++,
      event: "transition",
      edgeId: foundEdge.id,
      symbol: `${symbol}/${transitionOutput}`,
      symbolIndex: i
    });
    currentStateId = foundEdge.target;
    events.push({
      time: time++,
      event: "enter_state",
      stateId: currentStateId,
      symbolIndex: i + 1
    });
    events.push({
      time: time++,
      event: "active_states",
      activeStateIds: [currentStateId],
      symbolIndex: i + 1
    });
  }
  events.push({
    time: time++,
    event: "accept",
    stateId: currentStateId,
    symbolIndex: inputString.length
  });
  return { outputString, events };
};
var simulateMoore = (automaton, inputString) => {
  const events = [];
  let time = 0;
  let outputString = "";
  const startNode = automaton.nodes.find((n) => n.isStart);
  if (!startNode) {
    return { outputString: "", events: [{ time: 0, event: "reject", symbolIndex: 0 }] };
  }
  const getMooreOutput = (node) => {
    const parts = node.label.split("/");
    return parts[1] ? parts[1].trim() : "";
  };
  let currentStateId = startNode.id;
  outputString += getMooreOutput(startNode);
  events.push({
    time: time++,
    event: "enter_state",
    stateId: currentStateId,
    symbolIndex: 0
  });
  events.push({
    time: time++,
    event: "active_states",
    activeStateIds: [currentStateId],
    symbolIndex: 0
  });
  for (let i = 0;i < inputString.length; i++) {
    const symbol = inputString[i];
    const edge = automaton.edges.find((e) => e.source === currentStateId && e.symbols.some((sym) => sym.trim() === symbol));
    if (!edge) {
      events.push({ time: time++, event: "reject", symbolIndex: i });
      return { outputString, events };
    }
    events.push({
      time: time++,
      event: "transition",
      edgeId: edge.id,
      symbol,
      symbolIndex: i
    });
    currentStateId = edge.target;
    const targetNode = automaton.nodes.find((n) => n.id === currentStateId);
    outputString += getMooreOutput(targetNode);
    events.push({
      time: time++,
      event: "enter_state",
      stateId: currentStateId,
      symbolIndex: i + 1
    });
    events.push({
      time: time++,
      event: "active_states",
      activeStateIds: [currentStateId],
      symbolIndex: i + 1
    });
  }
  events.push({
    time: time++,
    event: "accept",
    stateId: currentStateId,
    symbolIndex: inputString.length
  });
  return { outputString, events };
};
var parsePdaTransitionLabel = (label) => {
  const parts = label.split("->");
  if (parts.length !== 2)
    return null;
  const leftParts = parts[0].split(",");
  if (leftParts.length !== 2)
    return null;
  const inputSymbol = leftParts[0].trim();
  const popSymbol = leftParts[1].trim();
  const pushSymbols = parts[1].trim().split(/\s+/).map((s) => s.trim()).filter((s) => s !== "" && !isEpsilon(s));
  return { inputSymbol, popSymbol, pushSymbols };
};
var isPdaPathAccepting = (path, automaton, inputString, acceptanceMode) => {
  if (path.inputIndex !== inputString.length)
    return false;
  if (acceptanceMode === "empty-stack")
    return path.stack.length === 0;
  return !!automaton.nodes.find((n) => n.id === path.stateId)?.isAccept;
};
var explorePDA = (automaton, inputString, initialStackSymbol, acceptanceMode, collectAllLeaves) => {
  const startNode = automaton.nodes.find((n) => n.isStart);
  const leaves = [];
  if (!startNode)
    return { successfulPath: null, lastVisitedPath: null, leaves };
  const queue = [{
    stateId: startNode.id,
    inputIndex: 0,
    stack: [initialStackSymbol],
    history: [
      { event: "enter_state", stateId: startNode.id, symbolIndex: 0, stackState: [initialStackSymbol] }
    ]
  }];
  const maxSteps = 1000;
  let steps = 0;
  let successfulPath = null;
  let lastVisitedPath = null;
  while (queue.length > 0 && steps++ < maxSteps) {
    const current = queue.pop();
    lastVisitedPath = current;
    if (isPdaPathAccepting(current, automaton, inputString, acceptanceMode)) {
      if (!successfulPath)
        successfulPath = current;
      if (!collectAllLeaves)
        break;
      leaves.push({ path: current, accepted: true });
      continue;
    }
    const outgoingEdges = automaton.edges.filter((e) => e.source === current.stateId);
    let branched = false;
    for (const edge of outgoingEdges) {
      for (const rawSym of edge.symbols) {
        const trans = parsePdaTransitionLabel(rawSym);
        if (!trans)
          continue;
        const { inputSymbol, popSymbol, pushSymbols } = trans;
        const isEpsInput = isEpsilon(inputSymbol);
        const matchesInput = !isEpsInput && current.inputIndex < inputString.length && inputString[current.inputIndex] === inputSymbol;
        if (!isEpsInput && !matchesInput)
          continue;
        const isEpsPop = isEpsilon(popSymbol);
        const stackTop = current.stack[0];
        if (!isEpsPop && stackTop !== popSymbol)
          continue;
        const nextStack = [...current.stack];
        if (!isEpsPop) {
          nextStack.shift();
        }
        nextStack.unshift(...pushSymbols);
        const nextInputIndex = matchesInput ? current.inputIndex + 1 : current.inputIndex;
        const nextHistory = [
          ...current.history,
          { event: "transition", edgeId: edge.id, symbol: rawSym, symbolIndex: current.inputIndex, stackState: [...nextStack] },
          { event: "enter_state", stateId: edge.target, symbolIndex: nextInputIndex, stackState: [...nextStack] }
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
    if (!branched && collectAllLeaves)
      leaves.push({ path: current, accepted: false });
  }
  return { successfulPath, lastVisitedPath, leaves };
};
var mapPdaPathToEvents = (path, accepted) => {
  let time = 0;
  const mappedEvents = path.history.map((h) => ({
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
    event: accepted ? "accept" : "reject",
    stateId: path.stateId,
    symbolIndex: path.inputIndex,
    stack: path.stack
  });
  return mappedEvents;
};
var simulatePDA = (automaton, inputString, initialStackSymbol = "Z", acceptanceMode = "final-state") => {
  const startNode = automaton.nodes.find((n) => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: "reject", symbolIndex: 0 }] };
  }
  const { successfulPath, lastVisitedPath } = explorePDA(automaton, inputString, initialStackSymbol, acceptanceMode, false);
  const finalPath = successfulPath || lastVisitedPath;
  if (!finalPath) {
    return { accepted: false, events: [{ time: 0, event: "reject", symbolIndex: 0 }] };
  }
  const accepted = !!successfulPath;
  return {
    accepted,
    events: mapPdaPathToEvents(finalPath, accepted)
  };
};
var simulatePDAAllBranches = (automaton, inputString, initialStackSymbol = "Z", acceptanceMode = "final-state") => {
  const startNode = automaton.nodes.find((n) => n.isStart);
  if (!startNode)
    return [{ accepted: false, events: [{ time: 0, event: "reject", symbolIndex: 0 }] }];
  const { leaves } = explorePDA(automaton, inputString, initialStackSymbol, acceptanceMode, true);
  if (!leaves.length)
    return [{ accepted: false, events: [{ time: 0, event: "reject", symbolIndex: 0 }] }];
  return leaves.map(({ path, accepted }) => ({ accepted, events: mapPdaPathToEvents(path, accepted) }));
};
var simulateTuringMachine = (automaton, inputString, blankSymbol = "_", options) => {
  const events = [];
  let time = 0;
  const tapeBound = options?.tapeBound === undefined ? null : options.tapeBound === "input-length" ? Math.max(inputString.length, 1) : options.tapeBound;
  const startNode = automaton.nodes.find((n) => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: "reject", symbolIndex: 0 }] };
  }
  const parseTmTransition = (label) => {
    const parts = label.split("->");
    if (parts.length !== 2)
      return null;
    const readSymbol = parts[0].trim();
    const rightParts = parts[1].split(",");
    if (rightParts.length !== 2)
      return null;
    const writeSymbol = rightParts[0].trim();
    const direction = rightParts[1].trim().toUpperCase();
    return {
      readSymbol,
      writeSymbol,
      direction
    };
  };
  const tape = {};
  for (let i = 0;i < inputString.length; i++) {
    tape[i] = inputString[i];
  }
  let currentStateId = startNode.id;
  let headIndex = 0;
  const maxSteps = 1000;
  let steps = 0;
  let halted = false;
  let accepted = false;
  const getTapeChar = (idx) => {
    return tape[idx] === undefined ? blankSymbol : tape[idx];
  };
  events.push({
    time: time++,
    event: "enter_state",
    stateId: currentStateId,
    symbolIndex: 0,
    tape: { ...tape },
    headIndex
  });
  events.push({
    time: time++,
    event: "active_states",
    activeStateIds: [currentStateId],
    symbolIndex: 0,
    tape: { ...tape },
    headIndex
  });
  while (steps++ < maxSteps && !halted) {
    const currentNode = automaton.nodes.find((n) => n.id === currentStateId);
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
    let foundEdge = undefined;
    let matchTrans = null;
    const outgoingEdges = automaton.edges.filter((e) => e.source === currentStateId);
    for (const edge of outgoingEdges) {
      const match = edge.symbols.find((sym) => {
        const trans = parseTmTransition(sym);
        return trans !== null && trans.readSymbol === currentSymbol;
      });
      if (match) {
        foundEdge = edge;
        matchTrans = parseTmTransition(match);
        break;
      }
    }
    if (!foundEdge || !matchTrans) {
      halted = true;
      break;
    }
    tape[headIndex] = matchTrans.writeSymbol;
    let nextHeadIndex = headIndex;
    if (matchTrans.direction === "L") {
      nextHeadIndex--;
    } else if (matchTrans.direction === "R") {
      nextHeadIndex++;
    }
    if (tapeBound !== null && (nextHeadIndex < 0 || nextHeadIndex >= tapeBound)) {
      halted = true;
      break;
    }
    headIndex = nextHeadIndex;
    events.push({
      time: time++,
      event: "transition",
      edgeId: foundEdge.id,
      symbol: `${currentSymbol}->${matchTrans.writeSymbol},${matchTrans.direction}`,
      symbolIndex: headIndex,
      tape: { ...tape },
      headIndex
    });
    currentStateId = foundEdge.target;
    events.push({
      time: time++,
      event: "enter_state",
      stateId: currentStateId,
      symbolIndex: headIndex,
      tape: { ...tape },
      headIndex
    });
    events.push({
      time: time++,
      event: "active_states",
      activeStateIds: [currentStateId],
      symbolIndex: headIndex,
      tape: { ...tape },
      headIndex
    });
  }
  const finalNode = automaton.nodes.find((n) => n.id === currentStateId);
  const isFinalAccepted = accepted || !!finalNode?.isAccept;
  events.push({
    time: time++,
    event: isFinalAccepted ? "accept" : "reject",
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
var simulateLBA = (automaton, inputString, blankSymbol = "_") => simulateTuringMachine(automaton, inputString, blankSymbol, { tapeBound: "input-length" });
var parseMultiTapeTmTransition = (label, tapeCount) => {
  const match = label.match(/^\s*(.*?)\s*->\s*(.*?)\s*;\s*(.*?)\s*$/);
  if (!match)
    return null;
  const reads = match[1].split(",").map((s) => s.trim());
  const writes = match[2].split(",").map((s) => s.trim());
  const directions = match[3].split(",").map((s) => s.trim().toUpperCase());
  if (reads.length !== tapeCount || writes.length !== tapeCount || directions.length !== tapeCount)
    return null;
  if (!directions.every((d) => d === "L" || d === "R" || d === "S"))
    return null;
  return { reads, writes, directions };
};
var simulateMultiTapeTuringMachine = (automaton, inputString, tapeCount, blankSymbol = "_") => {
  const events = [];
  let time = 0;
  const startNode = automaton.nodes.find((n) => n.isStart);
  if (!startNode) {
    return { accepted: false, events: [{ time: 0, event: "reject", symbolIndex: 0 }] };
  }
  const tapes = Array.from({ length: tapeCount }, () => ({}));
  for (let i = 0;i < inputString.length; i++)
    tapes[0][i] = inputString[i];
  let currentStateId = startNode.id;
  const headIndices = Array(tapeCount).fill(0);
  const maxSteps = 1000;
  let steps = 0;
  let halted = false;
  let accepted = false;
  const getTapeChar = (tapeIdx, headIdx) => tapes[tapeIdx][headIdx] === undefined ? blankSymbol : tapes[tapeIdx][headIdx];
  const snapshotTapes = () => tapes.map((t) => ({ ...t }));
  events.push({ time: time++, event: "enter_state", stateId: currentStateId, symbolIndex: 0, tapes: snapshotTapes(), headIndices: [...headIndices] });
  events.push({ time: time++, event: "active_states", activeStateIds: [currentStateId], symbolIndex: 0, tapes: snapshotTapes(), headIndices: [...headIndices] });
  while (steps++ < maxSteps && !halted) {
    const currentNode = automaton.nodes.find((n) => n.id === currentStateId);
    if (currentNode?.isAccept) {
      accepted = true;
      halted = true;
      break;
    }
    if (currentNode?.isReject) {
      halted = true;
      break;
    }
    const currentSymbols = headIndices.map((headIdx, tapeIdx) => getTapeChar(tapeIdx, headIdx));
    let foundEdge;
    let matchTrans = null;
    const outgoingEdges = automaton.edges.filter((e) => e.source === currentStateId);
    for (const edge of outgoingEdges) {
      for (const sym of edge.symbols) {
        const trans = parseMultiTapeTmTransition(sym, tapeCount);
        if (trans && trans.reads.every((r, i) => r === currentSymbols[i])) {
          foundEdge = edge;
          matchTrans = trans;
          break;
        }
      }
      if (foundEdge)
        break;
    }
    if (!foundEdge || !matchTrans) {
      halted = true;
      break;
    }
    for (let i = 0;i < tapeCount; i++) {
      tapes[i][headIndices[i]] = matchTrans.writes[i];
      if (matchTrans.directions[i] === "L")
        headIndices[i]--;
      else if (matchTrans.directions[i] === "R")
        headIndices[i]++;
    }
    events.push({
      time: time++,
      event: "transition",
      edgeId: foundEdge.id,
      symbol: `${currentSymbols.join(",")}->${matchTrans.writes.join(",")};${matchTrans.directions.join(",")}`,
      symbolIndex: headIndices[0],
      tapes: snapshotTapes(),
      headIndices: [...headIndices]
    });
    currentStateId = foundEdge.target;
    events.push({ time: time++, event: "enter_state", stateId: currentStateId, symbolIndex: headIndices[0], tapes: snapshotTapes(), headIndices: [...headIndices] });
    events.push({ time: time++, event: "active_states", activeStateIds: [currentStateId], symbolIndex: headIndices[0], tapes: snapshotTapes(), headIndices: [...headIndices] });
  }
  const finalNode = automaton.nodes.find((n) => n.id === currentStateId);
  const isFinalAccepted = accepted || !!finalNode?.isAccept;
  events.push({ time: time++, event: isFinalAccepted ? "accept" : "reject", stateId: currentStateId, symbolIndex: headIndices[0], tapes: snapshotTapes(), headIndices: [...headIndices] });
  return { accepted: isFinalAccepted, events };
};
var runBatchTests = (automaton, type, inputs) => {
  const simulate = type === "DFA" ? simulateDFA : type === "NFA" ? simulateNFA : type === "PDA" ? simulatePDA : simulateTuringMachine;
  return inputs.map((input) => {
    try {
      return { input, accepted: simulate(automaton, input).accepted };
    } catch {
      return { input, accepted: false };
    }
  });
};
export {
  stampAutomatonSchema,
  simulateTuringMachine,
  simulatePDAAllBranches,
  simulatePDA,
  simulateNFA,
  simulateMultiTapeTuringMachine,
  simulateMoore,
  simulateMealy,
  simulateLBA,
  simulateDFA,
  runBatchTests,
  migrateAutomatonSchema,
  isEpsilon,
  getEpsilonClosureDetailed,
  getEpsilonClosure,
  AUTOMATON_SCHEMA_VERSION
};
