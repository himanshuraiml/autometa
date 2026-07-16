import type { Automaton, AutomatonNode, AutomatonEdge } from '@autometa/simulation-engine';

/**
 * --- SPRINT 9: ADVANCED RULE ENGINE ALGORITHMS ---
 */

/**
 * Regex to NFA (Thompson's Construction)
 * Supports: literals, concatenation, union (|), Kleene star (*), one-or-more (+),
 * optional (?), parentheses, character classes ([a-z], [abc], [^a]), and the
 * wildcard (.). "." and negated classes expand against an alphabet inferred from
 * the literal symbols used elsewhere in the same pattern (this app has no global
 * fixed alphabet to fall back on).
 */

type RegexTokenType = 'LITERAL' | 'CLASS' | 'WILDCARD' | 'UNION' | 'CONCAT' | 'STAR' | 'PLUS' | 'QUESTION' | 'LPAREN' | 'RPAREN';

interface RegexToken {
  type: RegexTokenType;
  value?: string;
  chars?: string[];
  negated?: boolean;
}

const REGEX_LITERAL_RE = /[a-zA-Z0-9]/;

const tokenizeRegex = (pattern: string): RegexToken[] => {
  const tokens: RegexToken[] = [];
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
    if (c === '|') { tokens.push({ type: 'UNION' }); i++; continue; }
    if (c === '*') { tokens.push({ type: 'STAR' }); i++; continue; }
    if (c === '+') { tokens.push({ type: 'PLUS' }); i++; continue; }
    if (c === '?') { tokens.push({ type: 'QUESTION' }); i++; continue; }
    if (c === '.') { tokens.push({ type: 'WILDCARD' }); i++; continue; }
    if (c === '[') {
      const closeIdx = pattern.indexOf(']', i + 1);
      if (closeIdx === -1) throw new Error(`Unclosed character class starting at position ${i}.`);
      let body = pattern.slice(i + 1, closeIdx);
      let negated = false;
      if (body.startsWith('^')) { negated = true; body = body.slice(1); }
      if (body.length === 0) throw new Error('Empty character class "[]" is not allowed.');
      const chars = new Set<string>();
      let j = 0;
      while (j < body.length) {
        if (body[j + 1] === '-' && j + 2 < body.length) {
          const from = body.charCodeAt(j);
          const to = body.charCodeAt(j + 2);
          if (to < from) throw new Error(`Invalid character range "${body[j]}-${body[j + 2]}" in character class.`);
          for (let code = from; code <= to; code++) chars.add(String.fromCharCode(code));
          j += 3;
        } else {
          chars.add(body[j]);
          j += 1;
        }
      }
      tokens.push({ type: 'CLASS', chars: Array.from(chars), negated });
      i = closeIdx + 1;
      continue;
    }
    if (REGEX_LITERAL_RE.test(c)) {
      tokens.push({ type: 'LITERAL', value: c });
      i++;
      continue;
    }
    throw new Error(`Unsupported character "${c}" in regex.`);
  }
  return tokens;
};

const inferAlphabet = (tokens: RegexToken[]): string[] => {
  const alphabet = new Set<string>();
  for (const t of tokens) {
    if (t.type === 'LITERAL' && t.value) alphabet.add(t.value);
    if (t.type === 'CLASS' && !t.negated && t.chars) t.chars.forEach((ch) => alphabet.add(ch));
  }
  return Array.from(alphabet).sort();
};

const CONCAT_LEFT_TYPES: RegexTokenType[] = ['LITERAL', 'CLASS', 'WILDCARD', 'RPAREN', 'STAR', 'PLUS', 'QUESTION'];
const CONCAT_RIGHT_TYPES: RegexTokenType[] = ['LITERAL', 'CLASS', 'WILDCARD', 'LPAREN'];

const insertConcatTokens = (tokens: RegexToken[]): RegexToken[] => {
  const result: RegexToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    result.push(tokens[i]);
    const next = tokens[i + 1];
    if (next && CONCAT_LEFT_TYPES.includes(tokens[i].type) && CONCAT_RIGHT_TYPES.includes(next.type)) {
      result.push({ type: 'CONCAT' });
    }
  }
  return result;
};

const REGEX_PRECEDENCE: Partial<Record<RegexTokenType, number>> = { STAR: 4, PLUS: 4, QUESTION: 4, CONCAT: 3, UNION: 1 };

const regexToPostfix = (tokens: RegexToken[]): RegexToken[] => {
  const output: RegexToken[] = [];
  const opStack: RegexToken[] = [];
  for (const t of tokens) {
    if (t.type === 'LITERAL' || t.type === 'CLASS' || t.type === 'WILDCARD') {
      output.push(t);
    } else if (t.type === 'LPAREN') {
      opStack.push(t);
    } else if (t.type === 'RPAREN') {
      while (opStack.length > 0 && opStack[opStack.length - 1].type !== 'LPAREN') {
        output.push(opStack.pop()!);
      }
      if (opStack.length === 0) throw new Error('Mismatched parentheses: missing "(".');
      opStack.pop();
    } else {
      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1].type !== 'LPAREN' &&
        (REGEX_PRECEDENCE[opStack[opStack.length - 1].type] ?? 0) >= (REGEX_PRECEDENCE[t.type] ?? 0)
      ) {
        output.push(opStack.pop()!);
      }
      opStack.push(t);
    }
  }
  while (opStack.length > 0) {
    const op = opStack.pop()!;
    if (op.type === 'LPAREN') throw new Error('Mismatched parentheses: missing ")".');
    output.push(op);
  }
  return output;
};

interface NfaFragment {
  start: string;
  accept: string;
  nodes: AutomatonNode[];
  edges: AutomatonEdge[];
}

export interface RegexNfaStep {
  description: string;
  fragment: Automaton;
}

const snapshotFragment = (frag: NfaFragment): Automaton => ({
  nodes: frag.nodes.map((n) => ({ ...n, isStart: n.id === frag.start })),
  edges: frag.edges.map((e) => ({ ...e })),
});

/**
 * Builds a Thompson NFA from a regex, recording one step per postfix token so
 * the UI can walk through fragments being constructed and combined.
 */
export const regexToNfaSteps = (regex: string): RegexNfaStep[] => {
  const trimmed = regex.trim();
  if (!trimmed) throw new Error('Enter a regular expression first.');

  const tokens = tokenizeRegex(trimmed);
  if (tokens.length === 0) throw new Error('Enter a regular expression first.');
  const alphabet = inferAlphabet(tokens);
  const postfix = regexToPostfix(insertConcatTokens(tokens));

  let stateCounter = 0;
  let edgeCounter = 0;
  const fragStack: NfaFragment[] = [];
  const steps: RegexNfaStep[] = [];

  const newState = (isAccept = false): AutomatonNode => ({
    id: `q${stateCounter++}`,
    label: `q${stateCounter - 1}`,
    isStart: false,
    isAccept,
  });

  const recordStep = (description: string, frag: NfaFragment) => {
    steps.push({ description, fragment: snapshotFragment(frag) });
  };

  const buildSymbolFragment = (symbols: string[], description: string) => {
    if (symbols.length === 0) {
      throw new Error(
        'Cannot use "." or a negated character class without at least one literal symbol elsewhere in the pattern to infer an alphabet from.'
      );
    }
    if (symbols.length === 1) {
      const start = newState();
      const accept = newState(true);
      const edge: AutomatonEdge = { id: `e${edgeCounter++}`, source: start.id, target: accept.id, symbols: [symbols[0]] };
      const frag: NfaFragment = { start: start.id, accept: accept.id, nodes: [start, accept], edges: [edge] };
      fragStack.push(frag);
      recordStep(description, frag);
      return;
    }
    const start = newState();
    const accept = newState(true);
    const nodes: AutomatonNode[] = [start, accept];
    const edges: AutomatonEdge[] = [];
    for (const sym of symbols) {
      const symStart = newState();
      const symAccept = newState();
      nodes.push(symStart, symAccept);
      edges.push(
        { id: `e${edgeCounter++}`, source: start.id, target: symStart.id, symbols: ['ε'] },
        { id: `e${edgeCounter++}`, source: symStart.id, target: symAccept.id, symbols: [sym] },
        { id: `e${edgeCounter++}`, source: symAccept.id, target: accept.id, symbols: ['ε'] }
      );
    }
    const frag: NfaFragment = { start: start.id, accept: accept.id, nodes, edges };
    fragStack.push(frag);
    recordStep(description, frag);
  };

  for (const tok of postfix) {
    if (tok.type === 'LITERAL') {
      buildSymbolFragment([tok.value!], `Literal "${tok.value}"`);
    } else if (tok.type === 'WILDCARD') {
      buildSymbolFragment(alphabet, `Wildcard "." (matches ${alphabet.join(', ')})`);
    } else if (tok.type === 'CLASS') {
      const symbols = tok.negated ? alphabet.filter((s) => !tok.chars!.includes(s)) : tok.chars!;
      const label = tok.negated ? `[^${tok.chars!.join('')}]` : `[${tok.chars!.join('')}]`;
      buildSymbolFragment(symbols, `Character class ${label}`);
    } else if (tok.type === 'CONCAT') {
      const right = fragStack.pop();
      const left = fragStack.pop();
      if (!left || !right) throw new Error('Invalid regular expression.');
      const bridge: AutomatonEdge = { id: `e${edgeCounter++}`, source: left.accept, target: right.start, symbols: ['ε'] };
      const leftAccept = left.nodes.find((n) => n.id === left.accept);
      if (leftAccept) leftAccept.isAccept = false;
      const frag: NfaFragment = {
        start: left.start,
        accept: right.accept,
        nodes: [...left.nodes, ...right.nodes],
        edges: [...left.edges, ...right.edges, bridge],
      };
      fragStack.push(frag);
      recordStep('Concatenate', frag);
    } else if (tok.type === 'UNION') {
      const right = fragStack.pop();
      const left = fragStack.pop();
      if (!left || !right) throw new Error('Invalid regular expression.');
      const start = newState();
      const accept = newState(true);
      const leftAccept = left.nodes.find((n) => n.id === left.accept);
      if (leftAccept) leftAccept.isAccept = false;
      const rightAccept = right.nodes.find((n) => n.id === right.accept);
      if (rightAccept) rightAccept.isAccept = false;
      const newEdges: AutomatonEdge[] = [
        { id: `e${edgeCounter++}`, source: start.id, target: left.start, symbols: ['ε'] },
        { id: `e${edgeCounter++}`, source: start.id, target: right.start, symbols: ['ε'] },
        { id: `e${edgeCounter++}`, source: left.accept, target: accept.id, symbols: ['ε'] },
        { id: `e${edgeCounter++}`, source: right.accept, target: accept.id, symbols: ['ε'] },
      ];
      const frag: NfaFragment = {
        start: start.id,
        accept: accept.id,
        nodes: [start, ...left.nodes, ...right.nodes, accept],
        edges: [...left.edges, ...right.edges, ...newEdges],
      };
      fragStack.push(frag);
      recordStep('Union (|)', frag);
    } else if (tok.type === 'STAR' || tok.type === 'PLUS' || tok.type === 'QUESTION') {
      const frag0 = fragStack.pop();
      if (!frag0) throw new Error('Invalid regular expression.');
      const start = newState();
      const accept = newState(true);
      const oldAccept = frag0.nodes.find((n) => n.id === frag0.accept);
      if (oldAccept) oldAccept.isAccept = false;

      const newEdges: AutomatonEdge[] = [
        { id: `e${edgeCounter++}`, source: start.id, target: frag0.start, symbols: ['ε'] },
        { id: `e${edgeCounter++}`, source: frag0.accept, target: accept.id, symbols: ['ε'] },
      ];
      if (tok.type === 'STAR' || tok.type === 'PLUS') {
        newEdges.push({ id: `e${edgeCounter++}`, source: frag0.accept, target: frag0.start, symbols: ['ε'] });
      }
      if (tok.type === 'STAR' || tok.type === 'QUESTION') {
        newEdges.push({ id: `e${edgeCounter++}`, source: start.id, target: accept.id, symbols: ['ε'] });
      }

      const frag: NfaFragment = { start: start.id, accept: accept.id, nodes: [start, ...frag0.nodes, accept], edges: [...frag0.edges, ...newEdges] };
      fragStack.push(frag);
      const desc = tok.type === 'STAR' ? 'Kleene Star (*)' : tok.type === 'PLUS' ? 'One-or-more (+)' : 'Optional (?)';
      recordStep(desc, frag);
    } else {
      throw new Error('Invalid regular expression.');
    }
  }

  if (fragStack.length !== 1) {
    throw new Error('Invalid regular expression: check operator placement and parentheses.');
  }

  return steps;
};

export const regexToNfa = (regex: string): Automaton => {
  const steps = regexToNfaSteps(regex);
  return steps[steps.length - 1]?.fragment ?? { nodes: [], edges: [] };
};

/** A parsed regex's abstract syntax tree, for the regex workspace's structure view. */
export type RegexAstNode =
  | { type: 'literal'; value: string }
  | { type: 'wildcard' }
  | { type: 'class'; chars: string[]; negated: boolean }
  | { type: 'concat'; left: RegexAstNode; right: RegexAstNode }
  | { type: 'union'; left: RegexAstNode; right: RegexAstNode }
  | { type: 'star'; child: RegexAstNode }
  | { type: 'plus'; child: RegexAstNode }
  | { type: 'question'; child: RegexAstNode };

/**
 * Parses a regex into an AST, reusing the exact same tokenize → insert-concat
 * → postfix pipeline as `regexToNfaSteps` (so anything that parses for one
 * parses identically for the other) but building tree nodes off the postfix
 * stream instead of automaton fragments.
 */
export const regexToAst = (regex: string): RegexAstNode => {
  const trimmed = regex.trim();
  if (!trimmed) throw new Error('Enter a regular expression first.');
  const tokens = tokenizeRegex(trimmed);
  if (tokens.length === 0) throw new Error('Enter a regular expression first.');
  const postfix = regexToPostfix(insertConcatTokens(tokens));

  const stack: RegexAstNode[] = [];
  for (const tok of postfix) {
    if (tok.type === 'LITERAL') {
      stack.push({ type: 'literal', value: tok.value! });
    } else if (tok.type === 'WILDCARD') {
      stack.push({ type: 'wildcard' });
    } else if (tok.type === 'CLASS') {
      stack.push({ type: 'class', chars: tok.chars!, negated: !!tok.negated });
    } else if (tok.type === 'CONCAT' || tok.type === 'UNION') {
      const right = stack.pop();
      const left = stack.pop();
      if (!left || !right) throw new Error('Invalid regular expression.');
      stack.push({ type: tok.type === 'CONCAT' ? 'concat' : 'union', left, right });
    } else if (tok.type === 'STAR' || tok.type === 'PLUS' || tok.type === 'QUESTION') {
      const child = stack.pop();
      if (!child) throw new Error('Invalid regular expression.');
      stack.push({ type: tok.type === 'STAR' ? 'star' : tok.type === 'PLUS' ? 'plus' : 'question', child });
    } else {
      throw new Error('Invalid regular expression.');
    }
  }
  if (stack.length !== 1) throw new Error('Invalid regular expression: check operator placement and parentheses.');
  return stack[0];
};
