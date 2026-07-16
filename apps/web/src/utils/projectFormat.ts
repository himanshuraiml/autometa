import type { Edge, Node } from '@xyflow/react';
import type { AutomatonType } from './flowAutomaton';

export const PROJECT_FORMAT = 'autometa-project';
export const PROJECT_FORMAT_VERSION = 2;

export interface MachineTestCase { id: string; input: string; expected: 'accept' | 'reject'; }
export type MachineTestSuites = Record<AutomatonType, MachineTestCase[]>;

export interface AutometaProjectFile {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_FORMAT_VERSION;
  automatonType: AutomatonType;
  nodes: Node[];
  edges: Edge[];
  nodeCounter: number;
  alphabet?: string[];
  tapeAlphabet?: string[];
  stackAlphabet?: string[];
  tapeCount?: number;
  testSuites?: MachineTestSuites;
}

const AUTOMATON_TYPES: AutomatonType[] = ['DFA', 'NFA', 'Mealy', 'Moore', 'PDA', 'TM'];

export const createProjectFile = (project: Omit<AutometaProjectFile, 'format' | 'version'>): AutometaProjectFile => ({
  format: PROJECT_FORMAT,
  version: PROJECT_FORMAT_VERSION,
  ...project,
});

/** Parses current project files and the unversioned v1 files exported before this schema existed. */
export const parseProjectFile = (value: unknown): AutometaProjectFile => {
  if (!value || typeof value !== 'object') throw new Error('Project file must contain a JSON object.');
  const project = value as Record<string, unknown>;
  const isLegacy = project.format === undefined && project.version === '1.0.0';

  if (!isLegacy && project.format !== PROJECT_FORMAT) throw new Error('This is not an Autometa project file.');
  if (!isLegacy && project.version !== 1 && project.version !== PROJECT_FORMAT_VERSION) throw new Error(`Unsupported project format version: ${String(project.version)}.`);
  if (!Array.isArray(project.nodes) || !Array.isArray(project.edges)) throw new Error('Project must contain nodes and edges arrays.');
  if (!AUTOMATON_TYPES.includes(project.automatonType as AutomatonType)) throw new Error('Project has an invalid automaton type.');

  return createProjectFile({
    automatonType: project.automatonType as AutomatonType,
    nodes: project.nodes as Node[],
    edges: project.edges as Edge[],
    nodeCounter: typeof project.nodeCounter === 'number' ? project.nodeCounter : project.nodes.length,
    alphabet: Array.isArray(project.alphabet) ? project.alphabet.filter((symbol): symbol is string => typeof symbol === 'string') : [],
    tapeAlphabet: Array.isArray(project.tapeAlphabet) ? project.tapeAlphabet.filter((symbol): symbol is string => typeof symbol === 'string') : [],
    stackAlphabet: Array.isArray(project.stackAlphabet) ? project.stackAlphabet.filter((symbol): symbol is string => typeof symbol === 'string') : [],
    tapeCount: typeof project.tapeCount === 'number' ? project.tapeCount : 1,
    testSuites: project.testSuites && typeof project.testSuites === 'object' ? project.testSuites as MachineTestSuites : undefined,
  });
};
