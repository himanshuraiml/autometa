import { describe, expect, it } from 'vitest';
import { generateLeftmostParseTree } from '../parsing';

describe('parse tree derivation', () => {
  it('returns a nested tree for a derived input', () => {
    const result = generateLeftmostParseTree({ S: ['a S b', 'ε'] }, 'S', 'aabb');
    expect(result?.tree.symbol).toBe('S');
    expect(result?.tree.children.map(child => child.symbol)).toEqual(['a', 'S', 'b']);
    expect(result?.tree.children[1].children.map(child => child.symbol)).toEqual(['a', 'S', 'b']);
  });

  it('records one rewrite step per production applied, ending at the full tree', () => {
    const result = generateLeftmostParseTree({ S: ['a S b', 'ε'] }, 'S', 'aabb');
    expect(result?.steps.map(step => step.production)).toEqual(['S → a S b', 'S → a S b', 'S → ε']);
    // Each step's expanded node is the nonterminal leaf rewritten by that step's production.
    expect(result?.steps[0].expandedNodeId).toBe(result?.tree.id);
    expect(result?.steps[1].expandedNodeId).toBe(result?.tree.children[1].id);
    expect(result?.steps[2].expandedNodeId).toBe(result?.tree.children[1].children[1].id);
    // The last step's tree snapshot is the same completed tree returned as `.tree`.
    expect(result?.steps[result.steps.length - 1].tree).toEqual(result?.tree);
  });
});
