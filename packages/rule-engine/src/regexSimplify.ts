import { regexToAst, type RegexAstNode } from './regex';

/** Precedence matching regex.ts's REGEX_PRECEDENCE (STAR/PLUS/QUESTION > CONCAT > UNION), plus atoms above all operators. */
const nodePrecedence = (node: RegexAstNode): number => {
  switch (node.type) {
    case 'union': return 1;
    case 'concat': return 3;
    case 'star':
    case 'plus':
    case 'question': return 4;
    case 'literal':
    case 'wildcard':
    case 'class': return 5;
  }
};

const serializeAtom = (node: RegexAstNode): string => {
  if (node.type === 'literal') return node.value;
  if (node.type === 'wildcard') return '.';
  if (node.type === 'class') return node.negated ? `[^${node.chars.join('')}]` : `[${node.chars.join('')}]`;
  throw new Error(`Not an atom: ${node.type}`);
};

/** Serializes an AST back to a regex pattern, parenthesizing only where precedence requires it. */
export const astToRegex = (node: RegexAstNode): string => {
  const go = (n: RegexAstNode, parentPrecedence: number): string => {
    const precedence = nodePrecedence(n);
    let rendered: string;
    switch (n.type) {
      case 'literal':
      case 'wildcard':
      case 'class':
        rendered = serializeAtom(n);
        break;
      case 'star':
        rendered = `${go(n.child, precedence)}*`;
        break;
      case 'plus':
        rendered = `${go(n.child, precedence)}+`;
        break;
      case 'question':
        rendered = `${go(n.child, precedence)}?`;
        break;
      case 'concat':
        rendered = `${go(n.left, precedence)}${go(n.right, precedence)}`;
        break;
      case 'union':
        rendered = `${go(n.left, precedence)}|${go(n.right, precedence)}`;
        break;
    }
    return precedence < parentPrecedence ? `(${rendered})` : rendered;
  };
  return go(node, 0);
};

/**
 * Composing two repetition operators (star/plus/question) collapses to a
 * single operator applied directly to the inner child — e.g. `(x+)* = x*`,
 * `(x?)+ = x*`, `(x?)? = x?`. Every one of the 9 combinations is a standard
 * regular-language identity, independent of what the child itself is.
 */
const REPETITION_COLLAPSE: Record<'star' | 'plus' | 'question', Record<'star' | 'plus' | 'question', 'star' | 'plus' | 'question'>> = {
  star: { star: 'star', plus: 'star', question: 'star' },
  plus: { star: 'star', plus: 'plus', question: 'star' },
  question: { star: 'star', plus: 'star', question: 'question' },
};

const flattenUnion = (node: RegexAstNode): RegexAstNode[] =>
  node.type === 'union' ? [...flattenUnion(node.left), ...flattenUnion(node.right)] : [node];

const rebuildUnion = (alternatives: RegexAstNode[]): RegexAstNode =>
  alternatives.reduce((acc, alt) => (acc ? { type: 'union', left: acc, right: alt } : alt));

/**
 * Bottom-up, language-preserving regex simplification: idempotent-closure
 * collapsing (`(a*)* -> a*`, `(a+)? -> a*`, etc.) and union flattening +
 * structural-dedup (`a|b|a -> a|b`). Deliberately conservative — no attempt
 * at full DFA-based minimality (regexToDfa/dfaToRegex already cover that
 * differently); every rule here is unconditionally sound on its own.
 */
export const simplifyRegexAst = (node: RegexAstNode): RegexAstNode => {
  switch (node.type) {
    case 'literal':
    case 'wildcard':
    case 'class':
      return node;

    case 'concat': {
      const left = simplifyRegexAst(node.left);
      const right = simplifyRegexAst(node.right);
      return { type: 'concat', left, right };
    }

    case 'union': {
      const alternatives = flattenUnion(node).map(simplifyRegexAst);
      const seen = new Set<string>();
      const deduped: RegexAstNode[] = [];
      for (const alt of alternatives) {
        const key = astToRegex(alt);
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(alt);
        }
      }
      return rebuildUnion(deduped);
    }

    case 'star':
    case 'plus':
    case 'question': {
      const child = simplifyRegexAst(node.child);
      if (child.type === 'star' || child.type === 'plus' || child.type === 'question') {
        const collapsed = REPETITION_COLLAPSE[node.type][child.type];
        return { type: collapsed, child: child.child };
      }
      return { type: node.type, child };
    }
  }
};

/** Parses, simplifies, and re-serializes a regex pattern in one call. */
export const simplifyRegex = (pattern: string): string => astToRegex(simplifyRegexAst(regexToAst(pattern)));
