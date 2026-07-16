import type { Edge, Node } from '@xyflow/react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { AutomatonType } from '../utils/flowAutomaton';
import { validateAutomaton } from '../utils/automatonValidation';
import { useGraphStore } from '../store/useGraphStore';

export const ValidationPanel = ({ nodes, edges, automatonType }: { nodes: Node[]; edges: Edge[]; automatonType: AutomatonType }) => {
  const { tapeAlphabet, stackAlphabet, tapeCount } = useGraphStore();
  const issues = validateAutomaton(nodes, edges, automatonType, { tapeAlphabet, stackAlphabet, tapeCount });
  if (!issues.length) return <section><h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Validation</h2><div className="p-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] text-xs text-emerald-300 flex gap-2"><CheckCircle2 className="w-4 h-4" />Ready to simulate</div></section>;
  return <section><h2 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Validation · {issues.length}</h2><div className="rounded-xl border border-white/5 overflow-hidden max-h-40 overflow-y-auto custom-scrollbar">{issues.map(issue => <div key={issue.id} className={`p-2.5 border-b border-white/5 last:border-0 text-[11px] flex gap-2 ${issue.severity === 'error' ? 'text-red-300 bg-red-500/[0.03]' : 'text-amber-200'}`}><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{issue.message}</div>)}</div></section>;
};
