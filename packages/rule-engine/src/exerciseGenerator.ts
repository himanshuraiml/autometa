import type { Automaton, AutomatonNode, AutomatonEdge } from '@autometa/simulation-engine';
import { simulateDFA, simulateNFA, runBatchTests } from '@autometa/simulation-engine';
import { regexToNfa } from './regex';
import { cykParse } from './cfg';
import type { CFGRules } from './cfg';
import type { ExerciseAutomatonType, SampleTest } from './grading';

/**
 * Deterministic, parameterized exercise generation. Reference solutions are
 * always built by hand-verified construction functions below (never by an
 * LLM), so every generated exercise is guaranteed gradeable and correct —
 * "freshness" comes from randomizing parameters (alphabet, pattern, modulus)
 * within each language family, not from trusting generated automaton JSON.
 */

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface GeneratedExercise {
  automatonType: ExerciseAutomatonType;
  difficulty: Difficulty;
  title: string;
  description: string;
  alphabet: string[];
  automaton?: Automaton;
  regex?: string;
  rules?: CFGRules;
  startSymbol?: string;
  sampleTests: SampleTest[];
  hints: string[];
  learningObjective: string;
}

export const LEARNING_OBJECTIVES: Record<ExerciseAutomatonType, string[]> = {
  DFA: ['string matching', 'modular counting', 'run-length constraints'],
  NFA: ['nondeterminism', 'closure properties'],
  Regex: ['regular expressions'],
  CFG: ['recursion', 'context-free grammars'],
  PDA: ['stack-based recognition', 'pushdown automata'],
  TM: ['unary computation'],
};

// ---------------------------------------------------------------------------
// Seeded RNG + small helpers (deterministic so a seed can be regenerated)
// ---------------------------------------------------------------------------

type Rng = () => number;

const mulberry32 = (seed: number): Rng => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const randInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const randomString = (rng: Rng, alphabet: string[], length: number) =>
  Array.from({ length }, () => pick(rng, alphabet)).join('');

const DIFFICULTY_PARAMS: Record<
  Difficulty,
  { alphabetPool: string[][]; patternLen: [number, number]; k: [number, number]; maxRun: [number, number] }
> = {
  beginner: { alphabetPool: [['a', 'b'], ['0', '1']], patternLen: [2, 2], k: [2, 2], maxRun: [1, 2] },
  intermediate: { alphabetPool: [['a', 'b'], ['0', '1']], patternLen: [2, 3], k: [3, 3], maxRun: [2, 2] },
  advanced: { alphabetPool: [['a', 'b', 'c'], ['0', '1']], patternLen: [3, 4], k: [4, 5], maxRun: [2, 3] },
};

// ---------------------------------------------------------------------------
// Sample-test battery construction (behavior ground truth for grading.ts)
// ---------------------------------------------------------------------------

const enumerateStrings = (alphabet: string[], maxLength: number, cap = 260): string[] => {
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

const buildFaSampleTests = (automaton: Automaton, type: 'DFA' | 'NFA', alphabet: string[]): SampleTest[] => {
  const simulate = type === 'DFA' ? simulateDFA : simulateNFA;
  return enumerateStrings(alphabet, 4).map(input => ({ input, expectedAccept: simulate(automaton, input).accepted }));
};

const buildRegexSampleTests = (nfa: Automaton, alphabet: string[]): SampleTest[] =>
  enumerateStrings(alphabet, 4).map(input => ({ input, expectedAccept: simulateNFA(nfa, input).accepted }));

const buildCfgSampleTests = (rules: CFGRules, startSymbol: string, alphabet: string[]): SampleTest[] =>
  enumerateStrings(alphabet, 7)
    .filter(input => input.length > 0)
    .map(input => ({ input, expectedAccept: cykParse(rules, startSymbol, input) }));

const buildBatchSampleTests = (
  automaton: Automaton,
  type: 'PDA' | 'TM',
  alphabet: string[],
  maxLength: number
): SampleTest[] =>
  runBatchTests(automaton, type, enumerateStrings(alphabet, maxLength)).map(r => ({
    input: r.input,
    expectedAccept: r.accepted,
  }));

// ---------------------------------------------------------------------------
// DFA reference-solution builders
// ---------------------------------------------------------------------------

/**
 * The classic string-matching automaton: state i means "the longest suffix
 * of the input read so far that is also a prefix of `pattern` has length i".
 * `mode: 'contains'` makes the full-match state absorbing (once matched,
 * always accepting); `mode: 'endsWith'` only accepts in the full-match state.
 */
export const buildPatternDFA = (alphabet: string[], pattern: string, mode: 'endsWith' | 'contains'): Automaton => {
  const m = pattern.length;
  const delta = (state: number, c: string): number => {
    for (let k = Math.min(state + 1, m); k >= 1; k--) {
      const candidate = (pattern.slice(0, state) + c).slice(-k);
      if (candidate === pattern.slice(0, k)) return k;
    }
    return 0;
  };

  const nodes: AutomatonNode[] = [];
  const edges: AutomatonEdge[] = [];
  for (let state = 0; state <= m; state++) {
    nodes.push({ id: `q${state}`, label: `q${state}`, isStart: state === 0, isAccept: state === m });
  }
  for (let state = 0; state <= m; state++) {
    if (mode === 'contains' && state === m) {
      for (const c of alphabet) edges.push({ id: `e-q${state}-${c}-abs`, source: `q${state}`, target: `q${state}`, symbols: [c] });
      continue;
    }
    for (const c of alphabet) {
      const next = delta(state, c);
      edges.push({ id: `e-q${state}-${c}`, source: `q${state}`, target: `q${next}`, symbols: [c] });
    }
  }
  return { nodes, edges };
};

export const buildEvenCountDFA = (alphabet: string[], symbol: string): Automaton => ({
  nodes: [
    { id: 'q0', label: 'q0 (even)', isStart: true, isAccept: true },
    { id: 'q1', label: 'q1 (odd)', isStart: false, isAccept: false },
  ],
  edges: alphabet.flatMap(c =>
    c === symbol
      ? [
          { id: `e-q0-${c}`, source: 'q0', target: 'q1', symbols: [c] },
          { id: `e-q1-${c}`, source: 'q1', target: 'q0', symbols: [c] },
        ]
      : [
          { id: `e-q0-${c}-loop`, source: 'q0', target: 'q0', symbols: [c] },
          { id: `e-q1-${c}-loop`, source: 'q1', target: 'q1', symbols: [c] },
        ]
  ),
});

export const buildModKDFA = (alphabet: string[], symbol: string, k: number): Automaton => {
  const nodes: AutomatonNode[] = Array.from({ length: k }, (_, i) => ({
    id: `q${i}`,
    label: `q${i}`,
    isStart: i === 0,
    isAccept: i === 0,
  }));
  const edges: AutomatonEdge[] = [];
  for (let i = 0; i < k; i++) {
    for (const c of alphabet) {
      const next = c === symbol ? (i + 1) % k : i;
      edges.push({ id: `e-q${i}-${c}`, source: `q${i}`, target: `q${next}`, symbols: [c] });
    }
  }
  return { nodes, edges };
};

export const buildNoConsecutiveDFA = (alphabet: string[], symbol: string, maxRun: number): Automaton => {
  const dead = maxRun + 1;
  const nodes: AutomatonNode[] = [
    ...Array.from({ length: maxRun + 1 }, (_, i) => ({ id: `q${i}`, label: `q${i}`, isStart: i === 0, isAccept: true })),
    { id: `q${dead}`, label: 'dead', isStart: false, isAccept: false },
  ];
  const edges: AutomatonEdge[] = [];
  for (let i = 0; i <= dead; i++) {
    for (const c of alphabet) {
      const next = i === dead ? dead : c === symbol ? (i + 1 > maxRun ? dead : i + 1) : 0;
      edges.push({ id: `e-q${i}-${c}`, source: `q${i}`, target: `q${next}`, symbols: [c] });
    }
  }
  return { nodes, edges };
};

interface Family<T> {
  objective: string;
  build: () => T;
}

const pickFamily = <T,>(rng: Rng, families: Family<T>[], objective?: string): T => {
  const matching = objective ? families.filter(f => f.objective.toLowerCase().includes(objective.toLowerCase())) : [];
  return pick(rng, matching.length ? matching : families).build();
};

type FamilyResult = Omit<GeneratedExercise, 'automatonType' | 'difficulty' | 'sampleTests'>;

const generateDFAExercise = (rng: Rng, difficulty: Difficulty, objective?: string): GeneratedExercise => {
  const params = DIFFICULTY_PARAMS[difficulty];
  const alphabet = pick(rng, params.alphabetPool);

  const families: Family<FamilyResult>[] = [
    {
      objective: 'string matching',
      build: () => {
        const len = randInt(rng, params.patternLen[0], params.patternLen[1]);
        const suffix = randomString(rng, alphabet, len);
        return {
          title: `Ends with "${suffix}"`,
          description: `Design a DFA over the alphabet {${alphabet.join(', ')}} that accepts exactly the strings ending with "${suffix}".`,
          alphabet,
          automaton: buildPatternDFA(alphabet, suffix, 'endsWith'),
          hints: [
            `Give each state a meaning: "how much of \\"${suffix}\\" have I matched, ending at the current position?"`,
            `If the next symbol breaks the match, check whether a shorter prefix of "${suffix}" still matches before falling all the way back to the start.`,
            `You need ${len + 1} states in total.`,
          ],
          learningObjective: 'string matching',
        };
      },
    },
    {
      objective: 'string matching',
      build: () => {
        const len = randInt(rng, params.patternLen[0], params.patternLen[1]);
        const substring = randomString(rng, alphabet, len);
        return {
          title: `Contains "${substring}"`,
          description: `Design a DFA over {${alphabet.join(', ')}} that accepts strings containing "${substring}" as a substring anywhere.`,
          alphabet,
          automaton: buildPatternDFA(alphabet, substring, 'contains'),
          hints: [`Same idea as "ends with" — except once you fully match "${substring}", stay in the accepting state forever.`],
          learningObjective: 'string matching',
        };
      },
    },
    {
      objective: 'modular counting',
      build: () => {
        const symbol = pick(rng, alphabet);
        const k = randInt(rng, params.k[0], params.k[1]);
        if (k === 2) {
          return {
            title: `Even number of "${symbol}"`,
            description: `Design a DFA over {${alphabet.join(', ')}} that accepts strings with an even number of "${symbol}" symbols (zero counts as even).`,
            alphabet,
            automaton: buildEvenCountDFA(alphabet, symbol),
            hints: [`Only "${symbol}" changes your count; every other symbol is a self-loop.`, 'Two states suffice: "even so far" and "odd so far".'],
            learningObjective: 'modular counting',
          };
        }
        return {
          title: `Number of "${symbol}" divisible by ${k}`,
          description: `Design a DFA over {${alphabet.join(', ')}} that accepts strings where the number of "${symbol}" symbols is a multiple of ${k} (zero included).`,
          alphabet,
          automaton: buildModKDFA(alphabet, symbol, k),
          hints: [`Track the running count of "${symbol}" modulo ${k}.`, `You need exactly ${k} states arranged in a cycle.`],
          learningObjective: 'modular counting',
        };
      },
    },
    {
      objective: 'run-length constraints',
      build: () => {
        const symbol = pick(rng, alphabet);
        const maxRun = randInt(rng, params.maxRun[0], params.maxRun[1]);
        return {
          title: `No more than ${maxRun} consecutive "${symbol}"`,
          description: `Design a DFA over {${alphabet.join(', ')}} that accepts strings with no more than ${maxRun} consecutive occurrences of "${symbol}".`,
          alphabet,
          automaton: buildNoConsecutiveDFA(alphabet, symbol, maxRun),
          hints: [
            `Track how many "${symbol}" you've just seen in a row; any other symbol resets that count to zero.`,
            'Once the run gets too long you need a "dead" state with no way back to acceptance.',
          ],
          learningObjective: 'run-length constraints',
        };
      },
    },
  ];

  const chosen = pickFamily(rng, families, objective);
  return {
    automatonType: 'DFA',
    difficulty,
    sampleTests: buildFaSampleTests(chosen.automaton!, 'DFA', alphabet),
    ...chosen,
  };
};

// ---------------------------------------------------------------------------
// NFA reference-solution builders
// ---------------------------------------------------------------------------

/** Nondeterministic "guess where the match starts" substring detector. */
export const buildNfaContainsSubstring = (alphabet: string[], pattern: string): Automaton => {
  const m = pattern.length;
  const nodes: AutomatonNode[] = [{ id: 'q0', label: 'q0', isStart: true, isAccept: m === 0 }];
  for (let i = 1; i <= m; i++) nodes.push({ id: `q${i}`, label: `q${i}`, isStart: false, isAccept: i === m });

  const edges: AutomatonEdge[] = [];
  for (const c of alphabet) edges.push({ id: `e-q0-loop-${c}`, source: 'q0', target: 'q0', symbols: [c] });
  edges.push({ id: 'e-q0-start', source: 'q0', target: 'q1', symbols: [pattern[0]] });
  for (let i = 1; i < m; i++) edges.push({ id: `e-q${i}-q${i + 1}`, source: `q${i}`, target: `q${i + 1}`, symbols: [pattern[i]] });
  for (const c of alphabet) edges.push({ id: `e-qm-loop-${c}`, source: `q${m}`, target: `q${m}`, symbols: [c] });

  return { nodes, edges };
};

/** Epsilon-NFA union of two "ends with <pattern>" sub-machines. */
export const buildNfaUnionOfSuffixes = (alphabet: string[], patternA: string, patternB: string): Automaton => {
  const subA = buildPatternDFA(alphabet, patternA, 'endsWith');
  const subB = buildPatternDFA(alphabet, patternB, 'endsWith');
  const renameA = (id: string) => `A_${id}`;
  const renameB = (id: string) => `B_${id}`;

  const nodes: AutomatonNode[] = [
    { id: 'start', label: 'start', isStart: true, isAccept: false },
    ...subA.nodes.map(n => ({ ...n, id: renameA(n.id), label: renameA(n.id), isStart: false })),
    ...subB.nodes.map(n => ({ ...n, id: renameB(n.id), label: renameB(n.id), isStart: false })),
  ];
  const edges: AutomatonEdge[] = [
    { id: 'e-start-A', source: 'start', target: renameA('q0'), symbols: ['ε'] },
    { id: 'e-start-B', source: 'start', target: renameB('q0'), symbols: ['ε'] },
    ...subA.edges.map(e => ({ ...e, id: renameA(e.id), source: renameA(e.source), target: renameA(e.target) })),
    ...subB.edges.map(e => ({ ...e, id: renameB(e.id), source: renameB(e.source), target: renameB(e.target) })),
  ];
  return { nodes, edges };
};

const generateNFAExercise = (rng: Rng, difficulty: Difficulty, objective?: string): GeneratedExercise => {
  const params = DIFFICULTY_PARAMS[difficulty];
  const alphabet = pick(rng, params.alphabetPool);

  const families: Family<FamilyResult>[] = [
    {
      objective: 'nondeterminism',
      build: () => {
        const len = randInt(rng, params.patternLen[0], params.patternLen[1]);
        const pattern = randomString(rng, alphabet, len);
        return {
          title: `Contains "${pattern}" (NFA)`,
          description: `Design an NFA over {${alphabet.join(', ')}} that accepts strings containing "${pattern}" as a substring. Use nondeterminism to "guess" where the match starts.`,
          alphabet,
          automaton: buildNfaContainsSubstring(alphabet, pattern),
          hints: [
            'From the start state, guess whether the match begins here or not — having two valid transitions on the same symbol is exactly what makes this an NFA.',
            `Chain ${len} states together, one per character of "${pattern}", then loop the final state on every symbol once matched.`,
          ],
          learningObjective: 'nondeterminism',
        };
      },
    },
    {
      objective: 'closure properties',
      build: () => {
        const len = randInt(rng, params.patternLen[0], params.patternLen[1]);
        const a = randomString(rng, alphabet, len);
        let b = randomString(rng, alphabet, len);
        if (b === a) {
          const alt = alphabet.find(c => c !== b[b.length - 1]) ?? b[b.length - 1];
          b = b.slice(0, -1) + alt;
        }
        return {
          title: `Ends with "${a}" or "${b}"`,
          description: `Design an NFA over {${alphabet.join(', ')}} that accepts strings ending in "${a}" OR ending in "${b}", built as the union of two smaller machines joined by epsilon transitions.`,
          alphabet,
          automaton: buildNfaUnionOfSuffixes(alphabet, a, b),
          hints: [
            'Build one small machine for "ends with the first pattern" and another for "ends with the second".',
            'Add a new start state with epsilon transitions into both machines — this is the closure-under-union construction.',
          ],
          learningObjective: 'closure properties',
        };
      },
    },
  ];

  const chosen = pickFamily(rng, families, objective);
  return {
    automatonType: 'NFA',
    difficulty,
    sampleTests: buildFaSampleTests(chosen.automaton!, 'NFA', alphabet),
    ...chosen,
  };
};

// ---------------------------------------------------------------------------
// Regex reference-solution builders
// ---------------------------------------------------------------------------

const generateRegexExercise = (rng: Rng, difficulty: Difficulty): GeneratedExercise => {
  const params = DIFFICULTY_PARAMS[difficulty];
  const alphabet = pick(rng, params.alphabetPool);
  const altGroup = `(${alphabet.join('|')})`;

  const families: Family<FamilyResult>[] = [
    {
      objective: 'regular expressions',
      build: () => {
        const len = randInt(rng, params.patternLen[0], params.patternLen[1]);
        const suffix = randomString(rng, alphabet, len);
        return {
          title: `Ends with "${suffix}"`,
          description: `Write a regular expression over {${alphabet.join(', ')}} that matches exactly the strings ending with "${suffix}".`,
          alphabet,
          regex: `${altGroup}*${suffix}`,
          hints: [`"${altGroup}*" matches any prefix; force the string to finish with "${suffix}".`],
          learningObjective: 'regular expressions',
        };
      },
    },
    {
      objective: 'regular expressions',
      build: () => {
        const len = randInt(rng, params.patternLen[0], params.patternLen[1]);
        const mid = randomString(rng, alphabet, len);
        return {
          title: `Contains "${mid}"`,
          description: `Write a regular expression over {${alphabet.join(', ')}} that matches strings containing "${mid}" anywhere.`,
          alphabet,
          regex: `${altGroup}*${mid}${altGroup}*`,
          hints: [`Wrap "${mid}" with "${altGroup}*" on both sides so it can appear anywhere in the string.`],
          learningObjective: 'regular expressions',
        };
      },
    },
    {
      objective: 'regular expressions',
      build: () => {
        const symbol = pick(rng, alphabet);
        const others = alphabet.filter(c => c !== symbol);
        const otherGroup = `(${others.join('|')})`;
        return {
          title: `Exactly one "${symbol}"`,
          description: `Write a regular expression over {${alphabet.join(', ')}} that matches strings containing exactly one "${symbol}".`,
          alphabet,
          regex: `${otherGroup}*${symbol}${otherGroup}*`,
          hints: [`Everything before and after the single "${symbol}" must avoid "${symbol}" itself.`],
          learningObjective: 'regular expressions',
        };
      },
    },
  ];

  const chosen = pickFamily(rng, families);
  const referenceNfa = regexToNfa(chosen.regex!);
  return {
    automatonType: 'Regex',
    difficulty,
    sampleTests: buildRegexSampleTests(referenceNfa, alphabet),
    ...chosen,
  };
};

// ---------------------------------------------------------------------------
// CFG reference-solution builders (all non-empty languages: no epsilon
// productions, which sidesteps the CYK table's empty-string edge case)
// ---------------------------------------------------------------------------

const CFG_SYMBOL_PAIRS: ReadonlyArray<readonly [string, string]> = [['a', 'b'], ['x', 'y'], ['0', '1']];

const generateCFGExercise = (rng: Rng, difficulty: Difficulty, objective?: string): GeneratedExercise => {
  const families: Family<FamilyResult>[] = [
    {
      objective: 'recursion',
      build: () => ({
        title: 'Balanced parentheses',
        description: 'Write a context-free grammar over {(, )} that generates exactly the non-empty strings of balanced parentheses.',
        alphabet: ['(', ')'],
        rules: { S: ['( )', '( S )', 'S S'] },
        startSymbol: 'S',
        hints: [
          'Every balanced string is either two shorter balanced strings side by side, or one balanced string wrapped in an outer pair.',
          'The smallest balanced string is "()".',
        ],
        learningObjective: 'recursion',
      }),
    },
    {
      objective: 'context-free grammars',
      build: () => {
        const [x, y] = pick(rng, CFG_SYMBOL_PAIRS);
        return {
          title: `${x}ⁿ${y}ⁿ`,
          description: `Write a context-free grammar over {${x}, ${y}} that generates exactly the strings ${x}ⁿ${y}ⁿ for n ≥ 1 (equal numbers of "${x}" followed by equal numbers of "${y}").`,
          alphabet: [x, y],
          rules: { S: [`${x} ${y}`, `${x} S ${y}`] },
          startSymbol: 'S',
          hints: [`Every derivation adds one "${x}" on the left and one "${y}" on the right of a shorter valid string.`, `The base case is "${x}${y}".`],
          learningObjective: 'context-free grammars',
        };
      },
    },
    {
      objective: 'recursion',
      build: () => {
        const [x, y] = pick(rng, CFG_SYMBOL_PAIRS);
        return {
          title: `Palindromes over {${x}, ${y}}`,
          description: `Write a context-free grammar over {${x}, ${y}} that generates exactly the non-empty palindromes.`,
          alphabet: [x, y],
          rules: { S: [x, y, `${x} ${x}`, `${y} ${y}`, `${x} S ${x}`, `${y} S ${y}`] },
          startSymbol: 'S',
          hints: [
            'Wrapping a shorter palindrome in the same symbol on both sides keeps it a palindrome.',
            'You need base cases for both odd length (a single symbol) and even length (two of the same symbol).',
          ],
          learningObjective: 'recursion',
        };
      },
    },
  ];

  const chosen = pickFamily(rng, families, objective);
  return {
    automatonType: 'CFG',
    difficulty,
    sampleTests: buildCfgSampleTests(chosen.rules!, chosen.startSymbol!, chosen.alphabet),
    ...chosen,
  };
};

// ---------------------------------------------------------------------------
// PDA reference-solution builders
// ---------------------------------------------------------------------------

/**
 * aⁿbⁿ (n >= 1): push a marker per first symbol, pop one per second symbol,
 * then confirm the stack emptied back to its base marker before accepting.
 * q0 has only a single, input-consuming edge into q0b — with no epsilon
 * route out of q0 itself, at least one "a" must be read before the machine
 * can ever reach the accept state, so the empty string is correctly rejected.
 */
export const buildAnBnPDA = (a: string, b: string): Automaton => ({
  nodes: [
    { id: 'q0', label: 'q0 (start)', isStart: true, isAccept: false },
    { id: 'q0b', label: 'q0b (push)', isStart: false, isAccept: false },
    { id: 'q1', label: 'q1 (pop)', isStart: false, isAccept: false },
    { id: 'q2', label: 'q2 (accept)', isStart: false, isAccept: true },
  ],
  edges: [
    { id: 'e-q0-first-push', source: 'q0', target: 'q0b', symbols: [`${a}, ε -> A`] },
    { id: 'e-q0b-push', source: 'q0b', target: 'q0b', symbols: [`${a}, ε -> A`] },
    { id: 'e-q0b-q1', source: 'q0b', target: 'q1', symbols: ['ε, ε -> ε'] },
    { id: 'e-q1-pop', source: 'q1', target: 'q1', symbols: [`${b}, A -> ε`] },
    { id: 'e-q1-q2', source: 'q1', target: 'q2', symbols: ['ε, Z -> Z'] },
  ],
});

/**
 * Non-empty even-length palindromes: push every symbol, guess the middle,
 * then pop-and-match the rest before accepting. Same "mandatory first push"
 * shape as `buildAnBnPDA` so the empty string is rejected rather than
 * vacuously accepted by an immediate push->compare->accept guess.
 */
export const buildPalindromePDA = (alphabet: string[]): Automaton => ({
  nodes: [
    { id: 'q0', label: 'q0 (start)', isStart: true, isAccept: false },
    { id: 'q0b', label: 'q0b (push)', isStart: false, isAccept: false },
    { id: 'q1', label: 'q1 (compare)', isStart: false, isAccept: false },
    { id: 'q2', label: 'q2 (accept)', isStart: false, isAccept: true },
  ],
  edges: [
    ...alphabet.map(c => ({ id: `e-q0-first-push-${c}`, source: 'q0', target: 'q0b', symbols: [`${c}, ε -> ${c}`] })),
    ...alphabet.map(c => ({ id: `e-q0b-push-${c}`, source: 'q0b', target: 'q0b', symbols: [`${c}, ε -> ${c}`] })),
    { id: 'e-q0b-q1', source: 'q0b', target: 'q1', symbols: ['ε, ε -> ε'] },
    ...alphabet.map(c => ({ id: `e-q1-pop-${c}`, source: 'q1', target: 'q1', symbols: [`${c}, ${c} -> ε`] })),
    { id: 'e-q1-q2', source: 'q1', target: 'q2', symbols: ['ε, Z -> Z'] },
  ],
});

const generatePDAExercise = (rng: Rng, difficulty: Difficulty, objective?: string): GeneratedExercise => {
  const families: Family<FamilyResult>[] = [
    {
      objective: 'stack-based recognition',
      build: () => {
        const [x, y] = pick(rng, CFG_SYMBOL_PAIRS);
        return {
          title: `${x}ⁿ${y}ⁿ (PDA)`,
          description: `Design a PDA over {${x}, ${y}} that accepts exactly the strings ${x}ⁿ${y}ⁿ for n ≥ 1, by pushing a marker for every "${x}" and popping one for every "${y}".`,
          alphabet: [x, y],
          automaton: buildAnBnPDA(x, y),
          hints: [
            `Push a stack symbol every time you read "${x}".`,
            `Pop one stack symbol per "${y}" — accept only if you run out of markers exactly when the input ends.`,
            'You need an epsilon transition to switch from "pushing" to "popping", and another to confirm the stack is back to its base marker before accepting.',
          ],
          learningObjective: 'stack-based recognition',
        };
      },
    },
    {
      objective: 'pushdown automata',
      build: () => {
        const alphabet = pick(rng, [['a', 'b'], ['0', '1']]);
        return {
          title: 'Even-length palindromes (PDA)',
          description: `Design a PDA over {${alphabet.join(', ')}} that accepts exactly the non-empty even-length palindromes.`,
          alphabet,
          automaton: buildPalindromePDA(alphabet),
          hints: [
            'Push every symbol you read onto the stack.',
            'Nondeterministically guess the middle of the string, then start popping and comparing each remaining input symbol against the stack top.',
            'Accept only once the stack is back to its base marker exactly when the input ends.',
          ],
          learningObjective: 'pushdown automata',
        };
      },
    },
  ];

  const chosen = pickFamily(rng, families, objective);
  return {
    automatonType: 'PDA',
    difficulty,
    sampleTests: buildBatchSampleTests(chosen.automaton!, 'PDA', chosen.alphabet, 6),
    ...chosen,
  };
};

// ---------------------------------------------------------------------------
// TM reference-solution builder
// ---------------------------------------------------------------------------

/** Unary length divisible by k: cycle through k states while moving right; accept on blank only from the "remainder 0" state. */
export const buildUnaryDivisibleByKTM = (k: number): Automaton => {
  const nodes: AutomatonNode[] = [
    ...Array.from({ length: k }, (_, i) => ({ id: `q${i}`, label: `q${i}`, isStart: i === 0, isAccept: false })),
    { id: 'accept', label: 'accept', isStart: false, isAccept: true },
    { id: 'reject', label: 'reject', isStart: false, isAccept: false, isReject: true },
  ];
  const edges: AutomatonEdge[] = [];
  for (let i = 0; i < k; i++) {
    edges.push({ id: `e-q${i}-1`, source: `q${i}`, target: `q${(i + 1) % k}`, symbols: ['1 -> 1, R'] });
    edges.push({ id: `e-q${i}-blank`, source: `q${i}`, target: i === 0 ? 'accept' : 'reject', symbols: ['_ -> _, S'] });
  }
  return { nodes, edges };
};

const generateTMExercise = (rng: Rng, difficulty: Difficulty): GeneratedExercise => {
  const params = DIFFICULTY_PARAMS[difficulty];
  const k = randInt(rng, params.k[0], params.k[1]);
  const automaton = buildUnaryDivisibleByKTM(k);
  const description =
    k === 2
      ? 'Design a Turing machine over the unary alphabet {1} that accepts exactly the strings whose length is even (the empty string included).'
      : `Design a Turing machine over the unary alphabet {1} that accepts exactly the strings whose length is a multiple of ${k} (the empty string included).`;

  return {
    automatonType: 'TM',
    difficulty,
    title: k === 2 ? 'Even length (unary TM)' : `Length divisible by ${k} (unary TM)`,
    description,
    alphabet: ['1'],
    automaton,
    hints: [
      `Cycle through ${k} states as you move right, one state per remainder mod ${k}.`,
      'When you reach the blank symbol, accept only if you are back in the "remainder 0" state.',
    ],
    learningObjective: 'unary computation',
    sampleTests: buildBatchSampleTests(automaton, 'TM', ['1'], 12),
  };
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export const generateExercise = (
  automatonType: ExerciseAutomatonType,
  difficulty: Difficulty,
  learningObjective?: string,
  seed: number = Math.floor(Math.random() * 2 ** 31)
): GeneratedExercise => {
  const rng = mulberry32(seed);
  switch (automatonType) {
    case 'DFA':
      return generateDFAExercise(rng, difficulty, learningObjective);
    case 'NFA':
      return generateNFAExercise(rng, difficulty, learningObjective);
    case 'Regex':
      return generateRegexExercise(rng, difficulty);
    case 'CFG':
      return generateCFGExercise(rng, difficulty, learningObjective);
    case 'PDA':
      return generatePDAExercise(rng, difficulty, learningObjective);
    case 'TM':
      return generateTMExercise(rng, difficulty);
  }
};
