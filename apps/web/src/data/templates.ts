import type { Node, Edge } from '@xyflow/react';

export interface PredefinedTemplate {
  name: string;
  type: 'DFA' | 'NFA' | 'Mealy' | 'Moore' | 'PDA' | 'TM';
  description: string;
  input: string;
  nodes: Node[];
  edges: Edge[];
}

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
      { id: "e-p0-p0-1", source: "p0", target: "p0", type: "transition", data: { label: "a, Z -> A Z" } },
      { id: "e-p0-p0-2", source: "p0", target: "p0", type: "transition", data: { label: "a, A -> A A" } },
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
  }
];
