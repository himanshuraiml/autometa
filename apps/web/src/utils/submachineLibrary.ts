import type { Node, Edge } from '@xyflow/react';

/** A saved, reusable TM/PDA diagram fragment: entry = its start state, exit = its accept states (see insertSubmachineOnEdge). */
export interface Submachine {
  id: string;
  name: string;
  automatonType: 'TM' | 'PDA';
  nodes: Node[];
  edges: Edge[];
  createdAt: string;
}

const STORAGE_KEY = 'autometa_submachines';

const readAll = (): Submachine[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeAll = (submachines: Submachine[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(submachines));

export const listSubmachines = (type: 'TM' | 'PDA'): Submachine[] => readAll().filter(sm => sm.automatonType === type);

export const saveSubmachine = (type: 'TM' | 'PDA', name: string, nodes: Node[], edges: Edge[]): Submachine => {
  const submachine: Submachine = {
    id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    automatonType: type,
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(edges)),
    createdAt: new Date().toISOString(),
  };
  writeAll([...readAll(), submachine]);
  return submachine;
};

export const renameSubmachine = (id: string, name: string) => writeAll(readAll().map(sm => sm.id === id ? { ...sm, name } : sm));

export const deleteSubmachine = (id: string) => writeAll(readAll().filter(sm => sm.id !== id));
