import { describe, expect, it } from 'vitest';
import { regexToAst } from '../regex';

describe('regexToAst', () => {
  it('parses a literal', () => {
    expect(regexToAst('a')).toEqual({ type: 'literal', value: 'a' });
  });

  it('parses concatenation left-associatively', () => {
    const ast = regexToAst('ab');
    expect(ast).toEqual({
      type: 'concat',
      left: { type: 'literal', value: 'a' },
      right: { type: 'literal', value: 'b' },
    });
  });

  it('parses union with lower precedence than concatenation', () => {
    const ast = regexToAst('ab|c');
    expect(ast.type).toBe('union');
    if (ast.type === 'union') {
      expect(ast.left).toEqual({ type: 'concat', left: { type: 'literal', value: 'a' }, right: { type: 'literal', value: 'b' } });
      expect(ast.right).toEqual({ type: 'literal', value: 'c' });
    }
  });

  it('parses star binding tighter than concatenation', () => {
    const ast = regexToAst('ab*');
    expect(ast.type).toBe('concat');
    if (ast.type === 'concat') {
      expect(ast.left).toEqual({ type: 'literal', value: 'a' });
      expect(ast.right).toEqual({ type: 'star', child: { type: 'literal', value: 'b' } });
    }
  });

  it('parses parenthesized groups', () => {
    const ast = regexToAst('(a|b)*');
    expect(ast.type).toBe('star');
    if (ast.type === 'star') {
      expect(ast.child.type).toBe('union');
    }
  });

  it('throws for an invalid pattern', () => {
    expect(() => regexToAst('*a')).toThrow();
    expect(() => regexToAst('')).toThrow();
  });
});
