import type { CFGRules } from './cfg';

/**
 * Computes FIRST and FOLLOW sets for a CFG
 */
export const computeFirstAndFollow = (
  grammar: CFGRules,
  startSymbol: string
): { first: Record<string, Set<string>>; follow: Record<string, Set<string>>; nullable: Set<string> } => {
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

  const nullable = new Set<string>(nonTerminals.filter(nt => first[nt].has('ε')));
  return { first, follow, nullable };
};

const commonPrefixLength = (a: string[], b: string[]): number => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/** Heuristic suggestion for how to resolve an LL(1) table cell conflict. */
const suggestLL1Fix = (nt: string, productions: string[]): string => {
  const split = productions.map(p => p.split(/\s+/).filter(Boolean));
  const hasDirectLeftRecursion = split.some(symbols => symbols[0] === nt);
  if (hasDirectLeftRecursion) return `eliminate left recursion in "${nt}"`;
  const hasCommonPrefix = split.some((symbols, i) => split.some((other, j) => i !== j && commonPrefixLength(symbols, other) > 0));
  if (hasCommonPrefix) return `left-factor rule "${nt}"`;
  return `rewrite "${nt}" — its productions overlap on this lookahead symbol`;
};

/**
 * Generates an LL(1) Parse Table. Cells hold every production that lands
 * there (normally exactly one); `conflicts` describes each cell where more
 * than one production collided, with a suggested fix.
 */
export const generateLL1Table = (
  grammar: CFGRules,
  startSymbol: string
): { table: Record<string, Record<string, string[]>>; conflicts: string[] } => {
  const { first, follow } = computeFirstAndFollow(grammar, startSymbol);
  const table: Record<string, Record<string, string[]>> = {};
  const conflicts: string[] = [];

  Object.keys(grammar).forEach(nt => {
    table[nt] = {};
  });

  const addEntry = (nt: string, symbol: string, prod: string) => {
    if (!table[nt][symbol]) table[nt][symbol] = [];
    if (table[nt][symbol].includes(prod)) return;
    table[nt][symbol].push(prod);
    if (table[nt][symbol].length > 1) {
      const productions = table[nt][symbol];
      conflicts.push(`"${nt}" on "${symbol}": conflict between ${productions.map(p => `${nt} → ${p}`).join(' and ')} — ${suggestLL1Fix(nt, productions)}`);
    }
  };

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
          addEntry(nt, a, prod);
        } else {
          // If ε in FIRST, map production to all terminals in FOLLOW(nt)
          follow[nt].forEach(b => addEntry(nt, b, prod));
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

/** Finds bounded distinct leftmost derivations as evidence that a grammar is ambiguous. */
export const generateLeftmostDerivations = (grammar: CFGRules, startSymbol: string, targetString: string, limit: number = 2): string[][] => {
  const target = targetString.trim();
  const nonTerminals = new Set(Object.keys(grammar));
  const queue: Array<{ symbols: string[]; path: string[] }> = [{ symbols: [startSymbol], path: [startSymbol] }];
  const found: string[][] = [];
  const foundKeys = new Set<string>();
  let iterations = 0;
  while (queue.length && iterations++ < 10000 && found.length < limit) {
    const current = queue.shift()!;
    const index = current.symbols.findIndex(symbol => nonTerminals.has(symbol));
    if (index === -1) {
      if (current.symbols.filter(symbol => symbol !== 'ε').join('') === target) {
        const key = current.path.join(' → ');
        if (!foundKeys.has(key)) { foundKeys.add(key); found.push(current.path); }
      }
      continue;
    }
    const terminalLength = current.symbols.filter(symbol => !nonTerminals.has(symbol) && symbol !== 'ε').join('').length;
    if (terminalLength > target.length || current.symbols.length > target.length * 3 + 8) continue;
    for (const production of grammar[current.symbols[index]] || []) {
      const symbols = production.split(/\s+/).filter(Boolean);
      const next = [...current.symbols.slice(0, index), ...symbols, ...current.symbols.slice(index + 1)];
      const display = next.filter(symbol => symbol !== 'ε').join(' ') || 'ε';
      queue.push({ symbols: next, path: [...current.path, display] });
    }
  }
  return found;
};

export interface ParseTreeNode { id: string; symbol: string; children: ParseTreeNode[]; }
/** One rewrite step of a derivation: the tree immediately after applying `production` to `expandedNodeId`. */
export interface DerivationTreeStep { tree: ParseTreeNode; expandedNodeId: string; expandedSymbol: string; production: string; }
export interface ParseTreeDerivation { path: string[]; tree: ParseTreeNode; steps: DerivationTreeStep[]; }

/**
 * Builds concrete hierarchical parse trees while searching for leftmost
 * derivations, collecting up to `limit` distinct ones — the shared search
 * behind both `generateLeftmostParseTree` (limit 1) and ambiguity detection
 * (limit 2+, since 2+ distinct derivations for the same string is the
 * definition of ambiguity).
 */
export const findDerivationTrees = (grammar: CFGRules, startSymbol: string, targetString: string, limit: number = 2): ParseTreeDerivation[] => {
  const target = targetString.trim();
  const nonTerminals = new Set(Object.keys(grammar));
  type Item = { symbol: string; id: string };
  type State = { items: Item[]; tree: ParseTreeNode; path: string[]; nextId: number; steps: DerivationTreeStep[] };
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const find = (node: ParseTreeNode, id: string): ParseTreeNode | null => node.id === id ? node : node.children.reduce<ParseTreeNode | null>((found, child) => found || find(child, id), null);
  const queue: State[] = [{ items: [{ symbol: startSymbol, id: 'n0' }], tree: { id: 'n0', symbol: startSymbol, children: [] }, path: [startSymbol], nextId: 1, steps: [] }];
  const found: ParseTreeDerivation[] = [];
  const foundKeys = new Set<string>();
  let iterations = 0;
  while (queue.length && iterations++ < 10000 && found.length < limit) {
    const current = queue.shift()!;
    const index = current.items.findIndex(item => nonTerminals.has(item.symbol));
    if (index === -1) {
      if (current.items.filter(item => item.symbol !== 'ε').map(item => item.symbol).join('') === target) {
        const key = current.path.join(' → ');
        if (!foundKeys.has(key)) { foundKeys.add(key); found.push({ path: current.path, tree: current.tree, steps: current.steps }); }
      }
      continue;
    }
    const terminalLength = current.items.filter(item => !nonTerminals.has(item.symbol) && item.symbol !== 'ε').map(item => item.symbol).join('').length;
    if (terminalLength > target.length || current.items.length > target.length * 3 + 8) continue;
    const expanded = current.items[index];
    for (const production of grammar[expanded.symbol] || []) {
      const symbols = production.trim() === '' ? ['ε'] : production.split(/\s+/).filter(Boolean);
      const tree = clone(current.tree);
      const parent = find(tree, expanded.id)!;
      const children = symbols.map((symbol, offset) => ({ id: `n${current.nextId + offset}`, symbol, children: [] as ParseTreeNode[] }));
      parent.children = children;
      const childItems = children.map(child => ({ symbol: child.symbol, id: child.id }));
      const items = [...current.items.slice(0, index), ...childItems, ...current.items.slice(index + 1)];
      const display = items.filter(item => item.symbol !== 'ε').map(item => item.symbol).join(' ') || 'ε';
      const step: DerivationTreeStep = { tree, expandedNodeId: expanded.id, expandedSymbol: expanded.symbol, production: `${expanded.symbol} → ${symbols.join(' ')}` };
      queue.push({ items, tree, path: [...current.path, display], nextId: current.nextId + children.length, steps: [...current.steps, step] });
    }
  }
  return found;
};

/** Builds a concrete hierarchical parse tree while searching for a leftmost derivation. */
export const generateLeftmostParseTree = (grammar: CFGRules, startSymbol: string, targetString: string): ParseTreeDerivation | null =>
  findDerivationTrees(grammar, startSymbol, targetString, 1)[0] ?? null;

const terminalAlphabetOf = (grammar: CFGRules): string[] => {
  const nonTerminals = new Set(Object.keys(grammar));
  const terminals = new Set<string>();
  Object.values(grammar).forEach(productions => productions.forEach(prod => {
    prod.split(/\s+/).filter(Boolean).forEach(symbol => {
      if (!nonTerminals.has(symbol) && symbol !== 'ε') terminals.add(symbol);
    });
  }));
  return Array.from(terminals).sort();
};

/**
 * Bounded proactive ambiguity sweep: tries every string up to `maxLength`
 * built from the grammar's terminal alphabet (breadth-first by length, capped
 * at `maxAttempts` total strings tested to keep this a fast, UI-triggerable
 * action) until it finds one with 2+ distinct leftmost derivations.
 */
export const findAmbiguousStringInLanguage = (
  grammar: CFGRules,
  startSymbol: string,
  maxLength: number = 5,
  maxAttempts: number = 500
): { input: string; derivations: ParseTreeDerivation[] } | null => {
  const alphabet = terminalAlphabetOf(grammar);
  if (!alphabet.length) return null;
  let attempts = 0;
  let frontier: string[] = [''];
  for (let length = 1; length <= maxLength && attempts < maxAttempts; length++) {
    const next: string[] = [];
    for (const prefix of frontier) {
      for (const symbol of alphabet) {
        if (attempts >= maxAttempts) break;
        const candidate = prefix + symbol;
        attempts++;
        const derivations = findDerivationTrees(grammar, startSymbol, candidate, 2);
        if (derivations.length >= 2) return { input: candidate, derivations };
        next.push(candidate);
      }
    }
    frontier = next;
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
        const reduceTargets = currentActions.filter(act => act.type === 'reduce').map(act => act.target.split('->')[0].trim());
        const suggestion = currentActions.some(act => act.type === 'shift') && currentActions.some(act => act.type === 'reduce')
          ? `shift-reduce conflict — consider left-factoring or restructuring "${reduceTargets[0] ?? symbol}" to remove the ambiguity`
          : `reduce-reduce conflict — consider left-factoring or rewriting ${reduceTargets.map(t => `"${t}"`).join(' and ')} since they overlap on "${symbol}"`;
        const conflictDesc = `State ${stateId} on symbol '${symbol}': Conflict between ` +
          currentActions.map(act => `${act.type === 'shift' ? 'Shift' : 'Reduce'} ${act.target}`).join(' and ') +
          ` — ${suggestion}`;
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
