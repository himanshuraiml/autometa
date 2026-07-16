import { useState } from 'react';
import { HelpCircle, Compass, BookOpen, FileJson, LayoutGrid, Keyboard } from 'lucide-react';
import { Button } from '@autometa/ui';

interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReplayOnboarding: () => void;
  onOpenShortcuts: () => void;
}

type HelpTab = 'overview' | 'automata' | 'formats' | 'features';

const TABS: { id: HelpTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Compass className="w-3.5 h-3.5" /> },
  { id: 'automata', label: 'Automaton Types', icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: 'formats', label: 'File Formats', icon: <FileJson className="w-3.5 h-3.5" /> },
  { id: 'features', label: 'Features', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
];

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <h4 className="text-xs font-bold text-[#00e5a3] uppercase tracking-wider">{title}</h4>
    <p className="text-xs text-slate-300 leading-relaxed">{children}</p>
  </div>
);

/** Phase 7 help center: getting-started links, algorithm explanations, file-format guides, and a feature tour. */
export const HelpCenterModal = ({ isOpen, onClose, onReplayOnboarding, onOpenShortcuts }: HelpCenterModalProps) => {
  const [tab, setTab] = useState<HelpTab>('overview');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div
        className="bg-[#0b1220] border border-white/5 max-w-3xl w-full rounded-2xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-label="Help center"
      >
        <div className="flex justify-between items-center border-b border-white/5 px-6 py-4 shrink-0">
          <h3 className="font-extrabold text-sm tracking-widest text-slate-100 uppercase flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#00e5a3]" /> Help Center
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5a3]/50 rounded">
            CLOSE
          </button>
        </div>

        <nav className="flex items-center gap-1 px-6 pt-3 border-b border-white/5 shrink-0" role="tablist" aria-label="Help topics">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider rounded-t-lg border-none cursor-pointer flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5a3]/50 ${
                tab === t.id ? 'bg-white/5 text-[#00e5a3]' : 'text-slate-400 hover:text-white bg-transparent'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-5">
          {tab === 'overview' && (
            <>
              <Section title="What is Autometa?">
                An AI-assisted studio for designing, simulating, and studying automata theory and formal languages — DFA,
                NFA, Mealy and Moore machines, pushdown automata, Turing machines, regular expressions, and context-free
                grammars, plus AI lesson generation, practice exercises, and semantic grading.
              </Section>
              <div className="flex flex-wrap gap-3">
                <Button onClick={onReplayOnboarding} className="!bg-[#00e5a3] !text-black !font-bold !text-xs flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5" /> Replay the getting-started tour
                </Button>
                <Button variant="secondary" onClick={onOpenShortcuts} className="!text-xs flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5" /> View keyboard shortcuts
                </Button>
              </div>
              <Section title="Where to go next">
                Use the left navigation to move between the graph <strong>Editor</strong>, the <strong>Grammars</strong>{' '}
                workspace for context-free grammars, the AI <strong>Lesson Builder</strong>, <strong>Practice</strong> mode
                for exercises and progress tracking, and the project <strong>Library</strong> for saved/shared work. Each
                area has its own tools described under the "Features" tab.
              </Section>
            </>
          )}

          {tab === 'automata' && (
            <>
              <Section title="DFA — Deterministic Finite Automaton">
                Exactly one transition per symbol from every state, no ambiguity. The simplest model here; recognizes
                regular languages.
              </Section>
              <Section title="NFA — Nondeterministic Finite Automaton">
                Zero, one, or many transitions per symbol from a state (including ε/empty transitions). Recognizes the
                same class of languages as DFA — often more compactly — and can always be converted to an equivalent DFA
                via subset construction (see the Editor's transformation panel).
              </Section>
              <Section title="Mealy machine">
                A transducer whose output depends on both the current state and the input symbol read — transitions are
                labeled "input/output".
              </Section>
              <Section title="Moore machine">
                A transducer whose output depends only on the current state — the output is part of the state itself.
              </Section>
              <Section title="PDA — Pushdown Automaton">
                A finite automaton plus an unbounded stack. Transitions read an input symbol, optionally pop a stack
                symbol, and optionally push one or more symbols — labeled "read, pop → push". Recognizes context-free
                languages.
              </Section>
              <Section title="TM — Turing Machine">
                A finite automaton plus an unbounded tape with a head that reads, writes, and moves left/right —
                transitions are labeled "read → write, direction". The most expressive model here.
              </Section>
              <Section title="Regular expressions">
                Shorthand for regular languages (the same expressive power as DFA/NFA). This app supports literals,
                concatenation, <code>|</code> (union), <code>*</code>, <code>+</code>, <code>?</code>, character classes{' '}
                <code>[a-z]</code>/<code>[abc]</code>/<code>[^a]</code>, and <code>.</code> as a wildcard.
              </Section>
              <Section title="CFG — Context-Free Grammar">
                Production rules that generate strings, strictly more expressive than regular languages. The Grammars
                workspace supports CYK membership testing, CNF/GNF normal-form conversion, and LL(1)/SLR(1) parsing
                tables.
              </Section>
            </>
          )}

          {tab === 'formats' && (
            <>
              <Section title=".project — Autometa's native format">
                The app's own save format: automaton type, every state/transition with canvas positions, the alphabet,
                and any saved test suites. Portable between the web and desktop builds. Export/Import from the Editor's
                toolbar.
              </Section>
              <Section title=".jff — JFLAP interoperability">
                Imports/exports the XML format used by JFLAP, a widely used academic automata tool. DFA and NFA both
                import as NFA (JFLAP's format doesn't distinguish determinism — NFA simulation still handles a
                deterministic machine correctly). PDA and Turing machine support covers the common case of
                single-character stack/tape symbols. Moore machines can't be exported to JFLAP, which has no per-state
                output format.
              </Section>
              <Section title=".share.json — Share packages">
                Exported from the Project Library's "Share" button: a self-contained bundle of a project plus its saved
                version history, for handing to someone else without a hosted server. Marking a share "read-only" tags
                the imported copy with a visible badge — it's a courtesy label, not an enforced lock.
              </Section>
            </>
          )}

          {tab === 'features' && (
            <>
              <Section title="Editor">
                Build and simulate automata on the canvas, watch step-by-step playback (including the PDA stack and TM
                tape), run deterministic transformations (NFA→DFA, DFA minimization, Regex→NFA, pumping lemma), and get
                AI grading against a target-language description. Press "N" to add a state without the mouse; Tab
                cycles focus between states and transitions.
              </Section>
              <Section title="Grammars">
                A dedicated grammar workspace supporting both Context-Free Grammars (CFGs) and Unrestricted (Type-0)
                rewriting grammars: rule editors, CYK parse testing, CNF/GNF conversion, left-recursion removal, left-factoring,
                FIRST/FOLLOW sets, SLR(1)/LL(1) parsing tables, and derivation and parse-tree step-by-step walkthroughs.
              </Section>
              <Section title="Compare & Combine (Operations)">
                Perform operations on automata such as Product Construction, Union, Intersection, and NFA Subset Conversion,
                and load the resulting machines directly back onto the Editor canvas.
              </Section>
              <Section title="General & Theme Settings">
                From the Settings modal, configure interface theme preferences: lock to Light Theme, Dark Theme, or follow
                your System Preference. The monochromatic dual-theme focuses all visual accents purely on graph states, paths,
                and active playback animations.
              </Section>
              <Section title="Lesson Builder">
                Generates a full lesson (slides, narration, an embedded diagram you can load into the Editor, a quiz, and
                a worksheet) from a topic and audience/difficulty preferences, using your configured AI provider.
              </Section>
              <Section title="Practice">
                Generate fresh exercises by automaton type, difficulty, and learning objective; get graded by behavior
                (exact language equivalence for DFA/NFA/Regex, sample-test comparison for CFG/PDA/TM) with a concrete
                counterexample when you're wrong. Track your progress, follow instructor-built lesson paths, and — for
                instructor profiles — author exercises/paths and view a gradebook.
              </Section>
              <Section title="Library">
                Save, tag, favor, and clone projects; keep named version snapshots you can restore; share a project (with
                its history) as a portable file.
              </Section>
              <Section title="Batch Mode">
                From the Editor sidebar: run a batch of hand-entered test strings, or auto-generate every string over an
                alphabet up to a chosen length, against the current automaton — then export the results as CSV or JSON.
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
