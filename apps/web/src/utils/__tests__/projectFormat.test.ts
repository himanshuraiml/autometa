import { describe, expect, it } from 'vitest';
import { PROJECT_FORMAT, PROJECT_FORMAT_VERSION, createProjectFile, parseProjectFile } from '../projectFormat';

describe('project format', () => {
  const payload = { automatonType: 'DFA' as const, nodes: [], edges: [], nodeCounter: 0 };

  it('creates a versioned project file', () => {
    expect(createProjectFile(payload)).toMatchObject({ format: PROJECT_FORMAT, version: PROJECT_FORMAT_VERSION, ...payload });
  });

  it('accepts legacy v1 project files', () => {
    expect(parseProjectFile({ ...payload, version: '1.0.0' })).toMatchObject(payload);
  });

  it('rejects unsupported project files', () => {
    expect(() => parseProjectFile({ ...payload, format: PROJECT_FORMAT, version: 99 })).toThrow('Unsupported project format version: 99.');
  });

  it('round-trips alphabet and per-machine tests', () => {
    const project = createProjectFile({
      ...payload,
      alphabet: ['0', '1'],
      testSuites: { DFA: [{ id: 't1', input: '01', expected: 'accept' }], NFA: [], Mealy: [], Moore: [], PDA: [], TM: [] },
    });
    expect(parseProjectFile(project)).toMatchObject({ alphabet: ['0', '1'], testSuites: { DFA: [{ input: '01', expected: 'accept' }] } });
  });

  it('round-trips a declared tape/stack alphabet', () => {
    const project = createProjectFile({ ...payload, automatonType: 'PDA', tapeAlphabet: ['0', '1', '_'], stackAlphabet: ['Z', 'A'] });
    expect(parseProjectFile(project)).toMatchObject({ tapeAlphabet: ['0', '1', '_'], stackAlphabet: ['Z', 'A'] });
  });

  it('defaults tape/stack alphabet to empty for older project files that lack them', () => {
    expect(parseProjectFile(createProjectFile(payload))).toMatchObject({ tapeAlphabet: [], stackAlphabet: [] });
  });
});
