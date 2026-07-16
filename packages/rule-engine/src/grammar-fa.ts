import type { Automaton, AutomatonNode, AutomatonEdge } from '@autometa/simulation-engine';
import { isEpsilon } from '@autometa/simulation-engine';
import type { CFGRules } from './cfg';

/**
 * Converts an NFA/DFA into an equivalent right-linear regular grammar: each
 * state becomes a nonterminal, each transition `q --a--> r` becomes a
 * production `Q -> a R` (an ε-transition becomes the unit production
 * `Q -> R`, which right-linear grammars conventionally allow), and every
 * accept state additionally gets `Q -> ε`. Works directly on NFAs — no
 * determinization needed first.
 */
export const nfaToRegularGrammar = (nfa: Automaton): CFGRules => {
  const start = nfa.nodes.find(node => node.isStart);
  if (!start) throw new Error('Machine needs a start state.');

  const nonTerminalOf = new Map<string, string>();
  let counter = 0;
  const nameFor = (id: string): string => {
    const existing = nonTerminalOf.get(id);
    if (existing) return existing;
    const node = nfa.nodes.find(n => n.id === id);
    const base = node?.label && /^[A-Z][A-Za-z0-9_]*$/.test(node.label) ? node.label : `Q${counter++}`;
    let name = base;
    while ([...nonTerminalOf.values()].includes(name)) name = `${base}_${counter++}`;
    nonTerminalOf.set(id, name);
    return name;
  };

  // Name the start state first, so it keeps a stable, recognizable nonterminal.
  nameFor(start.id);
  nfa.nodes.forEach(node => nameFor(node.id));

  const grammar: CFGRules = {};
  nfa.nodes.forEach(node => { grammar[nameFor(node.id)] = []; });

  nfa.edges.forEach(edge => {
    const source = nameFor(edge.source);
    const target = nameFor(edge.target);
    edge.symbols.forEach(symbol => {
      grammar[source].push(isEpsilon(symbol) ? target : `${symbol} ${target}`);
    });
  });

  nfa.nodes.filter(node => node.isAccept).forEach(node => {
    grammar[nameFor(node.id)].push('ε');
  });

  return grammar;
};

/**
 * Converts a right-linear regular grammar into an equivalent NFA: each
 * nonterminal becomes a state, `A -> a B` becomes a transition `A --a--> B`,
 * `A -> B` becomes an ε-transition `A --ε--> B`, `A -> a` transitions into a
 * shared accept sink, and `A -> ε` marks `A` itself as an accept state.
 * Throws with a specific message if the grammar isn't right-linear.
 */
export const regularGrammarToNfa = (grammar: CFGRules, startSymbol: string): Automaton => {
  if (!grammar[startSymbol]) throw new Error(`Start symbol "${startSymbol}" is not defined.`);
  const nonTerminals = new Set(Object.keys(grammar));

  Object.entries(grammar).forEach(([left, productions]) => {
    productions.forEach(prod => {
      const trimmed = prod.trim();
      if (trimmed === 'ε' || trimmed === '') return;
      const symbols = trimmed.split(/\s+/);
      if (symbols.length > 2) {
        throw new Error(`"${left} -> ${prod}" is not right-linear — a right-linear production has at most one terminal followed by one nonterminal.`);
      }
      if (symbols.length === 2) {
        const [first, second] = symbols;
        if (nonTerminals.has(first)) throw new Error(`"${left} -> ${prod}" is not right-linear — must start with a terminal.`);
        if (!nonTerminals.has(second)) throw new Error(`"${left} -> ${prod}" is not right-linear — must end with a nonterminal.`);
      }
    });
  });

  const acceptId = '__accept__';
  const nodes: AutomatonNode[] = [
    ...Object.keys(grammar).map(nt => ({ id: nt, label: nt, isStart: nt === startSymbol, isAccept: false })),
    { id: acceptId, label: 'accept', isStart: false, isAccept: true },
  ];
  const edges: AutomatonEdge[] = [];
  let edgeCounter = 0;
  let usedAcceptSink = false;

  Object.entries(grammar).forEach(([left, productions]) => {
    productions.forEach(prod => {
      const trimmed = prod.trim();
      if (trimmed === 'ε' || trimmed === '') {
        const node = nodes.find(n => n.id === left);
        if (node) node.isAccept = true;
        return;
      }
      const symbols = trimmed.split(/\s+/);
      if (symbols.length === 1 && nonTerminals.has(symbols[0])) {
        edges.push({ id: `e-${edgeCounter++}`, source: left, target: symbols[0], symbols: ['ε'] });
        return;
      }
      if (symbols.length === 1) {
        usedAcceptSink = true;
        edges.push({ id: `e-${edgeCounter++}`, source: left, target: acceptId, symbols: [symbols[0]] });
        return;
      }
      edges.push({ id: `e-${edgeCounter++}`, source: left, target: symbols[1], symbols: [symbols[0]] });
    });
  });

  return { nodes: usedAcceptSink ? nodes : nodes.filter(n => n.id !== acceptId), edges };
};
