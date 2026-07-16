import type { ProjectDTO, ProjectVersionDTO } from './apiClient';

/**
 * "Sharing links" without a hosted multi-tenant server (see
 * docs/phase-5-7-implementation.md): a self-contained JSON bundle of a
 * project plus its version history, exportable/importable as a file.
 * `readOnly` is advisory — enforced by tagging the imported copy, not by a
 * hard technical restriction, consistent with this app's local-first trust
 * model (the same reasoning as the Phase 5 accounts decision).
 */

export const SHARE_FORMAT = 'autometa-share-package';
export const SHARE_FORMAT_VERSION = 1;

export const READ_ONLY_TAG = 'shared:read-only';

export interface SharePackageVersion {
  label: string;
  nodes_json: string;
  edges_json: string;
  node_counter: number;
  created_at: string;
}

export interface SharePackage {
  format: typeof SHARE_FORMAT;
  version: typeof SHARE_FORMAT_VERSION;
  readOnly: boolean;
  sharedAt: string;
  project: {
    name: string;
    automaton_type: string;
    nodes_json: string;
    edges_json: string;
    node_counter: number;
    metadata_json?: string;
    tags_json?: string;
  };
  versions: SharePackageVersion[];
}

export const createSharePackage = (
  project: ProjectDTO,
  versions: ProjectVersionDTO[],
  readOnly: boolean
): SharePackage => ({
  format: SHARE_FORMAT,
  version: SHARE_FORMAT_VERSION,
  readOnly,
  sharedAt: new Date().toISOString(),
  project: {
    name: project.name,
    automaton_type: project.automaton_type,
    nodes_json: project.nodes_json,
    edges_json: project.edges_json,
    node_counter: project.node_counter,
    metadata_json: project.metadata_json,
    tags_json: project.tags_json,
  },
  versions: versions.map(v => ({
    label: v.label,
    nodes_json: v.nodes_json,
    edges_json: v.edges_json,
    node_counter: v.node_counter,
    created_at: v.created_at,
  })),
});

export const parseSharePackage = (value: unknown): SharePackage => {
  if (!value || typeof value !== 'object') throw new Error('Share package must be a JSON object.');
  const pkg = value as Record<string, unknown>;
  if (pkg.format !== SHARE_FORMAT) throw new Error('This is not an Autometa share package.');
  if (pkg.version !== SHARE_FORMAT_VERSION) throw new Error(`Unsupported share package version: ${String(pkg.version)}.`);
  const project = pkg.project as Record<string, unknown> | undefined;
  if (!project || typeof project !== 'object' || typeof project.nodes_json !== 'string' || typeof project.edges_json !== 'string') {
    throw new Error('Share package is missing its project data.');
  }
  return {
    format: SHARE_FORMAT,
    version: SHARE_FORMAT_VERSION,
    readOnly: !!pkg.readOnly,
    sharedAt: typeof pkg.sharedAt === 'string' ? pkg.sharedAt : new Date().toISOString(),
    project: {
      name: typeof project.name === 'string' ? project.name : 'Shared project',
      automaton_type: typeof project.automaton_type === 'string' ? project.automaton_type : 'DFA',
      nodes_json: project.nodes_json as string,
      edges_json: project.edges_json as string,
      node_counter: typeof project.node_counter === 'number' ? project.node_counter : 0,
      metadata_json: typeof project.metadata_json === 'string' ? project.metadata_json : undefined,
      tags_json: typeof project.tags_json === 'string' ? project.tags_json : undefined,
    },
    versions: Array.isArray(pkg.versions) ? (pkg.versions as SharePackageVersion[]) : [],
  };
};

export const downloadSharePackage = (pkg: SharePackage) => {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pkg.project.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.share.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
