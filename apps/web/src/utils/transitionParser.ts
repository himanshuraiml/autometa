import type { AutomatonType } from './flowAutomaton';
import { parsePdaTransitionParts, type PdaTransitionParts } from '@autometa/rule-engine';

// Re-exported so existing call sites in this app keep working — the canonical
// definition lives in rule-engine since pda-cfg.ts's PDA -> CFG conversion
// needs it too, and a package shouldn't reach into an app for pure logic.
export { parsePdaTransitionParts };
export type { PdaTransitionParts };

export interface TransitionParseIssue {
  code: 'empty-label' | 'invalid-transition';
  message: string;
}

export interface TransitionParseResult {
  transitions: string[];
  issues: TransitionParseIssue[];
}

const splitCommaSeparated = (label: string) =>
  label.split(',').map(value => value.trim()).filter(Boolean);

/**
 * Converts an edge label into the complete transitions expected by a simulator.
 * DFA/NFA/Moore labels are comma-separated symbols, while PDA and TM labels use
 * commas inside one transition and therefore need a grammar-aware split.
 *
 * `tapeCount` only affects TM labels: multi-tape TMs (tapeCount > 1) use a
 * simpler one-transition-per-edge grammar (see `parseMultiTapeTmTransitionParts`)
 * instead of the single-tape comma-packed multi-transition grammar, since the
 * per-tape comma lists would otherwise collide with that packing syntax.
 */
export const parseTransitionLabel = (label: string, type: AutomatonType, tapeCount: number = 1): TransitionParseResult => {
  const normalized = label.trim();
  if (!normalized) {
    return { transitions: [], issues: [{ code: 'empty-label', message: 'Transition label is empty.' }] };
  }

  if (type === 'DFA' || type === 'NFA' || type === 'Moore' || type === 'Mealy') {
    return { transitions: splitCommaSeparated(normalized), issues: [] };
  }

  if (type === 'TM' && tapeCount > 1) {
    const shape = /^[^;>]+->[^;]+;[^;]+$/;
    if (!shape.test(normalized)) {
      return { transitions: [], issues: [{ code: 'invalid-transition', message: `Invalid multi-tape TM transition. Expected r1,r2,... -> w1,w2,... ; d1,d2,... (${tapeCount} tapes).` }] };
    }
    return { transitions: [normalized], issues: [] };
  }

  const pattern = type === 'TM'
    // read -> write, direction; supports multiple transitions on one edge.
    ? /(?:^|,\s*)([^,]+?\s*->\s*[^,]+,\s*[LRS])(?=\s*,\s*[^,]+?\s*->|$)/g
    // input, pop -> push; supports multiple PDA transitions on one edge.
    : /(?:^|,\s*)([^,]+\s*,\s*[^,]+?\s*->\s*[^,]+?)(?=\s*,\s*[^,]+\s*,\s*[^,]+?\s*->|$)/g;

  const transitions = Array.from(normalized.matchAll(pattern), match => match[1].trim());
  const reconstructed = transitions.join(',').replace(/\s/g, '');
  const compactLabel = normalized.replace(/\s/g, '');

  if (transitions.length === 0 || reconstructed !== compactLabel) {
    const expected = type === 'TM' ? 'read -> write, L/R/S' : 'input, pop -> push';
    return {
      transitions,
      issues: [{ code: 'invalid-transition', message: `Invalid ${type} transition. Expected ${expected}.` }],
    };
  }

  return { transitions, issues: [] };
};

/** Inverse of `parsePdaTransitionParts` — blank fields render as ε, matching the PDA epsilon convention used elsewhere (e.g. `cfgToPDA`). */
export const formatPdaTransitionParts = (parts: PdaTransitionParts): string =>
  `${parts.read.trim() || 'ε'}, ${parts.pop.trim() || 'ε'} -> ${parts.push.trim() || 'ε'}`;

/** Structured fields behind a single `read -> write, L/R/S` TM transition string. */
export interface TmTransitionParts { read: string; write: string; direction: 'L' | 'R' | 'S'; }

/** Parses one already-split TM transition (see `parseTransitionLabel`) into its fields. */
export const parseTmTransitionParts = (text: string): TmTransitionParts => {
  const match = text.match(/^\s*([^,]*?)\s*->\s*([^,]*?)\s*,\s*([LRS])\s*$/);
  return match ? { read: match[1], write: match[2], direction: match[3] as 'L' | 'R' | 'S' } : { read: '', write: '', direction: 'R' };
};

/** Inverse of `parseTmTransitionParts` — a blank read/write renders as ε. */
export const formatTmTransitionParts = (parts: TmTransitionParts): string =>
  `${parts.read.trim() || 'ε'} -> ${parts.write.trim() || 'ε'}, ${parts.direction}`;

/** Structured fields behind a multi-tape TM transition: one read/write/direction per tape. */
export interface MultiTapeTmTransitionParts { reads: string[]; writes: string[]; directions: ('L' | 'R' | 'S')[]; }

/**
 * Parses a TM transition for any tape count. For `tapeCount <= 1` this is just
 * `parseTmTransitionParts` wrapped in single-element arrays, so callers (e.g.
 * validation) can treat single- and multi-tape TMs uniformly. For
 * `tapeCount > 1` it parses the `r1,r2,... -> w1,w2,... ; d1,d2,...` grammar
 * (see `parseTransitionLabel`'s multi-tape branch for the shape this assumes).
 */
export const parseMultiTapeTmTransitionParts = (text: string, tapeCount: number): MultiTapeTmTransitionParts => {
  if (tapeCount <= 1) {
    const { read, write, direction } = parseTmTransitionParts(text);
    return { reads: [read], writes: [write], directions: [direction] };
  }
  const match = text.match(/^\s*(.*?)\s*->\s*(.*?)\s*;\s*(.*?)\s*$/);
  if (!match) {
    return { reads: Array(tapeCount).fill(''), writes: Array(tapeCount).fill(''), directions: Array(tapeCount).fill('R') };
  }
  const reads = match[1].split(',').map(s => s.trim());
  const writes = match[2].split(',').map(s => s.trim());
  const directions = match[3].split(',').map(s => s.trim().toUpperCase() as 'L' | 'R' | 'S');
  return { reads, writes, directions };
};

/** Inverse of `parseMultiTapeTmTransitionParts` — blank read/write fields render as ε. */
export const formatMultiTapeTmTransitionParts = (parts: MultiTapeTmTransitionParts): string => {
  if (parts.reads.length <= 1) {
    return formatTmTransitionParts({ read: parts.reads[0] ?? '', write: parts.writes[0] ?? '', direction: parts.directions[0] ?? 'R' });
  }
  const fmt = (s: string) => s.trim() || 'ε';
  return `${parts.reads.map(fmt).join(',')} -> ${parts.writes.map(fmt).join(',')} ; ${parts.directions.join(',')}`;
};
