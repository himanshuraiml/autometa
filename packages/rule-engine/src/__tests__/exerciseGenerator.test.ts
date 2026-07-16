import { describe, expect, it } from 'vitest';
import { simulateDFA, simulateNFA, simulatePDA, simulateTuringMachine } from '@autometa/simulation-engine';
import {
  buildPatternDFA,
  buildEvenCountDFA,
  buildModKDFA,
  buildNoConsecutiveDFA,
  buildNfaContainsSubstring,
  buildNfaUnionOfSuffixes,
  buildAnBnPDA,
  buildPalindromePDA,
  buildUnaryDivisibleByKTM,
  generateExercise,
  LEARNING_OBJECTIVES,
} from '../exerciseGenerator';

const ALPHABET = ['a', 'b'];

describe('buildPatternDFA', () => {
  it('endsWith mode accepts exactly the strings ending with the pattern (independent oracle: String.endsWith)', () => {
    const dfa = buildPatternDFA(ALPHABET, 'ab', 'endsWith');
    const candidates = ['', 'a', 'b', 'ab', 'ba', 'aab', 'bab', 'abab', 'aabb', 'bbab', 'aaab'];
    for (const input of candidates) {
      expect(simulateDFA(dfa, input).accepted).toBe(input.endsWith('ab'));
    }
  });

  it('contains mode accepts exactly the strings containing the pattern anywhere', () => {
    const dfa = buildPatternDFA(ALPHABET, 'ab', 'contains');
    const candidates = ['', 'a', 'b', 'ab', 'ba', 'aab', 'bba', 'bbaab', 'aaa', 'bbb'];
    for (const input of candidates) {
      expect(simulateDFA(dfa, input).accepted).toBe(input.includes('ab'));
    }
  });

  it('handles a longer, self-overlapping pattern correctly', () => {
    const dfa = buildPatternDFA(ALPHABET, 'aab', 'endsWith');
    const candidates = ['aab', 'aaab', 'aaaab', 'abaab', 'baab', 'ab', 'aba'];
    for (const input of candidates) {
      expect(simulateDFA(dfa, input).accepted).toBe(input.endsWith('aab'));
    }
  });
});

describe('buildEvenCountDFA', () => {
  it('accepts exactly the strings with an even count of the target symbol', () => {
    const dfa = buildEvenCountDFA(ALPHABET, 'a');
    const candidates = ['', 'a', 'aa', 'aaa', 'b', 'ba', 'bab', 'abab', 'aabb'];
    for (const input of candidates) {
      const count = input.split('').filter(c => c === 'a').length;
      expect(simulateDFA(dfa, input).accepted).toBe(count % 2 === 0);
    }
  });
});

describe('buildModKDFA', () => {
  it('accepts exactly the strings whose symbol count is divisible by k', () => {
    const dfa = buildModKDFA(ALPHABET, 'a', 3);
    const candidates = ['', 'a', 'aa', 'aaa', 'aaaa', 'aaaaaa', 'bbb', 'aaabbb', 'aabbb'];
    for (const input of candidates) {
      const count = input.split('').filter(c => c === 'a').length;
      expect(simulateDFA(dfa, input).accepted).toBe(count % 3 === 0);
    }
  });
});

describe('buildNoConsecutiveDFA', () => {
  it('accepts exactly the strings with no run of the symbol longer than maxRun', () => {
    const dfa = buildNoConsecutiveDFA(ALPHABET, 'a', 2);
    const hasLongRun = (input: string) => new RegExp('a{3,}').test(input);
    const candidates = ['', 'a', 'aa', 'aaa', 'b', 'aab', 'aaab', 'baab', 'abaab', 'aabaa', 'aabaaa'];
    for (const input of candidates) {
      expect(simulateDFA(dfa, input).accepted).toBe(!hasLongRun(input));
    }
  });
});

describe('buildNfaContainsSubstring', () => {
  it('accepts exactly the strings containing the pattern anywhere (nondeterministic guess construction)', () => {
    const nfa = buildNfaContainsSubstring(ALPHABET, 'aba');
    const candidates = ['', 'aba', 'aabab', 'bbaba', 'ab', 'ba', 'aab', 'abab'];
    for (const input of candidates) {
      expect(simulateNFA(nfa, input).accepted).toBe(input.includes('aba'));
    }
  });
});

describe('buildNfaUnionOfSuffixes', () => {
  it('accepts exactly the union of "ends with A" and "ends with B"', () => {
    const nfa = buildNfaUnionOfSuffixes(ALPHABET, 'aa', 'bb');
    const candidates = ['', 'a', 'aa', 'bb', 'ab', 'ba', 'abaa', 'aabb', 'aabab', 'abba'];
    for (const input of candidates) {
      expect(simulateNFA(nfa, input).accepted).toBe(input.endsWith('aa') || input.endsWith('bb'));
    }
  });
});

describe('buildAnBnPDA', () => {
  const pda = buildAnBnPDA('a', 'b');
  it.each([
    ['ab', true],
    ['aabb', true],
    ['aaabbb', true],
    ['', false],
    ['a', false],
    ['b', false],
    ['aab', false],
    ['abb', false],
    ['ba', false],
    ['aabbb', false],
    ['abab', false],
  ] as const)('%s -> accepted=%s', (input, expected) => {
    expect(simulatePDA(pda, input).accepted).toBe(expected);
  });
});

describe('buildPalindromePDA', () => {
  const pda = buildPalindromePDA(ALPHABET);
  it.each([
    ['', false],
    ['aa', true],
    ['bb', true],
    ['abba', true],
    ['baab', true],
    ['ab', false],
    ['aba', false],
    ['abab', false],
    ['aabb', false],
  ] as const)('%s -> accepted=%s (even-length palindromes only)', (input, expected) => {
    expect(simulatePDA(pda, input).accepted).toBe(expected);
  });
});

describe('buildUnaryDivisibleByKTM', () => {
  it('k=2 accepts exactly even-length unary strings', () => {
    const tm = buildUnaryDivisibleByKTM(2);
    for (let len = 0; len <= 8; len++) {
      expect(simulateTuringMachine(tm, '1'.repeat(len)).accepted).toBe(len % 2 === 0);
    }
  });

  it('k=3 accepts exactly length-divisible-by-3 unary strings', () => {
    const tm = buildUnaryDivisibleByKTM(3);
    for (let len = 0; len <= 9; len++) {
      expect(simulateTuringMachine(tm, '1'.repeat(len)).accepted).toBe(len % 3 === 0);
    }
  });
});

describe('generateExercise', () => {
  const types = Object.keys(LEARNING_OBJECTIVES) as Array<keyof typeof LEARNING_OBJECTIVES>;

  it.each(types)('produces a well-formed, non-empty exercise for %s', (type) => {
    const exercise = generateExercise(type, 'beginner', undefined, 12345);
    expect(exercise.title.length).toBeGreaterThan(0);
    expect(exercise.description.length).toBeGreaterThan(0);
    expect(exercise.hints.length).toBeGreaterThan(0);
    expect(exercise.alphabet.length).toBeGreaterThan(0);
    expect(exercise.sampleTests.length).toBeGreaterThan(0);
    // exactly one reference-solution shape is populated, matching the type
    const shapesPresent = [exercise.automaton, exercise.regex, exercise.rules].filter(Boolean).length;
    expect(shapesPresent).toBe(1);
  });

  it('is deterministic for a fixed seed', () => {
    const a = generateExercise('DFA', 'intermediate', undefined, 42);
    const b = generateExercise('DFA', 'intermediate', undefined, 42);
    expect(a).toEqual(b);
  });

  it('honors a matching learning objective', () => {
    const exercise = generateExercise('DFA', 'beginner', 'modular counting', 7);
    expect(exercise.learningObjective).toBe('modular counting');
  });

  it('every declared learning objective is reachable', () => {
    for (const [type, objectives] of Object.entries(LEARNING_OBJECTIVES) as Array<
      [keyof typeof LEARNING_OBJECTIVES, string[]]
    >) {
      for (const objective of objectives) {
        const exercise = generateExercise(type, 'beginner', objective, 99);
        expect(exercise.learningObjective).toBe(objective);
      }
    }
  });
});
