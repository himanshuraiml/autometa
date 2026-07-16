import React, { useEffect, useState } from 'react';
import { GraduationCap, Sparkles, Plus, User, ListChecks } from 'lucide-react';
import { Button } from '@autometa/ui';
import { LEARNING_OBJECTIVES, generateExercise, wrapGrammar } from '@autometa/rule-engine';
import type { Difficulty, ExerciseAutomatonType, GeneratedExercise } from '@autometa/rule-engine';
import type { UseProfile } from '../hooks/useProfile';
import type { UseExercises } from '../hooks/useExercises';
import type { UseLessonPaths } from '../hooks/useLessonPaths';
import type { UsePractice } from '../hooks/usePractice';
import { getAttemptStats, listAttempts } from '../utils/apiClient';
import type { AttemptDTO, AttemptStats, ExerciseDTO, PathProgressDTO } from '../utils/apiClient';
import { PracticePanel } from './PracticePanel';

interface PracticeHubProps {
  profile: UseProfile;
  exercises: UseExercises;
  lessonPaths: UseLessonPaths;
  practice: UsePractice;
  onStartExercise: (exercise: ExerciseDTO) => void;
}

const AUTOMATON_TYPES: ExerciseAutomatonType[] = ['DFA', 'NFA', 'Regex', 'CFG', 'PDA', 'TM'];
const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const GRAPH_BASED_TYPES = new Set(['DFA', 'NFA', 'PDA', 'TM']);
type Tab = 'practice' | 'progress' | 'paths' | 'instructor' | 'gradebook';

const fieldInputClass =
  'bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white normal-case font-medium focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/40 w-full custom-scrollbar';

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
    {label}
    {children}
  </label>
);

const FilterSelect = ({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) => (
  <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
    {label}
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/40 normal-case font-medium"
    >
      {options.map(opt => (
        <option key={opt || '__any__'} value={opt}>
          {opt || placeholder || 'Any'}
        </option>
      ))}
    </select>
  </label>
);

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'text-emerald-300 bg-emerald-500/10',
  intermediate: 'text-amber-300 bg-amber-500/10',
  advanced: 'text-red-300 bg-red-500/10',
};

const ExerciseCard = ({ exercise, onStart }: { exercise: ExerciseDTO; onStart: () => void }) => (
  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col gap-2 hover:border-[#00e5a3]/30 transition-colors">
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 text-slate-300">
        {exercise.automaton_type}
      </span>
      <span
        className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
          DIFFICULTY_COLORS[exercise.difficulty] ?? 'text-slate-300 bg-white/5'
        }`}
      >
        {exercise.difficulty}
      </span>
    </div>
    <h3 className="text-sm font-bold text-white">{exercise.title}</h3>
    <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{exercise.description}</p>
    <div className="flex items-center justify-between mt-1">
      <span className="text-[10px] text-slate-500">{exercise.learning_objective}</span>
      <Button onClick={onStart} className="!bg-white/5 !text-[#00e5a3] !text-xs !py-1.5 !px-3">
        Start
      </Button>
    </div>
  </div>
);

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 flex flex-col gap-1">
    <span className="text-2xl font-black text-[#00e5a3]">{value}</span>
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
  </div>
);

interface ProfileBarProps {
  profile: UseProfile;
}

const ProfileBar = ({ profile }: ProfileBarProps) => {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'student' | 'instructor'>('student');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await profile.addProfile(name.trim(), role);
    setName('');
    setShowForm(false);
  };

  return (
    <div className="flex items-center gap-3">
      {profile.profiles.length > 0 && (
        <select
          value={profile.activeProfileId ?? ''}
          onChange={e => profile.setActiveProfileId(e.target.value ? Number(e.target.value) : null)}
          className="bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-white focus:outline-none"
          aria-label="Active profile"
        >
          <option value="">Select profile…</option>
          {profile.profiles.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.role})
            </option>
          ))}
        </select>
      )}
      <button
        onClick={() => setShowForm(s => !s)}
        className="text-xs text-slate-400 hover:text-white bg-transparent border-none cursor-pointer flex items-center gap-1"
      >
        <User className="w-3.5 h-3.5" /> New profile
      </button>
      {showForm && (
        <form onSubmit={handleCreate} className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-full px-3 py-1.5">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name"
            className="bg-transparent text-xs text-white focus:outline-none w-24"
            aria-label="New profile name"
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value as 'student' | 'instructor')}
            className="bg-transparent text-xs text-white focus:outline-none"
            aria-label="New profile role"
          >
            <option value="student">Student</option>
            <option value="instructor">Instructor</option>
          </select>
          <button type="submit" className="text-xs text-[#00e5a3] bg-transparent border-none cursor-pointer font-bold">
            Add
          </button>
        </form>
      )}
    </div>
  );
};

interface LessonPathsTabProps {
  lessonPaths: UseLessonPaths;
  exerciseList: ExerciseDTO[];
  profile: UseProfile;
  onStartExercise: (exercise: ExerciseDTO) => void;
  isInstructor: boolean;
}

const LessonPathsTab = ({ lessonPaths, exerciseList, profile, onStartExercise, isInstructor }: LessonPathsTabProps) => {
  const [expandedPathId, setExpandedPathId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [progressByPath, setProgressByPath] = useState<Record<number, PathProgressDTO | null>>({});

  const toggleExpand = async (pathId: number) => {
    if (expandedPathId === pathId) {
      setExpandedPathId(null);
      return;
    }
    setExpandedPathId(pathId);
    if (!lessonPaths.stepsByPath[pathId]) await lessonPaths.loadSteps(pathId);
    if (profile.activeProfileId !== null) {
      const progress = await lessonPaths.loadProgress(pathId, profile.activeProfileId);
      setProgressByPath(prev => ({ ...prev, [pathId]: progress }));
    }
  };

  const handleCreatePath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await lessonPaths.addPath(newTitle.trim(), newDescription.trim(), profile.activeProfileId ?? undefined);
    setNewTitle('');
    setNewDescription('');
  };

  const markStepComplete = async (pathId: number, stepIndex: number, totalSteps: number) => {
    if (profile.activeProfileId === null) return;
    const existing = progressByPath[pathId];
    const completed = new Set<number>(existing ? JSON.parse(existing.completed_steps_json) : []);
    completed.add(stepIndex);
    const nextIndex = Math.min(stepIndex + 1, totalSteps - 1);
    const updated = await lessonPaths.saveProgress(pathId, profile.activeProfileId, nextIndex, Array.from(completed));
    setProgressByPath(prev => ({ ...prev, [pathId]: updated }));
  };

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {isInstructor && (
        <form onSubmit={handleCreatePath} className="flex flex-wrap items-end gap-2 bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <div className="flex-1 min-w-[180px]">
            <Field label="Title">
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className={fieldInputClass} placeholder="e.g. Regular Languages 101" />
            </Field>
          </div>
          <div className="flex-[2] min-w-[240px]">
            <Field label="Description">
              <input
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className={fieldInputClass}
                placeholder="DFA -> NFA -> subset construction -> minimization -> regex"
              />
            </Field>
          </div>
          <Button type="submit" className="!bg-[#00e5a3] !text-black !font-bold flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Create Path
          </Button>
        </form>
      )}

      {lessonPaths.paths.length === 0 && <p className="text-xs text-slate-500">No lesson paths yet.</p>}

      {lessonPaths.paths.map(path => {
        const steps = lessonPaths.stepsByPath[path.id] ?? [];
        const progress = progressByPath[path.id];
        const completedSteps: number[] = progress ? JSON.parse(progress.completed_steps_json) : [];
        return (
          <div key={path.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            <button
              onClick={() => toggleExpand(path.id)}
              className="flex items-center justify-between bg-transparent border-none cursor-pointer text-left"
            >
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-[#00e5a3]" />
                  {path.title}
                </h3>
                <p className="text-xs text-slate-400">{path.description}</p>
              </div>
              {steps.length > 0 && (
                <span className="text-[10px] text-slate-500 shrink-0">
                  {completedSteps.length}/{steps.length} complete
                </span>
              )}
            </button>

            {expandedPathId === path.id && (
              <ol className="flex flex-col gap-2 border-t border-white/5 pt-3">
                {steps.map((step, idx) => {
                  const linkedExercise = step.exercise_id ? exerciseList.find(e => e.id === step.exercise_id) : undefined;
                  const done = completedSteps.includes(idx);
                  return (
                    <li key={step.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className={done ? 'text-emerald-300 line-through' : 'text-slate-200'}>
                        {idx + 1}. {step.title}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {linkedExercise && (
                          <button
                            onClick={() => onStartExercise(linkedExercise)}
                            className="text-[#00e5a3] bg-transparent border-none cursor-pointer underline"
                          >
                            Practice
                          </button>
                        )}
                        {!done && (
                          <button
                            onClick={() => markStepComplete(path.id, idx, steps.length)}
                            className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer"
                          >
                            Mark done
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {steps.length === 0 && <p className="text-xs text-slate-500">No steps yet.</p>}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface InstructorStudioProps {
  exercises: UseExercises;
  profile: UseProfile;
  type: ExerciseAutomatonType;
  difficulty: Difficulty;
  objective: string;
}

const InstructorStudio = ({ exercises, profile, type, difficulty, objective }: InstructorStudioProps) => {
  const [draft, setDraft] = useState<GeneratedExercise | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hintsText, setHintsText] = useState('');
  const [rubric, setRubric] = useState('');
  const [deadline, setDeadline] = useState('');
  const [maxAttempts, setMaxAttempts] = useState('');

  const handleGenerateDraft = () => {
    const generated = generateExercise(type, difficulty, objective || undefined);
    setDraft(generated);
    setTitle(generated.title);
    setDescription(generated.description);
    setHintsText(generated.hints.join('\n'));
    setRubric('');
    setDeadline('');
    setMaxAttempts('');
  };

  const handlePublish = async () => {
    if (!draft) return;
    await exercises.saveManualExercise({
      title,
      automaton_type: draft.automatonType,
      difficulty: draft.difficulty,
      learning_objective: draft.learningObjective,
      description,
      reference_nodes_json: draft.automaton ? JSON.stringify(draft.automaton.nodes) : undefined,
      reference_edges_json: draft.automaton ? JSON.stringify(draft.automaton.edges) : undefined,
      reference_regex: draft.regex,
      reference_rules_json: draft.rules ? JSON.stringify(wrapGrammar(draft.rules, draft.startSymbol ?? 'S')) : undefined,
      alphabet_json: JSON.stringify(draft.alphabet),
      sample_tests_json: JSON.stringify(draft.sampleTests),
      hints_json: JSON.stringify(hintsText.split('\n').map(h => h.trim()).filter(Boolean)),
      rubric: rubric || undefined,
      is_ai_generated: true,
      created_by: profile.activeProfileId ?? undefined,
      deadline: deadline || undefined,
      max_attempts: maxAttempts ? Number(maxAttempts) : undefined,
    });
    setDraft(null);
  };

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <p className="text-xs text-slate-400">
        Generate a fresh, provably-gradeable reference solution for the filters above, then customize its
        description, hints, rubric, deadline, and attempt limit before publishing it to the exercise library.
      </p>
      <Button onClick={handleGenerateDraft} className="!bg-white/5 !text-[#00e5a3] flex items-center gap-1.5 w-fit">
        <Sparkles className="w-4 h-4" /> Generate Draft
      </Button>

      {draft && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
          <Field label="Title">
            <input value={title} onChange={e => setTitle(e.target.value)} className={fieldInputClass} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={fieldInputClass} />
          </Field>
          <Field label="Hints (one per line)">
            <textarea value={hintsText} onChange={e => setHintsText(e.target.value)} rows={3} className={fieldInputClass} />
          </Field>
          <Field label="Rubric">
            <textarea
              value={rubric}
              onChange={e => setRubric(e.target.value)}
              rows={2}
              className={fieldInputClass}
              placeholder="Optional grading notes for other instructors"
            />
          </Field>
          <div className="flex gap-3">
            <Field label="Deadline">
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={fieldInputClass} />
            </Field>
            <Field label="Max attempts">
              <input type="number" min={1} value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)} className={fieldInputClass} />
            </Field>
          </div>
          <Button onClick={handlePublish} className="!bg-[#00e5a3] !text-black !font-bold w-fit">
            Publish Exercise
          </Button>
        </div>
      )}
    </div>
  );
};

interface GradebookTabProps {
  profile: UseProfile;
  exercises: ExerciseDTO[];
}

/** Phase 6 gradebook: every attempt across every student, for exercises this instructor authored. */
const GradebookTab = ({ profile, exercises }: GradebookTabProps) => {
  const [attempts, setAttempts] = useState<AttemptDTO[] | null>(null);

  useEffect(() => {
    listAttempts({ limit: 500 }).then(setAttempts).catch(() => setAttempts([]));
  }, []);

  const myExerciseIds = new Set(exercises.filter(e => e.created_by === profile.activeProfileId).map(e => e.id));
  const rows = (attempts ?? []).filter(a => myExerciseIds.size === 0 || myExerciseIds.has(a.exercise_id));
  const nameFor = (id: number) => profile.profiles.find(p => p.id === id)?.name ?? `#${id}`;
  const exerciseFor = (id: number) => exercises.find(e => e.id === id);

  if (attempts === null) return <p className="text-xs text-slate-500">Loading gradebook…</p>;

  return (
    <div className="max-w-4xl overflow-x-auto custom-scrollbar">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-left text-slate-400 uppercase text-[10px] font-black tracking-widest border-b border-white/10">
            <th className="py-2 pr-4">Student</th>
            <th className="py-2 pr-4">Exercise</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Score</th>
            <th className="py-2 pr-4">Result</th>
            <th className="py-2 pr-4">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(a => {
            const exercise = exerciseFor(a.exercise_id);
            return (
              <tr key={a.id} className="border-b border-white/5 text-slate-300">
                <td className="py-2 pr-4">{nameFor(a.profile_id)}</td>
                <td className="py-2 pr-4">{exercise?.title ?? `#${a.exercise_id}`}</td>
                <td className="py-2 pr-4">{exercise?.automaton_type ?? '—'}</td>
                <td className="py-2 pr-4">{Math.round(a.score * 100)}%</td>
                <td className="py-2 pr-4">
                  <span className={a.passed ? 'text-emerald-300' : 'text-red-300'}>{a.passed ? 'Passed' : 'Failed'}</span>
                </td>
                <td className="py-2 pr-4 text-slate-500">{new Date(a.created_at).toLocaleString()}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-slate-500">
                No attempts yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

/** Phase 5 hub: practice/generate exercises, track progress, follow lesson paths, and (for instructors) author content. */
export const PracticeHub = ({ profile, exercises, lessonPaths, practice, onStartExercise }: PracticeHubProps) => {
  const [tab, setTab] = useState<Tab>('practice');
  const [type, setType] = useState<ExerciseAutomatonType>('DFA');
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [objective, setObjective] = useState('');
  const [stats, setStats] = useState<AttemptStats | null>(null);

  useEffect(() => {
    exercises.refresh();
    lessonPaths.refresh();
    // Intentionally run once on mount — refresh/addPath etc. are stable useCallbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile.activeProfileId === null) {
      setStats(null);
      return;
    }
    getAttemptStats(profile.activeProfileId)
      .then(setStats)
      .catch(() => setStats(null));
  }, [profile.activeProfileId, practice.lastResult]);

  const isInstructor = profile.activeProfile?.role === 'instructor';
  const objectives = LEARNING_OBJECTIVES[type];

  const filteredExercises = exercises.exercises.filter(
    e => e.automaton_type === type && e.difficulty === difficulty && (!objective || e.learning_objective === objective)
  );

  const handleGenerate = async () => {
    await exercises.generateAndSave(type, difficulty, objective || undefined, profile.activeProfileId ?? undefined);
  };

  const inlinePracticeActive = practice.activeExercise && !GRAPH_BASED_TYPES.has(practice.activeExercise.automaton_type);

  const tabs: Tab[] = ['practice', 'progress', 'paths', ...(isInstructor ? (['instructor', 'gradebook'] as Tab[]) : [])];
  const tabLabels: Record<Tab, string> = {
    practice: 'Practice',
    progress: 'My Progress',
    paths: 'Lesson Paths',
    instructor: 'Instructor Studio',
    gradebook: 'Gradebook',
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#050811]">
      <header className="h-16 w-full bg-[#050811] flex items-center justify-between px-8 border-b border-white/10 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-5 h-5 text-[#00e5a3]" />
          <span className="text-sm font-black uppercase tracking-widest text-slate-100">Practice</span>
        </div>
        <ProfileBar profile={profile} />
      </header>

      <nav className="flex items-center gap-1 px-8 pt-4 border-b border-white/5 shrink-0" role="tablist" aria-label="Practice sections">
        {tabs.map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg border-none cursor-pointer ${
              tab === t ? 'bg-white/5 text-[#00e5a3]' : 'text-slate-400 hover:text-white bg-transparent'
            }`}
          >
            {tabLabels[t]}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex flex-col gap-6">
        {!profile.activeProfile && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 w-fit">
            Pick or create a profile above to track progress and attempts.
          </p>
        )}

        {tab === 'practice' && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <FilterSelect
                label="Type"
                value={type}
                onChange={v => {
                  setType(v as ExerciseAutomatonType);
                  setObjective('');
                }}
                options={AUTOMATON_TYPES}
              />
              <FilterSelect label="Difficulty" value={difficulty} onChange={v => setDifficulty(v as Difficulty)} options={DIFFICULTIES} />
              <FilterSelect label="Objective" value={objective} onChange={setObjective} options={['', ...objectives]} placeholder="Any" />
              <Button onClick={handleGenerate} className="!bg-[#00e5a3] !text-black !font-bold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> Generate New Exercise
              </Button>
            </div>

            {inlinePracticeActive ? (
              <PracticePanel practice={practice} onExit={practice.clearExercise} variant="inline" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredExercises.length === 0 && (
                  <p className="text-xs text-slate-500 col-span-full">No exercises yet for this filter — generate one above.</p>
                )}
                {filteredExercises.map(ex => (
                  <ExerciseCard key={ex.id} exercise={ex} onStart={() => onStartExercise(ex)} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'progress' && (
          <div className="grid grid-cols-3 gap-4 max-w-2xl">
            <StatCard label="Attempts" value={stats?.attempts_total ?? 0} />
            <StatCard label="Exercises tried" value={stats?.exercises_attempted ?? 0} />
            <StatCard label="Exercises passed" value={stats?.exercises_passed ?? 0} />
          </div>
        )}

        {tab === 'paths' && (
          <LessonPathsTab
            lessonPaths={lessonPaths}
            exerciseList={exercises.exercises}
            profile={profile}
            onStartExercise={onStartExercise}
            isInstructor={!!isInstructor}
          />
        )}

        {tab === 'instructor' && isInstructor && (
          <InstructorStudio exercises={exercises} profile={profile} type={type} difficulty={difficulty} objective={objective} />
        )}

        {tab === 'gradebook' && isInstructor && <GradebookTab profile={profile} exercises={exercises.exercises} />}
      </div>
    </div>
  );
};
