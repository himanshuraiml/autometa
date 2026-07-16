import type { Automaton, AutomatonNode, AutomatonEdge } from '@autometa/simulation-engine';
import { isEpsilon } from '@autometa/simulation-engine';

/**
 * JFLAP (.jff) interoperability. JFLAP's XML schema is simple and
 * attribute-light, so this hand-rolls a small tag/attribute scanner instead
 * of depending on `DOMParser` (a browser-only API — this package has no
 * environment restrictions and its tests run under plain Node).
 *
 * Scope: `fa` (DFA/NFA — JFLAP doesn't distinguish them, so import always
 * produces an NFA, which correctly simulates deterministic machines too) is
 * fully supported. `pda`/`turing` are supported for the common case of
 * single-character stack/tape symbols, matching the vast majority of
 * textbook JFLAP files; multi-character push strings are not preserved.
 * `mealy` (input/output per transition) is supported; JFLAP has no native
 * Moore-machine format (Moore output is per-state, not per-transition), so
 * Moore machines cannot round-trip through .jff.
 */

export type JflapType = 'fa' | 'pda' | 'turing' | 'mealy';
export type JflapAutomatonType = 'DFA' | 'NFA' | 'PDA' | 'TM' | 'Mealy';

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const unescapeXml = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const extractTagBlocks = (xml: string, tag: string): string[] => {
  const regex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>|<${tag}\\b[^>]*\\/>`, 'g');
  return xml.match(regex) ?? [];
};

const extractTagText = (block: string, tag: string): string => {
  const closed = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (closed) return unescapeXml(closed[1].trim());
  return '';
};

const hasSelfClosingTag = (block: string, tag: string): boolean => new RegExp(`<${tag}\\s*/>`).test(block);

const extractAttr = (openTag: string, attr: string): string | null => {
  const m = openTag.match(new RegExp(`${attr}="([^"]*)"`));
  return m ? unescapeXml(m[1]) : null;
};

export interface PositionedAutomatonNode extends AutomatonNode {
  x: number;
  y: number;
}

export interface JflapImportResult {
  automatonType: JflapAutomatonType;
  nodes: PositionedAutomatonNode[];
  edges: AutomatonEdge[];
}

/** Parses a .jff file's XML text into the engine-neutral Automaton shape (plus node positions). */
export const importFromJflap = (xml: string): JflapImportResult => {
  const typeMatch = xml.match(/<type>([\s\S]*?)<\/type>/);
  const jflapType = (typeMatch?.[1].trim().toLowerCase() ?? 'fa') as JflapType;
  const automatonType: JflapAutomatonType =
    jflapType === 'pda' ? 'PDA' : jflapType === 'turing' ? 'TM' : jflapType === 'mealy' ? 'Mealy' : 'NFA';

  const nodes: PositionedAutomatonNode[] = extractTagBlocks(xml, 'state').map(block => {
    const openTag = block.match(/^<state\b[^>]*>/)?.[0] ?? '<state>';
    const id = extractAttr(openTag, 'id') ?? extractAttr(openTag, 'name') ?? '';
    const name = extractAttr(openTag, 'name') ?? id;
    return {
      id,
      label: name,
      isStart: hasSelfClosingTag(block, 'initial'),
      isAccept: hasSelfClosingTag(block, 'final'),
      x: parseFloat(extractTagText(block, 'x')) || 0,
      y: parseFloat(extractTagText(block, 'y')) || 0,
    };
  });

  const edges: AutomatonEdge[] = extractTagBlocks(xml, 'transition').map((block, index) => {
    const from = extractTagText(block, 'from');
    const to = extractTagText(block, 'to');
    let symbol: string;

    if (jflapType === 'pda') {
      const read = extractTagText(block, 'read');
      const pop = extractTagText(block, 'pop');
      const push = extractTagText(block, 'push');
      const pushSymbols = push ? push.split('').join(' ') : 'ε';
      symbol = `${read || 'ε'}, ${pop || 'ε'} -> ${pushSymbols}`;
    } else if (jflapType === 'turing') {
      const read = extractTagText(block, 'read') || '_';
      const write = extractTagText(block, 'write') || read;
      const move = (extractTagText(block, 'move') || 'S').toUpperCase();
      symbol = `${read} -> ${write}, ${move}`;
    } else if (jflapType === 'mealy') {
      const read = extractTagText(block, 'read');
      const output = extractTagText(block, 'transout');
      symbol = `${read}/${output}`;
    } else {
      symbol = extractTagText(block, 'read');
    }

    return { id: `jff-${index}`, source: from, target: to, symbols: [symbol] };
  });

  return { automatonType, nodes, edges };
};

/** Serializes an Automaton (plus node positions) into JFLAP .jff XML text. */
export const exportToJflap = (
  nodes: PositionedAutomatonNode[],
  edges: AutomatonEdge[],
  automatonType: JflapAutomatonType
): string => {
  const jflapType: JflapType =
    automatonType === 'PDA' ? 'pda' : automatonType === 'TM' ? 'turing' : automatonType === 'Mealy' ? 'mealy' : 'fa';

  const stateXml = nodes
    .map(
      n =>
        `        <state id="${escapeXml(n.id)}" name="${escapeXml(n.label)}">\n` +
        `            <x>${n.x}</x>\n            <y>${n.y}</y>\n` +
        (n.isStart ? '            <initial/>\n' : '') +
        (n.isAccept ? '            <final/>\n' : '') +
        `        </state>`
    )
    .join('\n');

  const transitionXml = edges
    .flatMap(edge =>
      edge.symbols.map(symbol => {
        const from = `            <from>${escapeXml(edge.source)}</from>`;
        const to = `            <to>${escapeXml(edge.target)}</to>`;

        if (automatonType === 'PDA') {
          const parts = symbol.split('->');
          const [input, pop] = (parts[0] ?? '').split(',').map(s => s.trim());
          const push = (parts[1] ?? '').trim();
          const pushSymbols = push && !isEpsilon(push) ? push.split(/\s+/).join('') : '';
          return (
            `        <transition>\n${from}\n${to}\n` +
            `            <read>${isEpsilon(input ?? '') ? '' : escapeXml(input ?? '')}</read>\n` +
            `            <pop>${isEpsilon(pop ?? '') ? '' : escapeXml(pop ?? '')}</pop>\n` +
            `            <push>${escapeXml(pushSymbols)}</push>\n        </transition>`
          );
        }

        if (automatonType === 'TM') {
          const [readPart, rest] = symbol.split('->').map(s => s.trim());
          const [write, move] = (rest ?? '').split(',').map(s => s.trim());
          return (
            `        <transition>\n${from}\n${to}\n` +
            `            <read>${escapeXml(readPart ?? '')}</read>\n` +
            `            <write>${escapeXml(write ?? readPart ?? '')}</write>\n` +
            `            <move>${escapeXml((move ?? 'S').toUpperCase())}</move>\n        </transition>`
          );
        }

        if (automatonType === 'Mealy') {
          const [input, output] = symbol.split('/').map(s => s.trim());
          return (
            `        <transition>\n${from}\n${to}\n` +
            `            <read>${escapeXml(input ?? '')}</read>\n` +
            `            <transout>${escapeXml(output ?? '')}</transout>\n        </transition>`
          );
        }

        return (
          `        <transition>\n${from}\n${to}\n` +
          `            <read>${isEpsilon(symbol) ? '' : escapeXml(symbol)}</read>\n        </transition>`
        );
      })
    )
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    `<!--Created with Autometa-->\n` +
    `<structure>\n    <type>${jflapType}</type>\n    <automaton>\n${stateXml}\n${transitionXml}\n    </automaton>\n</structure>\n`
  );
};

/** Automaton (without positions) view of an import result, for callers that only need engine semantics. */
export const jflapResultToAutomaton = (result: JflapImportResult): Automaton => ({
  nodes: result.nodes.map(({ x: _x, y: _y, ...node }) => node),
  edges: result.edges,
});
