import { useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { AutomatonType } from '../utils/flowAutomaton';
import { getInputAlphabet, getTransitionInputSymbol } from '../utils/automatonValidation';
import { parseTransitionLabel, parsePdaTransitionParts, formatPdaTransitionParts, parseTmTransitionParts, formatTmTransitionParts, parseMultiTapeTmTransitionParts, formatMultiTapeTmTransitionParts } from '../utils/transitionParser';
import type { PdaTransitionParts, TmTransitionParts } from '../utils/transitionParser';
import { useGraphStore } from '../store/useGraphStore';

const labelOf = (node: Node) => String(node.data?.label || node.id);

/** Locates the one transition (if any) matching `symbol` among a source state's outgoing edges. */
const findBySymbol = (edges: Edge[], source: string, symbol: string, type: AutomatonType) => {
  for (const edge of edges.filter(e => e.source === source)) {
    const transitions = parseTransitionLabel(String(edge.data?.label || ''), type).transitions;
    const transitionIndex = transitions.findIndex(t => getTransitionInputSymbol(t, type) === symbol);
    if (transitionIndex !== -1) return { edgeId: edge.id, transitionIndex, target: edge.target, text: transitions[transitionIndex] };
  }
  return undefined;
};

const cellSelectClass = 'w-full min-w-16 bg-black/40 border border-white/10 rounded px-1 py-1 text-[10px] text-white';

/** DFA (single target), NFA (multi-target), and Mealy (target + output) all share one state-by-symbol grid shape. */
const GridTransitionTable = ({ nodes, edges, automatonType, alphabet }: { nodes: Node[]; edges: Edge[]; automatonType: AutomatonType; alphabet: string[] }) => {
  const { setTableTransition, toggleTableTransitionTarget, setStructuredTransition } = useGraphStore();

  const renderCell = (node: Node, symbol: string) => {
    if (automatonType === 'NFA') {
      const targets = new Set(edges.filter(e => e.source === node.id && parseTransitionLabel(String(e.data?.label || ''), 'NFA').transitions.includes(symbol)).map(e => e.target));
      return (
        <div className="flex flex-wrap gap-1 max-w-[140px]">
          {nodes.map(target => (
            <button
              key={target.id}
              type="button"
              onClick={() => toggleTableTransitionTarget(node.id, symbol, target.id)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${targets.has(target.id) ? 'bg-[#00e5a3]/20 border-[#00e5a3]/50 text-[#00e5a3]' : 'bg-black/30 border-white/10 text-slate-400 hover:border-white/30'}`}
            >
              {labelOf(target)}
            </button>
          ))}
        </div>
      );
    }

    if (automatonType === 'Mealy') {
      const match = findBySymbol(edges, node.id, symbol, 'Mealy');
      const target = match?.target ?? '';
      const output = match ? match.text.split('/')[1]?.trim() ?? '' : '';
      return (
        <div className="flex gap-1 items-center">
          <select
            value={target}
            onChange={event => {
              const nextTarget = event.target.value;
              const text = nextTarget ? `${symbol}/${output || '0'}` : '';
              setStructuredTransition({ source: node.id, target: nextTarget || node.id, transitionText: text, previous: match && { edgeId: match.edgeId, transitionIndex: match.transitionIndex } });
            }}
            className={cellSelectClass}
          >
            <option value="">—</option>
            {nodes.map(t => <option key={t.id} value={t.id}>{labelOf(t)}</option>)}
          </select>
          {target && (
            <input
              value={output}
              onChange={event => setStructuredTransition({ source: node.id, target, transitionText: `${symbol}/${event.target.value || '0'}`, previous: match && { edgeId: match.edgeId, transitionIndex: match.transitionIndex } })}
              placeholder="out"
              className="w-10 bg-black/40 border border-white/10 rounded px-1 py-1 text-[10px] text-white font-mono"
              aria-label={`Output for ${labelOf(node)} on ${symbol}`}
            />
          )}
        </div>
      );
    }

    // DFA / Moore: a single target per (state, symbol).
    const target = edges.find(edge => edge.source === node.id && String(edge.data?.label || '').split(',').map(v => v.trim()).includes(symbol))?.target || '';
    return (
      <select value={target} onChange={event => setTableTransition(node.id, symbol, event.target.value || null)} className={cellSelectClass}>
        <option value="">—</option>
        {nodes.map(t => <option key={t.id} value={t.id}>{labelOf(t)}</option>)}
      </select>
    );
  };

  if (!alphabet.length) return <p className="text-[10px] text-slate-500">Add symbols to make the table editable.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full text-[11px]">
        <thead className="bg-white/[0.03]"><tr><th className="p-2 text-left">State</th>{alphabet.map(symbol => <th key={symbol} className="p-2 text-left text-[#00e5a3] font-mono">{symbol}</th>)}</tr></thead>
        <tbody>
          {nodes.map(node => (
            <tr key={node.id} className="border-t border-white/5">
              <td className="p-2 font-mono text-slate-300">{labelOf(node)}</td>
              {alphabet.map(symbol => <td key={symbol} className="p-1">{renderCell(node, symbol)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface StructuredRow { edgeId: string; transitionIndex: number; source: string; target: string; text: string; }

const StateSelect = ({ nodes, value, onChange }: { nodes: Node[]; value: string; onChange: (id: string) => void }) => (
  <select value={value} onChange={event => onChange(event.target.value)} className={cellSelectClass}>
    {nodes.map(n => <option key={n.id} value={n.id}>{labelOf(n)}</option>)}
  </select>
);

const narrowInputClass = 'w-14 bg-black/40 border border-white/10 rounded px-1 py-1 text-[10px] text-white font-mono';

/** PDA and TM transitions can't fit a state-by-symbol grid (the "symbol" carries several fields), so they get one editable row per transition instead. */
const StructuredTransitionTable = ({ nodes, edges, automatonType, tapeCount = 1 }: { nodes: Node[]; edges: Edge[]; automatonType: 'PDA' | 'TM'; tapeCount?: number }) => {
  const { setStructuredTransition } = useGraphStore();
  const firstNodeId = nodes[0]?.id ?? '';
  const isMultiTape = automatonType === 'TM' && tapeCount > 1;
  const [draft, setDraft] = useState(() => ({ source: firstNodeId, target: firstNodeId, read: '', pop: '', push: '', write: '', direction: 'R' as 'L' | 'R' | 'S' }));
  const [multiDraft, setMultiDraft] = useState(() => ({ reads: Array(tapeCount).fill(''), writes: Array(tapeCount).fill(''), directions: Array(tapeCount).fill('R') as ('L' | 'R' | 'S')[] }));

  const rows: StructuredRow[] = edges.flatMap(edge =>
    parseTransitionLabel(String(edge.data?.label || ''), automatonType, tapeCount).transitions.map((text, transitionIndex) => ({ edgeId: edge.id, transitionIndex, source: edge.source, target: edge.target, text }))
  );

  const commitRow = (row: StructuredRow, changes: Partial<{ source: string; target: string; text: string }>) => {
    setStructuredTransition({
      source: changes.source ?? row.source,
      target: changes.target ?? row.target,
      transitionText: changes.text ?? row.text,
      previous: { edgeId: row.edgeId, transitionIndex: row.transitionIndex },
    });
  };

  const removeRow = (row: StructuredRow) => setStructuredTransition({ source: row.source, target: row.target, transitionText: '', previous: { edgeId: row.edgeId, transitionIndex: row.transitionIndex } });

  const addDraftRow = () => {
    if (isMultiTape) {
      setStructuredTransition({ source: draft.source, target: draft.target, transitionText: formatMultiTapeTmTransitionParts(multiDraft) });
      setMultiDraft({ reads: Array(tapeCount).fill(''), writes: Array(tapeCount).fill(''), directions: Array(tapeCount).fill('R') });
      return;
    }
    const text = automatonType === 'PDA'
      ? formatPdaTransitionParts({ read: draft.read, pop: draft.pop, push: draft.push })
      : formatTmTransitionParts({ read: draft.read, write: draft.write, direction: draft.direction });
    setStructuredTransition({ source: draft.source, target: draft.target, transitionText: text });
    setDraft(d => ({ ...d, read: '', pop: '', push: '', write: '' }));
  };

  /** One read/write/direction field-group per tape, used for both existing rows and the new-row draft. */
  const renderMultiTapeFields = (
    parts: { reads: string[]; writes: string[]; directions: ('L' | 'R' | 'S')[] },
    update: (tapeIndex: number, field: 'read' | 'write' | 'direction', value: string) => void
  ) => (
    <div className="flex flex-col gap-1">
      {Array.from({ length: tapeCount }, (_, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-slate-600 w-6">T{i}</span>
          <input value={parts.reads[i] ?? ''} onChange={e => update(i, 'read', e.target.value)} placeholder="ε" className={narrowInputClass} aria-label={`Tape ${i} read symbol`} />
          <span className="text-slate-500">→</span>
          <input value={parts.writes[i] ?? ''} onChange={e => update(i, 'write', e.target.value)} placeholder="ε" className={narrowInputClass} aria-label={`Tape ${i} write symbol`} />
          <span className="text-slate-500">,</span>
          <select value={parts.directions[i] ?? 'R'} onChange={e => update(i, 'direction', e.target.value)} className={`${cellSelectClass} !w-12`} aria-label={`Tape ${i} head direction`}>
            <option value="L">L</option><option value="R">R</option><option value="S">S</option>
          </select>
        </div>
      ))}
    </div>
  );

  const renderFields = (row: StructuredRow) => {
    if (isMultiTape) {
      const parts = parseMultiTapeTmTransitionParts(row.text, tapeCount);
      return renderMultiTapeFields(parts, (i, field, value) => {
        const next = { reads: [...parts.reads], writes: [...parts.writes], directions: [...parts.directions] };
        if (field === 'read') next.reads[i] = value;
        else if (field === 'write') next.writes[i] = value;
        else next.directions[i] = value as 'L' | 'R' | 'S';
        commitRow(row, { text: formatMultiTapeTmTransitionParts(next) });
      });
    }
    if (automatonType === 'PDA') {
      const parts = parsePdaTransitionParts(row.text);
      const update = (next: Partial<PdaTransitionParts>) => commitRow(row, { text: formatPdaTransitionParts({ ...parts, ...next }) });
      return (
        <>
          <input value={parts.read} onChange={e => update({ read: e.target.value })} placeholder="ε" className={narrowInputClass} aria-label="Read symbol" />
          <span className="text-slate-500">,</span>
          <input value={parts.pop} onChange={e => update({ pop: e.target.value })} placeholder="ε" className={narrowInputClass} aria-label="Pop symbol" />
          <span className="text-slate-500">→</span>
          <input value={parts.push} onChange={e => update({ push: e.target.value })} placeholder="ε" className={`${narrowInputClass} w-20`} aria-label="Push symbols" />
        </>
      );
    }
    const parts = parseTmTransitionParts(row.text);
    const update = (next: Partial<TmTransitionParts>) => commitRow(row, { text: formatTmTransitionParts({ ...parts, ...next }) });
    return (
      <>
        <input value={parts.read} onChange={e => update({ read: e.target.value })} placeholder="ε" className={narrowInputClass} aria-label="Read symbol" />
        <span className="text-slate-500">→</span>
        <input value={parts.write} onChange={e => update({ write: e.target.value })} placeholder="ε" className={narrowInputClass} aria-label="Write symbol" />
        <span className="text-slate-500">,</span>
        <select value={parts.direction} onChange={e => update({ direction: e.target.value as 'L' | 'R' | 'S' })} className={`${cellSelectClass} !w-12`} aria-label="Head direction">
          <option value="L">L</option><option value="R">R</option><option value="S">S</option>
        </select>
      </>
    );
  };

  return (
    <div className="rounded-xl border border-white/5 overflow-hidden">
      <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-white/5">
        {rows.map(row => (
          <div key={`${row.edgeId}-${row.transitionIndex}`} className={`flex ${isMultiTape ? 'items-start' : 'items-center'} gap-1.5 p-1.5 text-[10px]`}>
            <StateSelect nodes={nodes} value={row.source} onChange={source => commitRow(row, { source })} />
            {renderFields(row)}
            <span className="text-slate-500">→</span>
            <StateSelect nodes={nodes} value={row.target} onChange={target => commitRow(row, { target })} />
            <button type="button" onClick={() => removeRow(row)} aria-label="Remove transition" className="ml-auto text-slate-500 hover:text-red-400 bg-transparent border-0 cursor-pointer text-xs">×</button>
          </div>
        ))}
        {!rows.length && <p className="p-2 text-[10px] text-slate-500">No transitions yet — add one below.</p>}
      </div>
      <div className={`flex ${isMultiTape ? 'items-start' : 'items-center'} gap-1.5 p-1.5 text-[10px] border-t border-white/10 bg-white/[0.02]`}>
        <StateSelect nodes={nodes} value={draft.source} onChange={source => setDraft(d => ({ ...d, source }))} />
        {isMultiTape ? (
          renderMultiTapeFields(multiDraft, (i, field, value) => setMultiDraft(prev => {
            const next = { reads: [...prev.reads], writes: [...prev.writes], directions: [...prev.directions] };
            if (field === 'read') next.reads[i] = value;
            else if (field === 'write') next.writes[i] = value;
            else next.directions[i] = value as 'L' | 'R' | 'S';
            return next;
          }))
        ) : automatonType === 'PDA' ? (
          <>
            <input value={draft.read} onChange={e => setDraft(d => ({ ...d, read: e.target.value }))} placeholder="ε" className={narrowInputClass} aria-label="New read symbol" />
            <span className="text-slate-500">,</span>
            <input value={draft.pop} onChange={e => setDraft(d => ({ ...d, pop: e.target.value }))} placeholder="ε" className={narrowInputClass} aria-label="New pop symbol" />
            <span className="text-slate-500">→</span>
            <input value={draft.push} onChange={e => setDraft(d => ({ ...d, push: e.target.value }))} placeholder="ε" className={`${narrowInputClass} w-20`} aria-label="New push symbols" />
          </>
        ) : (
          <>
            <input value={draft.read} onChange={e => setDraft(d => ({ ...d, read: e.target.value }))} placeholder="ε" className={narrowInputClass} aria-label="New read symbol" />
            <span className="text-slate-500">→</span>
            <input value={draft.write} onChange={e => setDraft(d => ({ ...d, write: e.target.value }))} placeholder="ε" className={narrowInputClass} aria-label="New write symbol" />
            <span className="text-slate-500">,</span>
            <select value={draft.direction} onChange={e => setDraft(d => ({ ...d, direction: e.target.value as 'L' | 'R' | 'S' }))} className={`${cellSelectClass} !w-12`} aria-label="New head direction">
              <option value="L">L</option><option value="R">R</option><option value="S">S</option>
            </select>
          </>
        )}
        <span className="text-slate-500">→</span>
        <StateSelect nodes={nodes} value={draft.target} onChange={target => setDraft(d => ({ ...d, target }))} />
        <button type="button" onClick={addDraftRow} className="ml-auto px-2 py-1 rounded bg-[#00e5a3]/15 border border-[#00e5a3]/40 text-[#00e5a3] font-bold cursor-pointer">+ Add</button>
      </div>
    </div>
  );
};

export const TransitionTable = ({ nodes, edges, automatonType }: { nodes: Node[]; edges: Edge[]; automatonType: AutomatonType }) => {
  const { alphabet: configuredAlphabet, setAlphabet, tapeAlphabet, setTapeAlphabet, stackAlphabet, setStackAlphabet, tapeCount } = useGraphStore();
  if (!nodes.length) return null;

  if (automatonType === 'PDA' || automatonType === 'TM') {
    const declaredAlphabet = automatonType === 'PDA' ? stackAlphabet : tapeAlphabet;
    const setDeclaredAlphabet = automatonType === 'PDA' ? setStackAlphabet : setTapeAlphabet;
    return (
      <section>
        <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Transition table</h2>
        <label className="text-[10px] text-slate-500 block mb-2">
          {automatonType === 'PDA' ? 'Stack alphabet' : 'Tape alphabet'} (comma separated)
          <input
            value={declaredAlphabet.join(', ')}
            onChange={event => setDeclaredAlphabet(event.target.value.split(','))}
            placeholder={automatonType === 'PDA' ? 'Z, A, B' : '0, 1, _'}
            className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono"
          />
          <span className="block mt-1 text-slate-600 normal-case">Optional — declare it to flag {automatonType === 'PDA' ? 'pop/push' : 'read/write'} symbols outside this set.</span>
        </label>
        <StructuredTransitionTable key={automatonType === 'TM' ? tapeCount : 1} nodes={nodes} edges={edges} automatonType={automatonType} tapeCount={automatonType === 'TM' ? tapeCount : 1} />
      </section>
    );
  }

  const alphabet = configuredAlphabet.length ? configuredAlphabet : getInputAlphabet(edges, automatonType);
  return (
    <section>
      <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Transition table</h2>
      <label className="text-[10px] text-slate-500 block mb-2">
        Alphabet (comma separated)
        <input value={alphabet.join(', ')} onChange={event => setAlphabet(event.target.value.split(','))} placeholder="0, 1" className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono" />
      </label>
      <GridTransitionTable nodes={nodes} edges={edges} automatonType={automatonType} alphabet={alphabet} />
    </section>
  );
};
