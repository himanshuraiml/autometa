import { describe, it, expect } from 'vitest';
import { 
  regexToNfa, 
  cfgToCNF, 
  cfgToGNF, 
  cykParse, 
  computeFirstAndFollow, 
  generateLL1Table,
  generateLeftmostDerivation,
  generateSLR1Table
} from '../index';

describe('Advanced Rule Engine - Compilers & Parsing Algorithms', () => {
  describe('Regex to NFA (Thompson\'s Construction)', () => {
    it('should build NFA for simple concatenation', () => {
      const nfa = regexToNfa('ab');
      expect(nfa.nodes.length).toBeGreaterThan(0);
      expect(nfa.edges.some(e => e.symbols.includes('a'))).toBe(true);
      expect(nfa.edges.some(e => e.symbols.includes('b'))).toBe(true);
    });

    it('should build NFA for union operations', () => {
      const nfa = regexToNfa('a|b');
      expect(nfa.edges.some(e => e.symbols.includes('ε'))).toBe(true);
    });

    it('should build NFA for Kleene Star operations', () => {
      const nfa = regexToNfa('a*');
      expect(nfa.edges.some(e => e.symbols.includes('ε'))).toBe(true);
    });
  });

  describe('CFG Chomsky Normal Form (CNF) & Greibach Normal Form (GNF)', () => {
    it('should simplify and convert CFG to CNF format', () => {
      // S -> a S b | ε
      const grammar = {
        'S': ['a S b', 'ε']
      };
      const cnf = cfgToCNF(grammar);
      
      // All productions in CNF must have length 1 (terminals) or length 2 (variables)
      Object.keys(cnf).forEach(nt => {
        cnf[nt].forEach(prod => {
          const symbols = prod.split(/\s+/).filter(Boolean);
          expect(symbols.length).toBeLessThanOrEqual(2);
        });
      });
    });

    it('should simplify and structure GNF format', () => {
      const grammar = {
        'S': ['a S b', 'ab']
      };
      const gnf = cfgToGNF(grammar);
      expect(gnf).toBeDefined();
    });
  });

  describe('CYK Parsing Algorithm', () => {
    it('should verify word acceptance in CFG', () => {
      // S -> A B, A -> a, B -> b
      const grammar = {
        'S': ['A B'],
        'A': ['a'],
        'B': ['b']
      };
      expect(cykParse(grammar, 'S', 'ab')).toBe(true);
      expect(cykParse(grammar, 'S', 'aa')).toBe(false);
    });
  });

  describe('FIRST / FOLLOW & LL(1) Tables', () => {
    it('should compute valid FIRST and FOLLOW sets', () => {
      // S -> a A, A -> b | ε
      const grammar = {
        'S': ['a A'],
        'A': ['b', 'ε']
      };
      const { first, follow } = computeFirstAndFollow(grammar, 'S');
      
      expect(first['S'].has('a')).toBe(true);
      expect(first['A'].has('b')).toBe(true);
      expect(first['A'].has('ε')).toBe(true);
      
      expect(follow['S'].has('$')).toBe(true);
      expect(follow['A'].has('$')).toBe(true);
    });

    it('should generate LL(1) parsing tables', () => {
      const grammar = {
        'S': ['a A'],
        'A': ['b', 'ε']
      };
      const { table, conflicts } = generateLL1Table(grammar, 'S');
      expect(table['S']['a']).toEqual(['a A']);
      expect(table['A']['b']).toEqual(['b']);
      expect(conflicts).toEqual([]);
    });
  });

  describe('Leftmost Derivation', () => {
    it('should find leftmost derivation steps for valid inputs', () => {
      const grammar = {
        'S': ['( S )', '()', '']
      };
      const derivation = generateLeftmostDerivation(grammar, 'S', '(())');
      expect(derivation).not.toBeNull();
      expect(derivation![0]).toBe('S');
      expect(derivation![derivation!.length - 1]).toBe('( () )');
    });

    it('should return null for invalid inputs', () => {
      const grammar = {
        'S': ['a S b', 'ab']
      };
      const derivation = generateLeftmostDerivation(grammar, 'S', 'aab');
      expect(derivation).toBeNull();
    });
  });

  describe('SLR(1) Parsing Table', () => {
    it('should build a valid SLR(1) parse table for simple grammar', () => {
      const grammar = {
        'S': ['E'],
        'E': ['E + T', 'T'],
        'T': ['id']
      };
      const result = generateSLR1Table(grammar, 'S');
      expect(result.states.length).toBeGreaterThan(0);
      expect(result.terminals).toContain('id');
      expect(result.terminals).toContain('+');
      expect(result.terminals).toContain('$');
      expect(result.nonTerminals).toContain('E');
      expect(result.nonTerminals).toContain('T');
      // State 0 on 'id' should be a shift action
      const act0id = result.actionTable[0]['id'];
      expect(act0id).toBeDefined();
      expect(act0id[0].type).toBe('shift');
    });
  });
});
