import { StateNode } from './components/StateNode';
import { TransitionEdge } from './components/TransitionEdge';

export const nodeTypes = {
  state: StateNode,
};

export const edgeTypes = {
  transition: TransitionEdge,
};

export * from './components/StateNode';
export * from './components/TransitionEdge';
