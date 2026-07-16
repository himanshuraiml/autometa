import { describe, expect, it } from 'vitest';
import { simulateDFA, simulateNFA, simulatePDA, simulateTuringMachine } from '@autometa/simulation-engine';
import { exportToJflap, importFromJflap, jflapResultToAutomaton } from '../jflap';
import type { PositionedAutomatonNode } from '../jflap';
import type { AutomatonEdge } from '@autometa/simulation-engine';

describe('JFLAP FA (DFA/NFA) round-trip', () => {
  const nodes: PositionedAutomatonNode[] = [
    { id: 'q0', label: 'q0', isStart: true, isAccept: false, x: 50, y: 60 },
    { id: 'q1', label: 'q1', isStart: false, isAccept: true, x: 150, y: 60 },
  ];
  const edges: AutomatonEdge[] = [
    { id: 'e0', source: 'q0', target: 'q1', symbols: ['a'] },
    { id: 'e1', source: 'q1', target: 'q1', symbols: ['b'] },
  ];

  it('exports valid JFLAP XML with type, states, and transitions', () => {
    const xml = exportToJflap(nodes, edges, 'DFA');
    expect(xml).toContain('<type>fa</type>');
    expect(xml).toContain('<state id="q0" name="q0">');
    expect(xml).toContain('<initial/>');
    expect(xml).toContain('<final/>');
    expect(xml).toContain('<read>a</read>');
    expect(xml).toContain('<read>b</read>');
  });

  it('imports its own export back into an equivalent automaton (JFLAP has no DFA/NFA distinction, so import yields NFA)', () => {
    const xml = exportToJflap(nodes, edges, 'DFA');
    const imported = importFromJflap(xml);
    expect(imported.automatonType).toBe('NFA');
    expect(imported.nodes.map(n => n.id).sort()).toEqual(['q0', 'q1']);
    expect(imported.nodes.find(n => n.id === 'q0')?.isStart).toBe(true);
    expect(imported.nodes.find(n => n.id === 'q1')?.isAccept).toBe(true);
    expect(imported.nodes.find(n => n.id === 'q0')?.x).toBe(50);

    const automaton = jflapResultToAutomaton(imported);
    for (const input of ['a', 'ab', 'abbb', 'b', '']) {
      expect(simulateNFA(automaton, input).accepted).toBe(simulateDFA({ nodes, edges }, input).accepted);
    }
  });

  it('round-trips escaped special characters in state names', () => {
    const specialNodes: PositionedAutomatonNode[] = [
      { id: 'q0', label: 'q<0>&"\'', isStart: true, isAccept: true, x: 0, y: 0 },
    ];
    const xml = exportToJflap(specialNodes, [], 'DFA');
    const imported = importFromJflap(xml);
    expect(imported.nodes[0].label).toBe('q<0>&"\'');
  });
});

describe('JFLAP PDA round-trip (single-character stack symbols)', () => {
  const nodes: PositionedAutomatonNode[] = [
    { id: 'q0', label: 'q0', isStart: true, isAccept: false, x: 0, y: 0 },
    { id: 'q1', label: 'q1', isStart: false, isAccept: true, x: 100, y: 0 },
  ];
  const edges: AutomatonEdge[] = [
    { id: 'e0', source: 'q0', target: 'q0', symbols: ['a, ε -> A'] },
    { id: 'e1', source: 'q0', target: 'q1', symbols: ['b, A -> ε'] },
    { id: 'e2', source: 'q1', target: 'q1', symbols: ['b, A -> ε'] },
  ];

  it('imports its own export and preserves acceptance behavior', () => {
    const xml = exportToJflap(nodes, edges, 'PDA');
    expect(xml).toContain('<type>pda</type>');
    const imported = importFromJflap(xml);
    expect(imported.automatonType).toBe('PDA');
    const automaton = jflapResultToAutomaton(imported);
    for (const input of ['abb', 'ab', 'a', 'abbb', '']) {
      expect(simulatePDA(automaton, input).accepted).toBe(simulatePDA({ nodes, edges }, input).accepted);
    }
  });
});

describe('JFLAP Turing machine round-trip', () => {
  const nodes: PositionedAutomatonNode[] = [
    { id: 'q0', label: 'q0', isStart: true, isAccept: false, x: 0, y: 0 },
    { id: 'q1', label: 'q1', isStart: false, isAccept: true, x: 100, y: 0 },
  ];
  const edges: AutomatonEdge[] = [
    { id: 'e0', source: 'q0', target: 'q0', symbols: ['1 -> 1, R'] },
    { id: 'e1', source: 'q0', target: 'q1', symbols: ['_ -> _, S'] },
  ];

  it('imports its own export and preserves acceptance behavior', () => {
    const xml = exportToJflap(nodes, edges, 'TM');
    expect(xml).toContain('<type>turing</type>');
    const imported = importFromJflap(xml);
    expect(imported.automatonType).toBe('TM');
    const automaton = jflapResultToAutomaton(imported);
    for (const input of ['11', '111', '']) {
      expect(simulateTuringMachine(automaton, input).accepted).toBe(simulateTuringMachine({ nodes, edges }, input).accepted);
    }
  });
});

describe('JFLAP Mealy round-trip', () => {
  it('preserves input/output pairs on transitions', () => {
    const nodes: PositionedAutomatonNode[] = [{ id: 'q0', label: 'q0', isStart: true, isAccept: false, x: 0, y: 0 }];
    const edges: AutomatonEdge[] = [{ id: 'e0', source: 'q0', target: 'q0', symbols: ['0/1', '1/0'] }];
    const xml = exportToJflap(nodes, edges, 'Mealy');
    expect(xml).toContain('<type>mealy</type>');
    const imported = importFromJflap(xml);
    expect(imported.automatonType).toBe('Mealy');
    expect(imported.edges.map(e => e.symbols[0]).sort()).toEqual(['0/1', '1/0']);
  });
});

describe('importFromJflap defaults', () => {
  it('defaults to fa/NFA when <type> is missing', () => {
    const xml = `<structure><automaton><state id="q0" name="q0"><x>0</x><y>0</y><initial/><final/></state></automaton></structure>`;
    const imported = importFromJflap(xml);
    expect(imported.automatonType).toBe('NFA');
  });
});
