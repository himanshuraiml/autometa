import { describe, it, expect } from 'vitest';
import { simplifyRegex, astToRegex, simplifyRegexAst } from '../regexSimplify';
import { regexToAst } from '../regex';
import { regexToDfa, findLanguageCounterexample } from '../fa';

/** Asserts the simplified pattern accepts exactly the same language as the original. */
const expectLanguagePreserved = (pattern: string) => {
  const simplified = simplifyRegex(pattern);
  const result = findLanguageCounterexample(regexToDfa(pattern), regexToDfa(simplified));
  expect(result.equivalent, `"${pattern}" -> "${simplified}" changed the language (counterexample: ${JSON.stringify((result as any).counterexample)})`).toBe(true);
};

describe('simplifyRegexAst — idempotent closure collapsing', () => {
  it('collapses star(star(x)) to star(x)', () => {
    expect(simplifyRegex('(a*)*')).toBe('a*');
  });

  it('collapses star(question(x)) to star(x)', () => {
    expect(simplifyRegex('(a?)*')).toBe('a*');
  });

  it('collapses star(plus(x)) to star(x)', () => {
    expect(simplifyRegex('(a+)*')).toBe('a*');
  });

  it('collapses plus(star(x)) to star(x)', () => {
    expect(simplifyRegex('(a*)+')).toBe('a*');
  });

  it('collapses plus(plus(x)) to plus(x)', () => {
    expect(simplifyRegex('(a+)+')).toBe('a+');
  });

  it('collapses plus(question(x)) to star(x)', () => {
    expect(simplifyRegex('(a?)+')).toBe('a*');
  });

  it('collapses question(star(x)) to star(x)', () => {
    expect(simplifyRegex('(a*)?')).toBe('a*');
  });

  it('collapses question(plus(x)) to star(x)', () => {
    expect(simplifyRegex('(a+)?')).toBe('a*');
  });

  it('collapses question(question(x)) to question(x)', () => {
    expect(simplifyRegex('(a?)?')).toBe('a?');
  });

  it('collapses triple nesting in one pass', () => {
    expect(simplifyRegex('((a*)+)?')).toBe('a*');
  });

  it('collapses nested closures on a compound child', () => {
    expect(simplifyRegex('((ab)*)*')).toBe('(ab)*');
  });
});

describe('simplifyRegexAst — union flattening and dedup', () => {
  it('removes an exact duplicate alternative', () => {
    expect(simplifyRegex('a|b|a')).toBe('a|b');
  });

  it('removes duplicates after simplifying each branch first', () => {
    // (a?)* and a* both simplify to a* before dedup runs.
    expect(simplifyRegex('(a?)*|a*')).toBe('a*');
  });

  it('leaves distinct alternatives untouched', () => {
    expect(simplifyRegex('a|b|c')).toBe('a|b|c');
  });
});

describe('astToRegex — precedence-correct serialization', () => {
  it('parenthesizes a union nested inside concat', () => {
    const ast = regexToAst('(a|b)c');
    expect(astToRegex(ast)).toBe('(a|b)c');
  });

  it('parenthesizes a concat nested inside star', () => {
    const ast = regexToAst('(ab)*');
    expect(astToRegex(ast)).toBe('(ab)*');
  });

  it('does not add unnecessary parentheses', () => {
    const ast = regexToAst('a|b|c');
    expect(astToRegex(ast)).toBe('a|b|c');
  });

  it('round-trips through simplify unchanged when already simplest', () => {
    const ast = regexToAst('(a|b)*abb');
    expect(astToRegex(simplifyRegexAst(ast))).toBe('(a|b)*abb');
  });
});

describe('simplifyRegex — language preservation', () => {
  it('preserves the language across every simplification above', () => {
    ['(a*)*', '(a?)*', '(a+)*', '(a*)+', '(a+)+', '(a?)+', '(a*)?', '(a+)?', '(a?)?', 'a|b|a', '(a?)*|a*', '(a|b)*abb', 'a(b|b)c'].forEach(expectLanguagePreserved);
  });
});
