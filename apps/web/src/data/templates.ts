import type { Node, Edge } from '@xyflow/react';

export interface PredefinedTemplate {
  name: string;
  type: 'DFA' | 'NFA' | 'Mealy' | 'Moore' | 'PDA' | 'TM';
  description: string;
  input: string;
  nodes: Node[];
  edges: Edge[];
}

export interface GrammarExample {
  name: string;
  description: string;
  input: string;
  rules: Array<{ left: string; right: string[] }>;
}

const state = (id: string, label: string, x: number, y: number, isStart = false, isAccept = false): Node => ({
  id, type: 'state', position: { x, y },
  data: { label, isStart, isAccept, isActive: false, scale: 1, glow: 0 }
});

const transition = (id: string, source: string, target: string, label: string): Edge => ({
  id, source, target, type: 'transition', data: { label }
});

export const PREDEFINED_TEMPLATES: PredefinedTemplate[] = [
  {
    name: "Ends with 'ab' (DFA)",
    type: "DFA",
    description: "Accepts binary strings ending with 'ab' (e.g. 'aab', 'bab').",
    input: "aab",
    nodes: [
      { id: "q0", type: "state", position: { x: 100, y: 200 }, data: { label: "q0", isStart: true, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "q1", type: "state", position: { x: 300, y: 200 }, data: { label: "q1", isStart: false, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "q2", type: "state", position: { x: 500, y: 200 }, data: { label: "q2", isStart: false, isAccept: true, isActive: false, scale: 1, glow: 0 } }
    ],
    edges: [
      { id: "e-q0-q1", source: "q0", target: "q1", type: "transition", data: { label: "a" } },
      { id: "e-q0-q0", source: "q0", target: "q0", type: "transition", data: { label: "b" } },
      { id: "e-q1-q1", source: "q1", target: "q1", type: "transition", data: { label: "a" } },
      { id: "e-q1-q2", source: "q1", target: "q2", type: "transition", data: { label: "b" } },
      { id: "e-q2-q1", source: "q2", target: "q1", type: "transition", data: { label: "a" } },
      { id: "e-q2-q0", source: "q2", target: "q0", type: "transition", data: { label: "b" } }
    ]
  },
  {
    name: "Even Number of 0s (DFA)",
    type: "DFA",
    description: "Accepts binary strings containing an even number of '0' symbols.",
    input: "10101",
    nodes: [
      { id: "q0", type: "state", position: { x: 150, y: 200 }, data: { label: "q0 (Even)", isStart: true, isAccept: true, isActive: false, scale: 1, glow: 0 } },
      { id: "q1", type: "state", position: { x: 400, y: 200 }, data: { label: "q1 (Odd)", isStart: false, isAccept: false, isActive: false, scale: 1, glow: 0 } }
    ],
    edges: [
      { id: "e-q0-q1", source: "q0", target: "q1", type: "transition", data: { label: "0" } },
      { id: "e-q0-q0", source: "q0", target: "q0", type: "transition", data: { label: "1" } },
      { id: "e-q1-q0", source: "q1", target: "q0", type: "transition", data: { label: "0" } },
      { id: "e-q1-q1", source: "q1", target: "q1", type: "transition", data: { label: "1" } }
    ]
  },
  {
    name: "Contains '101' (NFA)",
    type: "NFA",
    description: "NFA that detects if the substring '101' appears anywhere in the input.",
    input: "01010",
    nodes: [
      { id: "q0", type: "state", position: { x: 100, y: 200 }, data: { label: "q0", isStart: true, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "q1", type: "state", position: { x: 280, y: 200 }, data: { label: "q1", isStart: false, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "q2", type: "state", position: { x: 460, y: 200 }, data: { label: "q2", isStart: false, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "q3", type: "state", position: { x: 640, y: 200 }, data: { label: "q3", isStart: false, isAccept: true, isActive: false, scale: 1, glow: 0 } }
    ],
    edges: [
      { id: "e-q0-q0", source: "q0", target: "q0", type: "transition", data: { label: "0, 1" } },
      { id: "e-q0-q1", source: "q0", target: "q1", type: "transition", data: { label: "1" } },
      { id: "e-q1-q2", source: "q1", target: "q2", type: "transition", data: { label: "0" } },
      { id: "e-q2-q3", source: "q2", target: "q3", type: "transition", data: { label: "1" } },
      { id: "e-q3-q3", source: "q3", target: "q3", type: "transition", data: { label: "0, 1" } }
    ]
  },
  {
    name: "Binary 1s Complement (Mealy)",
    type: "Mealy",
    description: "Mealy machine that outputs inverts of each binary input bit (0/1, 1/0).",
    input: "0110",
    nodes: [
      { id: "q0", type: "state", position: { x: 250, y: 200 }, data: { label: "q0", isStart: true, isAccept: false, isActive: false, scale: 1, glow: 0 } }
    ],
    edges: [
      { id: "e-q0-q0-0", source: "q0", target: "q0", type: "transition", data: { label: "0/1, 1/0" } }
    ]
  },
  {
    name: "Modulo-3 Counter (Moore)",
    type: "Moore",
    description: "Moore machine that outputs the decimal remainder of binary streams modulo 3.",
    input: "101",
    nodes: [
      { id: "s0", type: "state", position: { x: 150, y: 200 }, data: { label: "s0/0", isStart: true, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "s1", type: "state", position: { x: 350, y: 100 }, data: { label: "s1/1", isStart: false, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "s2", type: "state", position: { x: 350, y: 300 }, data: { label: "s2/2", isStart: false, isAccept: false, isActive: false, scale: 1, glow: 0 } }
    ],
    edges: [
      { id: "e-s0-s0", source: "s0", target: "s0", type: "transition", data: { label: "0" } },
      { id: "e-s0-s1", source: "s0", target: "s1", type: "transition", data: { label: "1" } },
      { id: "e-s1-s2", source: "s1", target: "s2", type: "transition", data: { label: "0" } },
      { id: "e-s1-s0", source: "s1", target: "s0", type: "transition", data: { label: "1" } },
      { id: "e-s2-s1", source: "s2", target: "s1", type: "transition", data: { label: "0" } },
      { id: "e-s2-s2", source: "s2", target: "s2", type: "transition", data: { label: "1" } }
    ]
  },
  {
    name: "Matches a^n b^n (PDA)",
    type: "PDA",
    description: "Pushdown Automaton that uses a stack to match equal counts of 'a' and 'b'.",
    input: "aabb",
    nodes: [
      { id: "p0", type: "state", position: { x: 100, y: 200 }, data: { label: "p0", isStart: true, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "p1", type: "state", position: { x: 350, y: 200 }, data: { label: "p1", isStart: false, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "p2", type: "state", position: { x: 600, y: 200 }, data: { label: "p2 (Halt)", isStart: false, isAccept: true, isActive: false, scale: 1, glow: 0 } }
    ],
    edges: [
      { id: "e-p0-p0", source: "p0", target: "p0", type: "transition", data: { label: "a, Z -> A Z, a, A -> A A" } },
      { id: "e-p0-p1", source: "p0", target: "p1", type: "transition", data: { label: "b, A -> ε" } },
      { id: "e-p1-p1", source: "p1", target: "p1", type: "transition", data: { label: "b, A -> ε" } },
      { id: "e-p1-p2", source: "p1", target: "p2", type: "transition", data: { label: "ε, Z -> Z" } }
    ]
  },
  {
    name: "Binary Incrementer (Turing Machine)",
    type: "TM",
    description: "Turing Machine that moves to the end of a binary string, inverts bits on carry, and increments.",
    input: "1011",
    nodes: [
      { id: "t0", type: "state", position: { x: 100, y: 200 }, data: { label: "t0 (Seek)", isStart: true, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "t1", type: "state", position: { x: 300, y: 200 }, data: { label: "t1 (Add)", isStart: false, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "t2", type: "state", position: { x: 500, y: 200 }, data: { label: "t2 (Rewind)", isStart: false, isAccept: false, isActive: false, scale: 1, glow: 0 } },
      { id: "t3", type: "state", position: { x: 700, y: 200 }, data: { label: "t3 (Halt)", isStart: false, isAccept: true, isActive: false, scale: 1, glow: 0 } }
    ],
    edges: [
      { id: "e-t0-t0-0", source: "t0", target: "t0", type: "transition", data: { label: "0 -> 0, R" } },
      { id: "e-t0-t0-1", source: "t0", target: "t0", type: "transition", data: { label: "1 -> 1, R" } },
      { id: "e-t0-t1", source: "t0", target: "t1", type: "transition", data: { label: "_ -> _, L" } },
      { id: "e-t1-t1", source: "t1", target: "t1", type: "transition", data: { label: "1 -> 0, L" } },
      { id: "e-t1-t2-0", source: "t1", target: "t2", type: "transition", data: { label: "0 -> 1, L" } },
      { id: "e-t1-t2-1", source: "t1", target: "t2", type: "transition", data: { label: "_ -> 1, L" } },
      { id: "e-t2-t2-0", source: "t2", target: "t2", type: "transition", data: { label: "0 -> 0, L" } },
      { id: "e-t2-t2-1", source: "t2", target: "t2", type: "transition", data: { label: "1 -> 1, L" } },
      { id: "e-t2-t3", source: "t2", target: "t3", type: "transition", data: { label: "_ -> _, R" } }
    ]
  },
  {
    name: "Binary Value Divisible by 3 (DFA)", type: "DFA",
    description: "Tracks the remainder of a binary number modulo 3.", input: "110",
    nodes: [state('d30', 'q0 (remainder 0)', 100, 200, true, true), state('d31', 'q1 (remainder 1)', 350, 100), state('d32', 'q2 (remainder 2)', 350, 300)],
    edges: [transition('d30-0', 'd30', 'd30', '0'), transition('d30-1', 'd30', 'd31', '1'), transition('d31-0', 'd31', 'd32', '0'), transition('d31-1', 'd31', 'd30', '1'), transition('d32-0', 'd32', 'd31', '0'), transition('d32-1', 'd32', 'd32', '1')]
  },
  {
    name: "No Consecutive 1s (DFA)", type: "DFA",
    description: "Accepts binary strings that never contain the substring '11'.", input: "10101",
    nodes: [state('dc0', 'q0', 100, 200, true, true), state('dc1', 'q1 (last was 1)', 350, 200, false, true), state('dc2', 'qDead', 600, 200)],
    edges: [transition('dc00', 'dc0', 'dc0', '0'), transition('dc01', 'dc0', 'dc1', '1'), transition('dc10', 'dc1', 'dc0', '0'), transition('dc11', 'dc1', 'dc2', '1'), transition('dc20', 'dc2', 'dc2', '0, 1')]
  },
  {
    name: "Exactly One a (DFA)", type: "DFA",
    description: "Accepts strings over {a, b} containing exactly one 'a'.", input: "bbabb",
    nodes: [state('do0', 'q0 (no a)', 100, 200, true), state('do1', 'q1 (one a)', 350, 200, false, true), state('do2', 'q2 (many a)', 600, 200)],
    edges: [transition('do00', 'do0', 'do0', 'b'), transition('do01', 'do0', 'do1', 'a'), transition('do10', 'do1', 'do1', 'b'), transition('do12', 'do1', 'do2', 'a'), transition('do22', 'do2', 'do2', 'a, b')]
  },
  {
    name: "Ends with 00 or 11 (NFA)", type: "NFA",
    description: "Uses nondeterminism to recognize either repeated final bit.", input: "1011",
    nodes: [state('ne0', 'q0', 80, 200, true), state('ne1', 'q1', 270, 100), state('ne2', 'q2', 470, 100, false, true), state('ne3', 'q3', 270, 300), state('ne4', 'q4', 470, 300, false, true)],
    edges: [transition('ne00', 'ne0', 'ne0', '0, 1'), transition('ne01', 'ne0', 'ne1', '0'), transition('ne12', 'ne1', 'ne2', '0'), transition('ne03', 'ne0', 'ne3', '1'), transition('ne34', 'ne3', 'ne4', '1')]
  },
  {
    name: "Starts with a or Ends with b (ε-NFA)", type: "NFA",
    description: "Demonstrates ε-transitions for the union of two regular languages.", input: "bbab",
    nodes: [state('nu0', 'q0', 70, 200, true), state('nu1', 'qStart-a', 250, 100), state('nu2', 'qAccept-a', 480, 100, false, true), state('nu3', 'qScan-b', 250, 300), state('nu4', 'qAccept-b', 480, 300, false, true)],
    edges: [transition('nu01', 'nu0', 'nu1', 'ε'), transition('nu03', 'nu0', 'nu3', 'ε'), transition('nu12', 'nu1', 'nu2', 'a'), transition('nu22', 'nu2', 'nu2', 'a, b'), transition('nu33', 'nu3', 'nu3', 'a, b'), transition('nu34', 'nu3', 'nu4', 'b')]
  },
  {
    name: "Contains 010 (NFA)", type: "NFA",
    description: "Recognizes binary strings containing '010' as a substring.", input: "10101",
    nodes: [state('n010', 'q0', 80, 200, true), state('n011', 'q1', 270, 200), state('n012', 'q2', 460, 200), state('n013', 'q3', 650, 200, false, true)],
    edges: [transition('n0100', 'n010', 'n010', '0, 1'), transition('n0101', 'n010', 'n011', '0'), transition('n0112', 'n011', 'n012', '1'), transition('n0123', 'n012', 'n013', '0'), transition('n0133', 'n013', 'n013', '0, 1')]
  },
  {
    name: "a* or b* (ε-NFA)", type: "NFA",
    description: "Accepts strings made entirely of a's or entirely of b's, including ε.", input: "aaaa",
    nodes: [state('ns0', 'q0', 100, 200, true), state('ns1', 'qA', 350, 100, false, true), state('ns2', 'qB', 350, 300, false, true)],
    edges: [transition('ns01', 'ns0', 'ns1', 'ε'), transition('ns02', 'ns0', 'ns2', 'ε'), transition('ns11', 'ns1', 'ns1', 'a'), transition('ns22', 'ns2', 'ns2', 'b')]
  },
  {
    name: "Erase Unary Input (Turing Machine)", type: "TM",
    description: "Scans a unary string and replaces every 1 with a blank.", input: "1111",
    nodes: [state('te0', 'q0 (erase)', 140, 200, true), state('te1', 'qHalt', 440, 200, false, true)],
    edges: [transition('te00', 'te0', 'te0', '1 -> _, R'), transition('te01', 'te0', 'te1', '_ -> _, R')]
  },
  {
    name: "Binary Bit Complement (Turing Machine)", type: "TM",
    description: "Flips each input bit: 0 becomes 1 and 1 becomes 0.", input: "10110",
    nodes: [state('tc0', 'q0 (flip)', 140, 200, true), state('tc1', 'qHalt', 440, 200, false, true)],
    edges: [transition('tc00', 'tc0', 'tc0', '0 -> 1, R'), transition('tc01', 'tc0', 'tc0', '1 -> 0, R'), transition('tc02', 'tc0', 'tc1', '_ -> _, R')]
  },
  {
    name: "Recognize 0*1* (Turing Machine)", type: "TM",
    description: "Accepts a block of 0s followed by a block of 1s; rejects 0 after a 1.", input: "000111",
    nodes: [state('tr0', 'q0 (zeros)', 80, 200, true), state('tr1', 'q1 (ones)', 300, 200), state('tr2', 'qAccept', 540, 100, false, true), state('tr3', 'qReject', 540, 300)],
    edges: [transition('tr00', 'tr0', 'tr0', '0 -> 0, R'), transition('tr01', 'tr0', 'tr1', '1 -> 1, R'), transition('tr02', 'tr0', 'tr2', '_ -> _, R'), transition('tr11', 'tr1', 'tr1', '1 -> 1, R'), transition('tr12', 'tr1', 'tr2', '_ -> _, R'), transition('tr13', 'tr1', 'tr3', '0 -> 0, R')]
  },
  {
    name: "Unary Even-Length Checker (Turing Machine)", type: "TM",
    description: "Consumes unary symbols in pairs and accepts exactly even lengths.", input: "1111",
    nodes: [state('tv0', 'q0 (first of pair)', 80, 200, true), state('tv1', 'q1 (second of pair)', 300, 200), state('tv2', 'qAccept', 540, 100, false, true), state('tv3', 'qReject', 540, 300)],
    edges: [transition('tv01', 'tv0', 'tv1', '1 -> _, R'), transition('tv02', 'tv0', 'tv2', '_ -> _, R'), transition('tv10', 'tv1', 'tv0', '1 -> _, R'), transition('tv13', 'tv1', 'tv3', '_ -> _, R')]
  },
  {
    name: "Rising-Edge Detector (Mealy)", type: "Mealy",
    description: "Outputs 1 exactly when a 0 is immediately followed by a 1.", input: "001011",
    nodes: [state('mr0', 'q0 (previous 0)', 120, 200, true), state('mr1', 'q1 (previous 1)', 420, 200)],
    edges: [transition('mr00', 'mr0', 'mr0', '0/0'), transition('mr01', 'mr0', 'mr1', '1/1'), transition('mr10', 'mr1', 'mr0', '0/0'), transition('mr11', 'mr1', 'mr1', '1/0')]
  },
  {
    name: "Parity Reporter (Mealy)", type: "Mealy",
    description: "Outputs E or O after each bit according to the current number of 1s.", input: "10110",
    nodes: [state('mp0', 'qEven', 120, 200, true), state('mp1', 'qOdd', 420, 200)],
    edges: [transition('mp00', 'mp0', 'mp0', '0/E'), transition('mp01', 'mp0', 'mp1', '1/O'), transition('mp10', 'mp1', 'mp1', '0/O'), transition('mp11', 'mp1', 'mp0', '1/E')]
  },
  {
    name: "Modulo-3 Stream Output (Mealy)", type: "Mealy",
    description: "Outputs the running binary-value remainder modulo 3 after every bit.", input: "1011",
    nodes: [state('mm0', 'q0', 100, 200, true), state('mm1', 'q1', 350, 100), state('mm2', 'q2', 350, 300)],
    edges: [transition('mm00', 'mm0', 'mm0', '0/0'), transition('mm01', 'mm0', 'mm1', '1/1'), transition('mm10', 'mm1', 'mm2', '0/2'), transition('mm11', 'mm1', 'mm0', '1/0'), transition('mm20', 'mm2', 'mm1', '0/1'), transition('mm21', 'mm2', 'mm2', '1/2')]
  },
  {
    name: "Previous-Bit Output (Mealy)", type: "Mealy",
    description: "Outputs the preceding input bit; the first output uses 0 as a default.", input: "11001",
    nodes: [state('mb0', 'qPrevious-0', 120, 200, true), state('mb1', 'qPrevious-1', 420, 200)],
    edges: [transition('mb00', 'mb0', 'mb0', '0/0'), transition('mb01', 'mb0', 'mb1', '1/0'), transition('mb10', 'mb1', 'mb0', '0/1'), transition('mb11', 'mb1', 'mb1', '1/1')]
  },
  {
    name: "Even 1s Indicator (Moore)", type: "Moore",
    description: "Its state output reports whether the count of 1s seen so far is even.", input: "10110",
    nodes: [state('moe0', 'qEven/E', 120, 200, true), state('moe1', 'qOdd/O', 420, 200)],
    edges: [transition('moe00', 'moe0', 'moe0', '0'), transition('moe01', 'moe0', 'moe1', '1'), transition('moe10', 'moe1', 'moe1', '0'), transition('moe11', 'moe1', 'moe0', '1')]
  },
  {
    name: "Contains 11 Indicator (Moore)", type: "Moore",
    description: "Outputs Found once two consecutive 1s have appeared in the input.", input: "10110",
    nodes: [state('m11a', 'qStart/Not found', 80, 200, true), state('m11b', 'qOne-1/Not found', 310, 200), state('m11c', 'qFound/Found', 560, 200)],
    edges: [transition('m11a0', 'm11a', 'm11a', '0'), transition('m11a1', 'm11a', 'm11b', '1'), transition('m11b0', 'm11b', 'm11a', '0'), transition('m11b1', 'm11b', 'm11c', '1'), transition('m11c0', 'm11c', 'm11c', '0, 1')]
  },
  {
    name: "0*1* Format Monitor (Moore)", type: "Moore",
    description: "Outputs Valid while the stream has only 0s followed by 1s, then Invalid.", input: "000111",
    nodes: [state('mf0', 'qZeros/Valid', 80, 200, true), state('mf1', 'qOnes/Valid', 310, 200), state('mf2', 'qInvalid/Invalid', 560, 200)],
    edges: [transition('mf00', 'mf0', 'mf0', '0'), transition('mf01', 'mf0', 'mf1', '1'), transition('mf11', 'mf1', 'mf1', '1'), transition('mf12', 'mf1', 'mf2', '0'), transition('mf22', 'mf2', 'mf2', '0, 1')]
  },
  {
    name: "Last-Bit Memory (Moore)", type: "Moore",
    description: "The output records the most recently read input bit.", input: "10110",
    nodes: [state('ml0', 'qStart/–', 100, 200, true), state('ml1', 'qLast-0/0', 350, 100), state('ml2', 'qLast-1/1', 350, 300)],
    edges: [transition('ml00', 'ml0', 'ml1', '0'), transition('ml01', 'ml0', 'ml2', '1'), transition('ml10', 'ml1', 'ml1', '0'), transition('ml11', 'ml1', 'ml2', '1'), transition('ml20', 'ml2', 'ml1', '0'), transition('ml21', 'ml2', 'ml2', '1')]
  }
];

/** Five ready-to-run CFGs for the grammar workspace. */
export const GRAMMAR_EXAMPLES: GrammarExample[] = [
  { name: 'Balanced Parentheses', description: 'Nested, balanced parentheses.', input: '(())', rules: [{ left: 'S', right: ['( S ) S', 'ε'] }] },
  { name: 'Equal a and b Blocks', description: 'The classic language aⁿbⁿ.', input: 'aaabbb', rules: [{ left: 'S', right: ['a S b', 'ε'] }] },
  { name: 'Palindromes over a, b', description: 'Reads identically from left to right and right to left.', input: 'ababa', rules: [{ left: 'S', right: ['a S a', 'b S b', 'a', 'b', 'ε'] }] },
  { name: 'Arithmetic Expressions', description: 'Expressions with +, *, parentheses, and identifier i.', input: 'i+i*i', rules: [{ left: 'E', right: ['E + T', 'T'] }, { left: 'T', right: ['T * F', 'F'] }, { left: 'F', right: ['( E )', 'i'] }] },
  { name: 'aⁿbᵐcⁿ', description: 'Matches the number of a symbols with c symbols.', input: 'aabbbcc', rules: [{ left: 'S', right: ['a S c', 'B'] }, { left: 'B', right: ['b B', 'ε'] }] }
];
