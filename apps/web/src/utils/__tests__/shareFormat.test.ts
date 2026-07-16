import { describe, expect, it } from 'vitest';
import { SHARE_FORMAT, SHARE_FORMAT_VERSION, createSharePackage, parseSharePackage } from '../shareFormat';
import type { ProjectDTO, ProjectVersionDTO } from '../apiClient';

const project: ProjectDTO = {
  id: 1,
  name: 'Ends with ab',
  automaton_type: 'DFA',
  nodes_json: '[]',
  edges_json: '[]',
  node_counter: 0,
  tags_json: '["homework"]',
  visibility: 'public',
  is_favorite: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const versions: ProjectVersionDTO[] = [
  { id: 1, project_id: 1, label: 'v1', nodes_json: '[]', edges_json: '[]', node_counter: 0, created_at: '2026-01-01T00:00:00Z' },
];

describe('share package', () => {
  it('creates a package with format/version stamped and versions included', () => {
    const pkg = createSharePackage(project, versions, true);
    expect(pkg).toMatchObject({ format: SHARE_FORMAT, version: SHARE_FORMAT_VERSION, readOnly: true });
    expect(pkg.project.name).toBe('Ends with ab');
    expect(pkg.versions).toHaveLength(1);
  });

  it('round-trips through parseSharePackage', () => {
    const pkg = createSharePackage(project, versions, false);
    const parsed = parseSharePackage(JSON.parse(JSON.stringify(pkg)));
    expect(parsed).toEqual(pkg);
  });

  it('rejects a non-Autometa-share JSON object', () => {
    expect(() => parseSharePackage({ foo: 'bar' })).toThrow('This is not an Autometa share package.');
  });

  it('rejects an unsupported version', () => {
    const pkg = createSharePackage(project, versions, false);
    expect(() => parseSharePackage({ ...pkg, version: 99 })).toThrow('Unsupported share package version: 99.');
  });

  it('rejects a package missing project data', () => {
    expect(() => parseSharePackage({ format: SHARE_FORMAT, version: SHARE_FORMAT_VERSION })).toThrow(
      'Share package is missing its project data.'
    );
  });
});
