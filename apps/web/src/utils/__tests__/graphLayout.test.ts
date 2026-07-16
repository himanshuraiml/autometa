import { describe, expect, it } from 'vitest';
import { computeLayeredLayout } from '../graphLayout';

const node = (id: string, start = false) => ({ id, type: 'state', position: { x: 0, y: 0 }, data: { label: id, isStart: start } });
const edge = (id: string, source: string, target: string) => ({ id, source, target, data: { label: 'a' } });

describe('computeLayeredLayout', () => {
  it('returns nothing for an empty graph', () => {
    expect(computeLayeredLayout([], [])).toEqual({});
  });

  it('lays out a linear chain in strictly increasing columns', () => {
    const positions = computeLayeredLayout(
      [node('a', true), node('b'), node('c')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')]
    );
    expect(positions.a.x).toBeLessThan(positions.b.x);
    expect(positions.b.x).toBeLessThan(positions.c.x);
  });

  it('places branching targets in the same column at different rows', () => {
    const positions = computeLayeredLayout(
      [node('a', true), node('b'), node('c')],
      [edge('e1', 'a', 'b'), edge('e2', 'a', 'c')]
    );
    expect(positions.b.x).toBe(positions.c.x);
    expect(positions.b.y).not.toBe(positions.c.y);
  });

  it('does not let a self-loop influence layering', () => {
    const positions = computeLayeredLayout(
      [node('a', true), node('b')],
      [edge('loop', 'a', 'a'), edge('e1', 'a', 'b')]
    );
    expect(positions.a.x).toBeLessThan(positions.b.x);
  });

  it('falls back to in-degree-zero nodes as roots when there is no start state', () => {
    const positions = computeLayeredLayout(
      [node('a'), node('b'), node('c')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')]
    );
    expect(positions.a.x).toBeLessThan(positions.b.x);
    expect(positions.b.x).toBeLessThan(positions.c.x);
  });

  it('seeds a disconnected component in its own column group past the main graph', () => {
    const positions = computeLayeredLayout(
      [node('a', true), node('b'), node('isolated')],
      [edge('e1', 'a', 'b')]
    );
    expect(positions.isolated.x).toBeGreaterThan(positions.b.x);
  });

  it('handles a fully cyclic graph without infinite looping', () => {
    const positions = computeLayeredLayout(
      [node('a'), node('b'), node('c')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'a')]
    );
    expect(Object.keys(positions).sort()).toEqual(['a', 'b', 'c']);
  });
});
