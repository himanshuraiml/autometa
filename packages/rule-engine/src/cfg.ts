/**
 * CFG Rules representation
 * Key: Non-terminal name (e.g. "S")
 * Value: Array of space-separated strings (e.g. ["a A", "b B", "ε"])
 */
export type CFGRules = Record<string, string[]>;

import type { Automaton, AutomatonNode, AutomatonEdge } from '@autometa/simulation-engine';

/**
 * Grammar schema version. Bump this whenever the shape of `VersionedGrammar`
 * changes, and add a branch to `migrateGrammar` for the previous shape —
 * mirrors the version/migration pattern in apps/web/src/utils/projectFormat.ts.
 */
export const GRAMMAR_SCHEMA_VERSION = 1;

/** The versioned, persistable envelope for a CFG — what call sites should
 * serialize instead of a bare `CFGRules` + separately-tracked start symbol. */
export interface VersionedGrammar {
  schemaVersion: number;
  rules: CFGRules;
  startSymbol: string;
}

export const wrapGrammar = (rules: CFGRules, startSymbol: string): VersionedGrammar => ({
  schemaVersion: GRAMMAR_SCHEMA_VERSION,
  rules,
  startSymbol,
});

/**
 * Parses grammar JSON blobs written by this app, including the unversioned
 * `{ rules, startSymbol }` shape used (e.g. in reference_rules_json /
 * submitted_rules_json) before schema versioning existed.
 */
export const migrateGrammar = (value: unknown): VersionedGrammar => {
  if (!value || typeof value !== 'object') throw new Error('Grammar data must be a JSON object.');
  const data = value as Record<string, unknown>;
  if (!data.rules || typeof data.rules !== 'object') throw new Error('Grammar data is missing production rules.');
  if (data.schemaVersion !== undefined && data.schemaVersion !== GRAMMAR_SCHEMA_VERSION) {
    throw new Error(`Unsupported grammar schema version: ${String(data.schemaVersion)}.`);
  }
  return wrapGrammar(data.rules as CFGRules, typeof data.startSymbol === 'string' ? data.startSymbol : 'S');
};

/** One stage of a CFG-to-automaton construction walkthrough, snapshotting the fragment built so far. */
export interface CfgToPdaStep {
  description: string;
  automaton: Automaton;
}

/**
 * Builds the standard single-stack PDA for a CFG with a per-stage trace
 * (states, push-start, per-nonterminal expansion transitions, terminal
 * match/pop transitions, accept). `cfgToPDA` is the plain-result variant.
 */
export const cfgToPDASteps = (grammar: CFGRules, startSymbol: string): { steps: CfgToPdaStep[]; result: Automaton } => {
  if (!grammar[startSymbol]) throw new Error(`Start symbol “${startSymbol}” is not defined.`);
  const terminals = new Set<string>();
  Object.values(grammar).flat().forEach(production => production.split(/\s+/).filter(Boolean).forEach(symbol => { if (!grammar[symbol] && symbol !== 'ε') terminals.add(symbol); }));

  const nodes: AutomatonNode[] = [
    { id: 'p0', label: 'start', isStart: true, isAccept: false },
    { id: 'p1', label: 'expand/match', isStart: false, isAccept: false },
    { id: 'p2', label: 'accept', isStart: false, isAccept: true },
  ];
  const edges: AutomatonEdge[] = [];
  const snapshot = (): Automaton => ({ nodes: nodes.map(node => ({ ...node })), edges: edges.map(edge => ({ ...edge })) });
  const steps: CfgToPdaStep[] = [{ description: 'Three PDA states: start, expand/match, accept', automaton: snapshot() }];

  edges.push({ id: 'start', source: 'p0', target: 'p1', symbols: [`ε, Z -> ${startSymbol} Z`] });
  steps.push({ description: `Push start symbol "${startSymbol}" onto the stack, above the bottom marker Z`, automaton: snapshot() });

  Object.entries(grammar).forEach(([left, productions], index) => {
    productions.forEach((right, productionIndex) => {
      edges.push({ id: `prod-${index}-${productionIndex}`, source: 'p1', target: 'p1', symbols: [`ε, ${left} -> ${right.trim() || 'ε'}`] });
    });
    steps.push({ description: `Add expansion transitions for "${left}"`, automaton: snapshot() });
  });

  [...terminals].forEach(symbol => {
    edges.push({ id: `match-${symbol}`, source: 'p1', target: 'p1', symbols: [`${symbol}, ${symbol} -> ε`] });
  });
  steps.push({ description: 'Add match/pop transitions for every terminal', automaton: snapshot() });

  edges.push({ id: 'accept', source: 'p1', target: 'p2', symbols: ['ε, Z -> Z'] });
  steps.push({ description: 'Accept once only the bottom marker Z remains on the stack', automaton: snapshot() });

  return { steps, result: snapshot() };
};

/**
 * Builds the standard single-stack PDA for a CFG. Production symbols must be
 * space-separated; terminals are matched and popped from the input stack.
 */
export const cfgToPDA = (grammar: CFGRules, startSymbol: string): Automaton => cfgToPDASteps(grammar, startSymbol).result;

const symbolsOf = (production: string) => production.trim() === 'ε' || production.trim() === '' ? [] : production.trim().split(/\s+/);
const productionOf = (symbols: string[]) => symbols.length ? symbols.join(' ') : 'ε';

/** One stage of a grammar-rewriting walkthrough (left-recursion elimination, left-factoring, CNF, GNF). */
export interface CfgTransformStep {
  description: string;
  rules: CFGRules;
}

/**
 * Eliminates indirect and direct left recursion using the standard ordered
 * algorithm, with a per-nonterminal trace. `eliminateLeftRecursion` is the
 * plain-result variant.
 */
export const eliminateLeftRecursionSteps = (grammar: CFGRules): { steps: CfgTransformStep[]; result: CFGRules } => {
  const result: CFGRules = Object.fromEntries(Object.entries(grammar).map(([left, right]) => [left, [...right]]));
  const variables = Object.keys(grammar);
  const steps: CfgTransformStep[] = [{ description: 'Original grammar', rules: { ...result } }];
  variables.forEach((current, index) => {
    for (let priorIndex = 0; priorIndex < index; priorIndex++) {
      const prior = variables[priorIndex];
      result[current] = result[current].flatMap(production => {
        const symbols = symbolsOf(production);
        if (symbols[0] !== prior) return [production];
        return result[prior].map(replacement => productionOf([...symbolsOf(replacement), ...symbols.slice(1)]));
      });
    }
    const recursive = result[current].filter(production => symbolsOf(production)[0] === current).map(production => symbolsOf(production).slice(1));
    const nonRecursive = result[current].filter(production => symbolsOf(production)[0] !== current).map(symbolsOf);
    if (recursive.length) {
      let suffix = `${current}'`;
      while (result[suffix]) suffix += "'";
      result[current] = nonRecursive.map(beta => productionOf([...beta, suffix]));
      result[suffix] = recursive.map(alpha => productionOf([...alpha, suffix])).concat(['ε']);
    }
    steps.push({
      description: `Process "${current}"${recursive.length ? ' — eliminated direct left recursion' : ' — no direct left recursion found'}`,
      rules: { ...result },
    });
  });
  return { steps, result };
};

/** Eliminates indirect and direct left recursion using the standard ordered algorithm. */
export const eliminateLeftRecursion = (grammar: CFGRules): CFGRules => eliminateLeftRecursionSteps(grammar).result;

/**
 * Repeatedly factors productions that begin with the same first symbol, with
 * a trace of each factoring operation. `leftFactorGrammar` is the
 * plain-result variant.
 */
export const leftFactorGrammarSteps = (grammar: CFGRules): { steps: CfgTransformStep[]; result: CFGRules } => {
  const result: CFGRules = Object.fromEntries(Object.entries(grammar).map(([left, right]) => [left, [...right]]));
  const steps: CfgTransformStep[] = [{ description: 'Original grammar', rules: { ...result } }];
  let changed = true;
  while (changed) {
    changed = false;
    for (const left of Object.keys(result)) {
      const groups = new Map<string, string[]>();
      result[left].forEach(production => { const first = symbolsOf(production)[0] || 'ε'; groups.set(first, [...(groups.get(first) || []), production]); });
      const match = [...groups.entries()].find(([first, productions]) => first !== 'ε' && productions.length > 1);
      if (!match) continue;
      const [prefix, productions] = match;
      let suffix = `${left}_F`;
      while (result[suffix]) suffix += '_F';
      result[left] = result[left].filter(production => !productions.includes(production)).concat([`${prefix} ${suffix}`]);
      result[suffix] = productions.map(production => productionOf(symbolsOf(production).slice(1)));
      changed = true;
      steps.push({ description: `Factor "${left}" on common prefix "${prefix}" into new nonterminal "${suffix}"`, rules: { ...result } });
      break;
    }
  }
  return { steps, result };
};

/** Repeatedly factors productions that begin with the same first symbol. */
export const leftFactorGrammar = (grammar: CFGRules): CFGRules => leftFactorGrammarSteps(grammar).result;

/**
 * Removes non-generating nonterminals (those that can never derive a
 * terminal string) and then unreachable nonterminals (those never reachable
 * from `startSymbol`) — the standard two-pass useless-symbol elimination.
 */
export const removeUselessSymbols = (grammar: CFGRules, startSymbol: string): CFGRules => {
  const generating = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    Object.entries(grammar).forEach(([nt, productions]) => {
      if (generating.has(nt)) return;
      const canGenerate = productions.some(production => symbolsOf(production).every(symbol => !grammar[symbol] || generating.has(symbol)));
      if (canGenerate) { generating.add(nt); changed = true; }
    });
  }
  const afterGenerating: CFGRules = {};
  Object.entries(grammar).forEach(([nt, productions]) => {
    if (!generating.has(nt)) return;
    afterGenerating[nt] = productions.filter(production => symbolsOf(production).every(symbol => !grammar[symbol] || generating.has(symbol)));
  });

  const reachable = new Set<string>([startSymbol]);
  const queue = afterGenerating[startSymbol] ? [startSymbol] : [];
  while (queue.length) {
    const current = queue.shift()!;
    (afterGenerating[current] || []).forEach(production => {
      symbolsOf(production).forEach(symbol => {
        if (afterGenerating[symbol] && !reachable.has(symbol)) { reachable.add(symbol); queue.push(symbol); }
      });
    });
  }

  const result: CFGRules = {};
  Object.entries(afterGenerating).forEach(([nt, productions]) => {
    if (!reachable.has(nt)) return;
    result[nt] = productions.filter(production => symbolsOf(production).every(symbol => !afterGenerating[symbol] || reachable.has(symbol)));
  });
  return result;
};

/**
 * Classifies a grammar as right-linear, left-linear, or (the general case)
 * context-free, by checking every production's shape. Note: `CFGRules`
 * always has a single-nonterminal left-hand side, so it structurally cannot
 * represent context-sensitive or unrestricted grammars — classification is
 * necessarily bounded to regular-vs-context-free.
 */
export type GrammarClassification = 'right-linear' | 'left-linear' | 'context-free';

export const classifyGrammar = (grammar: CFGRules): GrammarClassification => {
  const nonTerminals = new Set(Object.keys(grammar));
  let isRightLinear = true;
  let isLeftLinear = true;
  Object.values(grammar).forEach(productions => {
    productions.forEach(production => {
      const symbols = symbolsOf(production);
      if (symbols.length === 0) return;
      const nonTerminalPositions = symbols.map(symbol => nonTerminals.has(symbol));
      const nonTerminalCount = nonTerminalPositions.filter(Boolean).length;
      if (nonTerminalCount > 1) { isRightLinear = false; isLeftLinear = false; return; }
      if (nonTerminalCount === 1) {
        if (!nonTerminalPositions[nonTerminalPositions.length - 1]) isRightLinear = false;
        if (!nonTerminalPositions[0]) isLeftLinear = false;
      }
    });
  });
  if (isRightLinear) return 'right-linear';
  if (isLeftLinear) return 'left-linear';
  return 'context-free';
};

/** Removes ε-productions, inlining nullable variables into every combination of their surrounding productions. */
export const removeEpsilonProductions = (grammar: CFGRules): CFGRules => {
  const result: CFGRules = Object.fromEntries(Object.entries(grammar).map(([left, right]) => [left, [...right]]));

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

  return result;
};

/** Removes unit productions (A -> B) by inlining the target nonterminal's own productions. */
export const removeUnitProductions = (grammar: CFGRules): CFGRules => {
  const result: CFGRules = Object.fromEntries(Object.entries(grammar).map(([left, right]) => [left, [...right]]));
  let changed = true;
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
  return result;
};

/** Replaces terminals in mixed/long productions with dedicated single-terminal nonterminals (CNF prep). */
const isolateTerminals = (grammar: CFGRules): CFGRules => {
  const result: CFGRules = Object.fromEntries(Object.entries(grammar).map(([left, right]) => [left, [...right]]));
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
    if (nt.startsWith('X_')) return;
    result[nt] = result[nt].map(prod => {
      const symbols = prod.split(/\s+/).filter(Boolean);
      if (symbols.length <= 1) return prod;
      return symbols.map(sym => /^[a-z0-9]$/.test(sym) ? getTerminalVar(sym) : sym).join(' ');
    });
  });
  return result;
};

/** Splits productions with more than two symbols into a chain of binary productions (CNF prep). */
const binarizeProductions = (grammar: CFGRules): CFGRules => {
  const result: CFGRules = Object.fromEntries(Object.entries(grammar).map(([left, right]) => [left, [...right]]));
  let varCounter = 0;
  Object.keys(result).forEach(nt => {
    if (nt.startsWith('X_')) return;
    const binarizedProds: string[] = [];
    result[nt].forEach(prod => {
      const symbols = prod.split(/\s+/).filter(Boolean);
      if (symbols.length <= 2) {
        binarizedProds.push(prod);
        return;
      }
      // Convert A -> B C D into: A -> B Y1, Y1 -> C Y2, Y2 -> D E
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
 * Converts a CFG to Chomsky Normal Form (CNF) — CNF rules are of the form
 * A -> BC or A -> a — with a per-stage trace. `cfgToCNF` is the plain-result
 * variant of the same pipeline.
 */
export const cfgToCNFSteps = (grammar: CFGRules): { steps: CfgTransformStep[]; result: CFGRules } => {
  const afterEpsilon = removeEpsilonProductions(grammar);
  const afterUnit = removeUnitProductions(afterEpsilon);
  const afterTerminals = isolateTerminals(afterUnit);
  const afterBinarize = binarizeProductions(afterTerminals);
  const steps: CfgTransformStep[] = [
    { description: 'Original grammar', rules: grammar },
    { description: 'Remove ε-productions', rules: afterEpsilon },
    { description: 'Remove unit productions (A → B)', rules: afterUnit },
    { description: 'Isolate terminals in mixed/long productions', rules: afterTerminals },
    { description: 'Binarize productions with more than two symbols', rules: afterBinarize },
  ];
  return { steps, result: afterBinarize };
};

/**
 * Converts a CFG to Chomsky Normal Form (CNF)
 * CNF rules must be of the form A -> BC or A -> a
 */
export const cfgToCNF = (grammar: CFGRules): CFGRules => cfgToCNFSteps(grammar).result;

/**
 * Converts CNF to Greibach Normal Form (GNF — every production starts with a
 * terminal) by substituting each nonterminal's leading-nonterminal
 * productions to a fixed point, memoizing already-resolved nonterminals and
 * guarding against cyclic nonterminal-pair dependencies (which a pure
 * substitution can't resolve — such grammars need left recursion eliminated
 * first, e.g. via `eliminateLeftRecursion`, before GNF conversion).
 */
const resolveGnf = (cnf: CFGRules): { steps: CfgTransformStep[]; result: CFGRules } => {
  const resolved: Record<string, string[]> = {};
  const steps: CfgTransformStep[] = [{ description: 'Start from Chomsky Normal Form', rules: cnf }];

  const resolve = (nt: string, visiting: Set<string>): string[] => {
    if (resolved[nt]) return resolved[nt];
    if (visiting.has(nt)) {
      throw new Error(`cfgToGNF: cannot resolve grammar — cyclic nonterminal reference at "${nt}". Eliminate left recursion first.`);
    }
    visiting.add(nt);
    const output = new Set<string>();
    (cnf[nt] || []).forEach(prod => {
      const symbols = prod.split(/\s+/).filter(Boolean);
      if (symbols.length === 1) { output.add(prod); return; } // A -> a, already GNF
      const [b, c] = symbols; // A -> B C (post-CNF, always exactly two nonterminals)
      resolve(b, visiting).forEach(bProd => output.add(`${bProd} ${c}`));
    });
    visiting.delete(nt);
    resolved[nt] = Array.from(output);
    return resolved[nt];
  };

  Object.keys(cnf).forEach(nt => {
    resolve(nt, new Set());
    steps.push({ description: `Resolve "${nt}" to Greibach form`, rules: { ...resolved } });
  });

  return { steps, result: { ...resolved } };
};

/**
 * Converts a CFG to Greibach Normal Form (GNF) with a per-nonterminal trace.
 * GNF rules are of the form A -> a BC... where a is a terminal. `cfgToGNF`
 * is the plain-result variant.
 */
export const cfgToGNFSteps = (grammar: CFGRules): { steps: CfgTransformStep[]; result: CFGRules } => resolveGnf(cfgToCNF(grammar));

/**
 * Converts a CFG to Greibach Normal Form (GNF)
 * GNF rules are of the form A -> a BC... where a is a terminal
 */
export const cfgToGNF = (grammar: CFGRules): CFGRules => resolveGnf(cfgToCNF(grammar)).result;

/** One cell of the CYK DP table: which nonterminals generate `word[start..start+length)`. */
export interface CykTableCell {
  start: number;
  length: number;
  nonTerminals: string[];
}

/**
 * CYK Dynamic Programming Parser, exposing the full DP table (rows indexed
 * by substring length 1..n) alongside the accept/reject result. `cykParse`
 * is the boolean-only fast path over the same algorithm.
 */
export const cykParseTable = (grammar: CFGRules, startSymbol: string, word: string): { accepted: boolean; table: CykTableCell[][] } => {
  if (!word) return { accepted: false, table: [] };
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

  const serializedTable: CykTableCell[][] = [];
  for (let len = 1; len <= n; len++) {
    const row: CykTableCell[] = [];
    for (let start = 0; start <= n - len; start++) {
      row.push({ start, length: len, nonTerminals: Array.from(table[len][start]).sort() });
    }
    serializedTable.push(row);
  }

  return { accepted: table[n][0].has(startSymbol), table: serializedTable };
};

/**
 * CYK Dynamic Programming Parser
 * Returns true if the word is accepted by the CFG grammar
 */
export const cykParse = (grammar: CFGRules, startSymbol: string, word: string): boolean => cykParseTable(grammar, startSymbol, word).accepted;
