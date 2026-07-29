import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps, EdgeProps } from '@xyflow/react';
import { StateNode } from '../components/StateNode';
import type { StateNodeData } from '../components/StateNode';
import { TransitionEdge } from '../components/TransitionEdge';
import type { TransitionEdgeData } from '../components/TransitionEdge';

/**
 * StateNode/TransitionEdge only read `data`/`selected` (and, for edges, the
 * bezier-path inputs) off their props — the rest of NodeProps/EdgeProps is
 * xyflow plumbing they never touch. Rendering them directly under just a
 * ReactFlowProvider (rather than a full <ReactFlow>) exercises exactly the
 * presentational logic these tests target, without needing xyflow's
 * viewport/measurement pipeline running in jsdom.
 */
const buildNodeProps = (data: StateNodeData, selected = false): NodeProps =>
  ({ id: 'n0', type: 'state', selected, data } as unknown as NodeProps);

const buildEdgeProps = (overrides: Partial<EdgeProps> & { data?: TransitionEdgeData } = {}): EdgeProps =>
  ({
    id: 'e0',
    source: 'a',
    target: 'b',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 0,
    sourcePosition: 'right',
    targetPosition: 'left',
    selected: false,
    ...overrides,
  } as unknown as EdgeProps);

const renderWithProvider = (node: React.ReactElement) => render(<ReactFlowProvider>{node}</ReactFlowProvider>);

describe('StateNode', () => {
  it('renders the label and an aria-label describing start/accept roles', () => {
    const { container } = renderWithProvider(<StateNode {...buildNodeProps({ label: 'q0', isStart: true, isAccept: true })} />);
    const group = container.querySelector('[aria-label^="State "]');
    expect(group?.getAttribute('aria-label')).toBe('State q0, start state, accepting state');
    expect(group?.textContent).toContain('q0');
    expect(group?.textContent).toContain('Start');
  });

  it('omits role descriptors and the start indicator for a plain state', () => {
    const { container } = renderWithProvider(<StateNode {...buildNodeProps({ label: 'q1' })} />);
    const group = container.querySelector('[aria-label^="State "]');
    expect(group?.getAttribute('aria-label')).toBe('State q1');
    expect(group?.textContent).not.toContain('Start');
  });

  it('describes reject and active states in the aria-label', () => {
    const { container } = renderWithProvider(<StateNode {...buildNodeProps({ label: 'q2', isReject: true, isActive: true })} />);
    const group = container.querySelector('[aria-label^="State "]');
    expect(group?.getAttribute('aria-label')).toBe('State q2, reject state, currently active');
  });

  it('shrinks the label font size class as the label text grows', () => {
    const { container: short } = renderWithProvider(<StateNode {...buildNodeProps({ label: 'q0' })} />);
    const { container: long } = renderWithProvider(<StateNode {...buildNodeProps({ label: 'a-very-long-state-name' })} />);
    expect(short.querySelector('.text-base')).not.toBeNull();
    expect(long.querySelector('.text-\\[9px\\]')).not.toBeNull();
  });
});

describe('TransitionEdge', () => {
  it('renders a labeled transition with an accessible title and matching path aria-label', () => {
    const { container } = renderWithProvider(
      <svg>
        <TransitionEdge {...buildEdgeProps({ data: { label: '0' } })} />
      </svg>
    );
    expect(container.querySelector('title')?.textContent).toBe('Transition from a to b on 0');
    expect(container.querySelector('path[aria-label]')?.getAttribute('aria-label')).toBe('Transition from a to b on 0');
    expect(container.textContent).toContain('0');
  });

  it('omits the symbol suffix when the edge has no label', () => {
    const { container } = renderWithProvider(
      <svg>
        <TransitionEdge {...buildEdgeProps()} />
      </svg>
    );
    expect(container.querySelector('title')?.textContent).toBe('Transition from a to b');
  });

  it('renders a self-loop title when source and target are the same node', () => {
    const { container } = renderWithProvider(
      <svg>
        <TransitionEdge {...buildEdgeProps({ source: 'a', target: 'a', data: { label: '1', loopDirection: 'top' } })} />
      </svg>
    );
    expect(container.querySelector('title')?.textContent).toBe('Transition from a to a on 1');
    // Self-loops draw a closed cubic path back to the same point instead of a straight bezier.
    const path = container.querySelector('path.react-flow__edge-path');
    expect(path?.getAttribute('d')?.startsWith('M 0 0 C')).toBe(true);
  });

  it('uses a highlighted stroke color and traversal dot while active', () => {
    const { container } = renderWithProvider(
      <svg>
        <TransitionEdge {...buildEdgeProps({ data: { label: '0', isActive: true, traversalProgress: 0.5 } })} />
      </svg>
    );
    const path = container.querySelector('path.react-flow__edge-path');
    expect(path?.getAttribute('stroke')).toBe('var(--color-blue)');
    expect(container.querySelector('circle')).not.toBeNull();
  });
});
