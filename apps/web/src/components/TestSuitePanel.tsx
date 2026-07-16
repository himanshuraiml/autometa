import { useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import type { MachineTestCase } from '../store/useGraphStore';

interface TestSuitePanelProps {
  /** Shown in the header, e.g. "DFA" or "CFG" — purely a label, not tied to canvas automaton types. */
  label: string;
  tests: MachineTestCase[];
  onAdd: (input: string, expected: 'accept' | 'reject') => void;
  onRemove: (id: string) => void;
  /** How to check a test case — state-machine simulation for FA/PDA/TM, CYK parse-membership for CFG, etc. */
  runInput: (input: string) => { accepted: boolean };
}

export const TestSuitePanel = ({ label, tests, onAdd, onRemove, runInput }: TestSuitePanelProps) => {
  const [input, setInput] = useState('');
  const [expected, setExpected] = useState<'accept' | 'reject'>('accept');
  const [results, setResults] = useState<Record<string, boolean>>({});
  const runAll = () => setResults(Object.fromEntries(tests.map(test => [test.id, runInput(test.input).accepted === (test.expected === 'accept')])));

  return <section>
    <div className="flex items-center justify-between mb-3"><h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Test suite · {label}</h2><button onClick={runAll} disabled={!tests.length} className="text-[10px] text-[#00e5a3] bg-transparent border-0 cursor-pointer disabled:opacity-40">Run all</button></div>
    <div className="flex gap-1.5 mb-2"><input value={input} onChange={event => setInput(event.target.value)} placeholder="input (ε = empty)" className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono" /><select value={expected} onChange={event => setExpected(event.target.value as 'accept' | 'reject')} className="bg-black/40 border border-white/10 rounded px-1 text-[10px] text-white"><option value="accept">accept</option><option value="reject">reject</option></select><button onClick={() => { onAdd(input, expected); setInput(''); }} className="p-1 rounded border border-white/10 text-[#00e5a3] bg-transparent cursor-pointer" aria-label="Add test"><Plus size={14} /></button></div>
    <div className="space-y-1">{tests.map(test => <div key={test.id} className="flex items-center gap-2 bg-black/20 rounded px-2 py-1 text-[10px]"><span className="font-mono text-slate-200 flex-1 truncate">{test.input || 'ε'}</span><span className="text-slate-500">→ {test.expected}</span>{results[test.id] !== undefined && (results[test.id] ? <Check size={13} className="text-[#00e5a3]" /> : <X size={13} className="text-red-400" />)}<button onClick={() => onRemove(test.id)} className="border-0 bg-transparent text-slate-500 hover:text-red-400 cursor-pointer p-0"><Trash2 size={12} /></button></div>)}</div>
  </section>;
};
