import React from 'react';
import { Layers, CheckCircle2, XCircle } from 'lucide-react';
import { classifyChomskyHierarchy } from '@autometa/rule-engine';
import type { ChomskyLevel } from '@autometa/rule-engine';

export interface ChomskyInspectorProps {
  rules: Record<string, string[]>;
  startSymbol?: string;
  className?: string;
}

export const ChomskyInspector: React.FC<ChomskyInspectorProps> = ({
  rules,
  startSymbol = 'S',
  className = ''
}) => {
  const analysis = classifyChomskyHierarchy(rules, startSymbol);

  const HIERARCHY_LEVELS: Array<{ level: ChomskyLevel; title: string; desc: string; isSatisfied: boolean }> = [
    {
      level: 'Type-3 (Regular)',
      title: 'Type-3 (Regular Grammar)',
      desc: 'Rules must be right-linear (A → aB) or left-linear (A → Ba). Recognizable by DFAs/NFAs.',
      isSatisfied: analysis.isRegular
    },
    {
      level: 'Type-2 (Context-Free)',
      title: 'Type-2 (Context-Free Grammar)',
      desc: 'Rules must have a single nonterminal on the left (A → α). Recognizable by Pushdown Automata (PDAs).',
      isSatisfied: analysis.isContextFree
    },
    {
      level: 'Type-1 (Context-Sensitive)',
      title: 'Type-1 (Context-Sensitive Grammar)',
      desc: 'Rules must be non-contracting (|α| ≤ |β|). Recognizable by Linear Bounded Automata (LBAs).',
      isSatisfied: analysis.isContextSensitive
    },
    {
      level: 'Type-0 (Unrestricted)',
      title: 'Type-0 (Unrestricted Grammar)',
      desc: 'Arbitrary production rules (α → β). Recognizable by Turing Machines.',
      isSatisfied: analysis.isUnrestricted
    }
  ];

  return (
    <div className={`bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4 flex flex-col gap-3.5 shadow-sm text-[var(--text-main)] ${className}`}>
      <div className="flex flex-col gap-2 border-b border-[var(--border-color)] pb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--color-emerald)] shrink-0" />
          <h3 className="text-xs font-black uppercase tracking-wide text-[var(--text-main)]">Chomsky Hierarchy Inspector</h3>
        </div>
        <span className="self-start px-2.5 py-1 rounded-full text-xs font-mono font-extrabold bg-[var(--bg-panel)] text-[var(--color-emerald)] border border-[var(--color-emerald)]">
          {analysis.level}
        </span>
      </div>

      <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed">
        {analysis.explanation}
      </p>

      <div className="flex flex-col gap-2.5">
        {HIERARCHY_LEVELS.map(item => (
          <div
            key={item.level}
            className={`p-3.5 rounded-xl border flex flex-col gap-1.5 transition-all ${
              item.isSatisfied
                ? 'bg-[var(--bg-panel)] border-[var(--color-emerald)]'
                : 'bg-[var(--bg-secondary)] border-[var(--border-color)] opacity-60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold font-mono text-[var(--text-main)]">
                {item.title}
              </span>
              {item.isSatisfied ? (
                <CheckCircle2 className="w-4 h-4 text-[var(--color-emerald)] shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-[var(--text-dim)] shrink-0" />
              )}
            </div>
            <p className={`text-xs leading-relaxed ${item.isSatisfied ? 'text-[var(--text-main)] font-medium' : 'text-[var(--text-muted)]'}`}>
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
