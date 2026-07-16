import type { Node, Edge } from '@xyflow/react';
import type { Automaton } from '@autometa/simulation-engine';
import { parseTransitionLabel } from './transitionParser';

export type AutomatonType = 'DFA' | 'NFA' | 'Mealy' | 'Moore' | 'PDA' | 'TM';

/** Convert the React Flow canvas representation to the simulation-engine Automaton format. */
export interface AutomatonConversionResult {
  automaton: Automaton;
  issues: Array<{ edgeId: string; message: string }>;
}

export const toAutomatonWithDiagnostics = (nodes: Node[], edges: Edge[], type: AutomatonType, tapeCount: number = 1): AutomatonConversionResult => {
  const issues: Array<{ edgeId: string; message: string }> = [];
  const automaton: Automaton = {
    nodes: nodes.map(n => ({
    id: n.id,
    label: (n.data?.label as string) || n.id,
    isStart: !!n.data?.isStart,
    isAccept: !!n.data?.isAccept,
    isReject: !!n.data?.isReject,
    })),
    edges: edges.map(e => {
      const parsed = parseTransitionLabel((e.data?.label as string) || '', type, tapeCount);
      parsed.issues.forEach(issue => issues.push({ edgeId: e.id, message: issue.message }));
      return { id: e.id, source: e.source, target: e.target, symbols: parsed.transitions };
    }),
  };
  return { automaton, issues };
};

/** Convert the React Flow canvas representation to the simulation-engine Automaton format. */
export const toAutomaton = (nodes: Node[], edges: Edge[], type: AutomatonType, tapeCount: number = 1): Automaton =>
  toAutomatonWithDiagnostics(nodes, edges, type, tapeCount).automaton;

/**
 * Convert an engine Automaton to React Flow nodes/edges, laying the states out
 * on a circle so freshly generated graphs (transformations, lesson diagrams)
 * don't overlap.
 */
export const automatonToFlow = (automaton: Automaton): { nodes: Node[]; edges: Edge[] } => {
  const radius = 180;
  const centerX = 250;
  const centerY = 250;
  const n = automaton.nodes.length;

  const nodes: Node[] = automaton.nodes.map((node, idx) => {
    const angle = n > 1 ? (idx * 2 * Math.PI) / n : 0;
    return {
      id: node.id,
      type: 'state',
      position: {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      },
      data: {
        label: node.label,
        isStart: node.isStart,
        isAccept: node.isAccept,
        isReject: node.isReject,
        isActive: false,
        scale: 1,
        glow: 0,
      },
    };
  });

  const edges: Edge[] = automaton.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'transition',
    data: { label: edge.symbols.join(', ') },
  }));

  return { nodes, edges };
};
