import { useEffect, useState } from 'react';
import {
  BookOpen, FileDown, FileUp, Sparkles, AlertCircle, CheckCircle2, Volume2,
  ClipboardList, Workflow, Send, Plus, ArrowRight, Target, HelpCircle, Package, Layers, History
} from 'lucide-react';
import { Button } from '@autometa/ui';
import { MarkdownRenderer } from './MarkdownRenderer';
import { downloadFile } from '../utils/exportUtils';
import { formatRelativeTime, type SavedLesson } from '../utils/lessonHistory';
import { getLLMConfig } from '../utils/llmConfig';
import { ApiError, generateLessonRequest } from '../utils/apiClient';
import { useToast } from './ToastProvider';

export type AutomatonEngineType = 'DFA' | 'NFA' | 'Mealy' | 'Moore' | 'PDA' | 'TM';

export interface SlideDiagramNode {
  id: string;
  label: string;
  isStart: boolean;
  isAccept: boolean;
  x: number;
  y: number;
}

export interface SlideDiagramEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface SlideDiagram {
  type: AutomatonEngineType;
  nodes: SlideDiagramNode[];
  edges: SlideDiagramEdge[];
  exampleInput?: string;
}

interface Slide {
  title: string;
  markdown: string;
  narration?: string;
  diagram?: SlideDiagram;
  quizQuestion?: string;
  quizOptions?: string[];
  quizAnswer?: number;
}

interface WorksheetItem {
  question: string;
  answer?: string;
}

interface LessonBuilderProps {
  onLoadDiagram?: (diagram: SlideDiagram) => void;
  history?: SavedLesson[];
  onSaveLesson?: (lesson: LessonData) => void;
  lessonToLoad?: SavedLesson | null;
  onLessonConsumed?: () => void;
}

const SUGGESTED_PROMPTS = [
  "Teach DFA to first-year students",
  "Explain NFA to DFA conversion",
  "Introduce Pushdown Automata (PDA)",
  "Explain Turing Machines and the Church-Turing thesis"
];

const DIFFICULTY_LEVELS = ["Beginner", "Intermediate", "Advanced", "Professor"];
const DURATION_OPTIONS = ["15 minutes", "30 minutes", "45 minutes", "60 minutes", "90 minutes"];

interface GenerationOptions {
  topic: string;
  audience: string;
  duration: string;
  difficulty: string;
  teachingStyle: string;
  includeQuizzes: boolean;
  generateNarration: boolean;
}

const DEFAULT_OPTIONS: GenerationOptions = {
  topic: "",
  audience: "first-year Computer Science students",
  duration: "45 minutes",
  difficulty: "Beginner",
  teachingStyle: "Interactive with animations and real-life examples",
  includeQuizzes: true,
  generateNarration: true,
};

interface LessonData {
  topic: string;
  audience: string;
  duration?: string;
  difficulty?: string;
  teachingStyle?: string;
  learningObjectives: string[];
  slides: Slide[];
  summary: string;
  worksheet: WorksheetItem[];
}

const StatTile = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-black/40 border border-white/5 rounded-xl px-4 py-3 flex flex-col gap-1">
    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{label}</span>
    <span className="text-sm font-extrabold text-white truncate">{value}</span>
  </div>
);

const HistoryPanel = ({ history, onSelect }: { history: SavedLesson[]; onSelect: (lesson: SavedLesson) => void }) => {
  if (history.length === 0) return null;
  return (
    <div className="w-full flex flex-col gap-3 bg-white/5 p-5 rounded-2xl border border-white/5 shadow-md">
      <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-black flex items-center gap-1.5">
        <History className="w-3.5 h-3.5 text-[#8b5cf6]" /> <span>Past Lessons</span>
      </h3>
      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="text-left px-3.5 py-2.5 rounded-lg border border-white/5 bg-black/30 hover:border-[#00e5a3]/30 hover:bg-white/5 transition-all duration-300 cursor-pointer flex items-center justify-between gap-3 focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/20"
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-xs font-bold text-white truncate">{item.topic}</span>
              <span className="text-[10px] text-slate-400">
                {[item.difficulty, item.duration, `${item.slides.length} slides`].filter(Boolean).join(' • ')}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">{formatRelativeTime(item.savedAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const GenerationForm = ({
  options, onChange, onSubmit, isGenerating, submitLabel, autoFocus
}: {
  options: GenerationOptions;
  onChange: (next: GenerationOptions) => void;
  onSubmit: () => void;
  isGenerating: boolean;
  submitLabel: string;
  autoFocus?: boolean;
}) => (
  <form
    onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    className="w-full flex flex-col gap-3 bg-black/50 border border-white/10 rounded-2xl p-4 focus-within:border-[#00e5a3] transition-colors"
  >
    <input
      autoFocus={autoFocus}
      type="text"
      value={options.topic}
      onChange={(e) => onChange({ ...options, topic: e.target.value })}
      placeholder="e.g. Teach DFA to first-year Computer Science students"
      className="bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none border-b border-white/10 pb-2.5"
      aria-label="Computer science topic prompt"
    />
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
      <select
        value={options.duration}
        onChange={(e) => onChange({ ...options, duration: e.target.value })}
        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#00e5a3] cursor-pointer focus:ring-2 focus:ring-[#00e5a3]/20 transition-all"
        aria-label="Lesson duration"
      >
        {DURATION_OPTIONS.map((d) => <option className="bg-[#0b121e]" key={d} value={d}>{d}</option>)}
      </select>
      <select
        value={options.difficulty}
        onChange={(e) => onChange({ ...options, difficulty: e.target.value })}
        className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#00e5a3] cursor-pointer focus:ring-2 focus:ring-[#00e5a3]/20 transition-all"
        aria-label="Lesson difficulty level"
      >
        {DIFFICULTY_LEVELS.map((d) => <option className="bg-[#0b121e]" key={d} value={d}>{d}</option>)}
      </select>
      <input
        type="text"
        value={options.teachingStyle}
        onChange={(e) => onChange({ ...options, teachingStyle: e.target.value })}
        placeholder="Teaching style"
        className="col-span-2 md:col-span-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/20 transition-all"
        aria-label="Custom teaching style description"
      />
    </div>
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={options.includeQuizzes}
          onChange={(e) => onChange({ ...options, includeQuizzes: e.target.checked })}
          className="accent-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/30"
        />
        Include quizzes and practical exercises
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={options.generateNarration}
          onChange={(e) => onChange({ ...options, generateNarration: e.target.checked })}
          className="accent-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/30"
        />
        Generate narration for each slide
      </label>
      <Button type="submit" disabled={isGenerating || !options.topic} className="ml-auto flex items-center gap-1.5 !rounded-xl !bg-[#00e5a3] hover:opacity-90 !text-black !font-bold">
        {isGenerating ? "Generating..." : <>{submitLabel} <Send className="w-3.5 h-3.5" /></>}
      </Button>
    </div>
  </form>
);

export const LessonBuilder = ({ onLoadDiagram, history = [], onSaveLesson, lessonToLoad, onLessonConsumed }: LessonBuilderProps) => {
  const { showToast } = useToast();
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [options, setOptions] = useState<GenerationOptions>(DEFAULT_OPTIONS);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [loadingPhase, setLoadingPhase] = useState(0);
  const PHASES = [
    "Analyzing topic & planning learning objectives...",
    "Synthesizing slide deck structure & outlines...",
    "Generating deep-dive explanations & LaTeX math...",
    "Designing interactive quiz questions & feedback...",
    "Drafting detailed professor lecture narration...",
    "Structuring printable worksheet & summary..."
  ];

  useEffect(() => {
    if (!isGenerating) {
      setLoadingPhase(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingPhase(p => (p + 1) % PHASES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // A lesson picked from history (Dashboard or the panel below) arrives via this prop.
  useEffect(() => {
    if (!lessonToLoad) return;
    const { id: _id, savedAt: _savedAt, ...rest } = lessonToLoad;
    setLesson(rest);
    setSelectedAnswers({});
    setGenerationError(null);
    onLessonConsumed?.();
  }, [lessonToLoad]);

  const loadFromHistory = (item: SavedLesson) => {
    const { id: _id, savedAt: _savedAt, ...rest } = item;
    setLesson(rest);
    setSelectedAnswers({});
    setGenerationError(null);
  };

  const exportLesson = () => {
    if (!lesson) return;
    const payload = JSON.stringify({ version: "1.2", ...lesson }, null, 2);
    downloadFile(payload, 'autometa-lesson.lesson', 'application/json');
  };

  const downloadWorksheetAsMarkdown = () => {
    if (!lesson) return;
    let content = `# Worksheet: ${lesson.slides[0]?.title || lesson.topic}\n\n`;
    lesson.worksheet.forEach((item, idx) => {
      content += `## Question ${idx + 1}\n${item.question}\n\n`;
      if (item.answer) {
        content += `### Model Answer\n${item.answer}\n\n`;
      }
    });
    downloadFile(content, 'autometa-worksheet.md', 'text/markdown');
  };

  const importLesson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.slides) {
          const loaded: LessonData = {
            topic: parsed.topic ?? "",
            audience: parsed.audience ?? DEFAULT_OPTIONS.audience,
            duration: parsed.duration,
            difficulty: parsed.difficulty,
            teachingStyle: parsed.teachingStyle,
            learningObjectives: Array.isArray(parsed.learningObjectives) ? parsed.learningObjectives : [],
            slides: parsed.slides,
            summary: parsed.summary ?? "",
            worksheet: parsed.worksheet ?? [],
          };
          setLesson(loaded);
          setSelectedAnswers({});
          onSaveLesson?.(loaded);
        }
      } catch {
        showToast("Failed to parse .lesson file.", 'error');
      }
    };
    reader.readAsText(file);
  };

  const generateAILesson = async (opts: GenerationOptions) => {
    if (!opts.topic) return;
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const llmConfig = getLLMConfig();

      const result = await generateLessonRequest({
        topic: opts.topic,
        audience: opts.audience,
        duration: opts.duration,
        difficulty: opts.difficulty,
        teaching_style: opts.teachingStyle,
        include_quizzes: opts.includeQuizzes,
        generate_narration: opts.generateNarration,
        provider: llmConfig.provider,
        api_key: llmConfig.api_key,
        model: llmConfig.model,
        base_url: llmConfig.base_url
      });

      if (!Array.isArray(result.slides) || result.slides.length === 0) {
        setGenerationError("AI response did not include any slides.");
        return;
      }

      const generated: LessonData = {
        topic: result.topic ?? opts.topic,
        audience: result.audience ?? opts.audience,
        duration: result.duration ?? opts.duration,
        difficulty: result.difficulty ?? opts.difficulty,
        teachingStyle: result.teachingStyle ?? opts.teachingStyle,
        learningObjectives: Array.isArray(result.learningObjectives) ? result.learningObjectives : [],
        slides: result.slides,
        summary: result.summary ?? "",
        worksheet: Array.isArray(result.worksheet) ? result.worksheet : [],
      };
      setLesson(generated);
      setSelectedAnswers({});
      setOptions(DEFAULT_OPTIONS);
      onSaveLesson?.(generated);
    } catch (err) {
      setGenerationError(
        err instanceof ApiError
          ? err.message
          : "Error generating AI lesson. Verify the backend and Ollama are running."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const startNewLesson = () => {
    setLesson(null);
    setSelectedAnswers({});
    setGenerationError(null);
    setOptions(DEFAULT_OPTIONS);
  };

  // Chat-style empty state: no lesson generated yet
  if (!lesson) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 h-full select-none overflow-y-auto">
        <div className="p-4 bg-gradient-colorful rounded-2xl">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <div className="text-center flex flex-col gap-2 max-w-lg">
          <h2 className="text-2xl font-black text-white tracking-wide uppercase">AI Lesson Generator</h2>
          <p className="text-sm text-slate-400">
            Describe a computer science topic and AUTOMETA will draft slides, diagrams, simulations, quizzes, narrations, and worksheets.
          </p>
        </div>

        <div className="w-full max-w-xl">
          <GenerationForm
            options={options}
            onChange={setOptions}
            onSubmit={() => generateAILesson(options)}
            isGenerating={isGenerating}
            submitLabel="Generate Lesson"
            autoFocus
          />
        </div>

        <div className="flex flex-wrap gap-2 justify-center max-w-xl">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => generateAILesson({ ...options, topic: prompt })}
              disabled={isGenerating}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold border border-white/5 bg-[#0c1223]/40 text-slate-300 hover:text-white hover:border-[#00e5a3]/40 transition-colors cursor-pointer disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
            >
              {prompt}
            </button>
          ))}
        </div>

        {isGenerating && (
          <div className="w-full max-w-xl bg-[#0c1223]/50 border border-white/5 rounded-2xl p-6 flex flex-col gap-4 animate-pulse shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#00e5a3] to-[#8b5cf6] animate-spin shrink-0" />
              <span className="text-xs font-bold text-slate-300">AUTOMETA AI Engine</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse" />
              <div className="h-3 bg-white/5 rounded w-1/2 animate-pulse" />
            </div>
            <p className="text-[11px] font-medium text-slate-400 mt-2 font-mono flex items-center gap-1.5">
              <span className="text-[#00e5a3] animate-pulse">●</span> {PHASES[loadingPhase]}
            </p>
          </div>
        )}

        {generationError && (
          <div className="w-full max-w-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl px-4 py-3 text-xs flex items-start gap-3 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block mb-0.5">Generation Failed</span>
              <span>{generationError}</span>
            </div>
          </div>
        )}

        <label className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer transition-colors mt-2 focus-within:ring-2 focus-within:ring-[#00e5a3]/30 p-1 rounded">
          <FileUp className="w-3.5 h-3.5 text-[#00e5a3]" /> or import an existing .lesson file
          <input type="file" accept=".lesson" onChange={importLesson} className="hidden" />
        </label>

        {history.length > 0 && (
          <div className="w-full max-w-xl">
            <HistoryPanel history={history} onSelect={loadFromHistory} />
          </div>
        )}
      </div>
    );
  }

  const diagramCount = lesson.slides.filter((s) => s.diagram).length;
  const quizCount = lesson.slides.filter((s) => s.quizQuestion).length;
  const narrationCount = lesson.slides.filter((s) => s.narration).length;

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 h-full overflow-y-auto select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-100 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#00e5a3]" /> Lesson Builder
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportLesson} className="flex items-center gap-1.5 text-xs">
            <FileDown className="w-3.5 h-3.5" /> Export .lesson
          </Button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 glass-button text-slate-200 hover:text-white cursor-pointer">
            <FileUp className="w-3.5 h-3.5 text-slate-400" /> Import
            <input type="file" accept=".lesson" onChange={importLesson} className="hidden" />
          </label>
          <button
            onClick={startNewLesson}
            title="Start a new lesson"
            className="flex items-center gap-1 text-slate-400 hover:text-[#00e5a3] transition-colors cursor-pointer border-none bg-transparent p-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Prompt recap */}
      <div className="bg-white/5 p-5 rounded-2xl border border-white/5 flex flex-col gap-2 shadow-sm">
        <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Prompt</h3>
        <p className="text-sm text-slate-200">Teach {lesson.topic} to {lesson.audience}.</p>
        <ul className="flex flex-col gap-1 text-xs text-slate-400">
          {lesson.duration && <li>Duration: {lesson.duration}</li>}
          {lesson.difficulty && <li>Difficulty: {lesson.difficulty}</li>}
          {lesson.teachingStyle && <li>Teaching Style: {lesson.teachingStyle}.</li>}
          {quizCount > 0 && <li>Include quizzes and practical exercises.</li>}
          {narrationCount > 0 && <li>Generate narration for each slide.</li>}
        </ul>
      </div>

      {/* AI Output header */}
      <div className="flex items-center gap-2 text-[#00e5a3]">
        <CheckCircle2 className="w-5 h-5 animate-pulse" />
        <span className="text-xs font-black uppercase tracking-widest">Lesson Generated Successfully</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Topic" value={lesson.topic} />
        <StatTile label="Target Audience" value={lesson.audience} />
        {lesson.duration && <StatTile label="Duration" value={lesson.duration} />}
        {lesson.difficulty && <StatTile label="Difficulty" value={lesson.difficulty} />}
        <StatTile label="Learning Objectives" value={lesson.learningObjectives.length} />
        <StatTile label="Slides" value={lesson.slides.length} />
        <StatTile label="Diagrams" value={diagramCount} />
        <StatTile label="Quiz Questions" value={quizCount} />
        <StatTile label="Worksheet Items" value={lesson.worksheet.length} />
        <StatTile label="Narration" value={`${narrationCount}/${lesson.slides.length} slides`} />
      </div>

      {/* Learning Objectives */}
      {lesson.learningObjectives.length > 0 && (
        <div className="bg-white/5 p-5 rounded-2xl border border-white/5 flex flex-col gap-3 shadow-sm">
          <h3 className="text-[10px] uppercase tracking-widest text-[#00e5a3] font-black flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-[#00e5a3]" /> <span>Learning Objectives</span>
          </h3>
          <ol className="flex flex-col gap-1.5 list-decimal list-inside text-sm text-slate-200 leading-relaxed">
            {lesson.learningObjectives.map((obj, idx) => <li key={idx}>{obj}</li>)}
          </ol>
        </div>
      )}

      {/* Lesson Structure */}
      <div className="bg-white/5 p-5 rounded-2xl border border-white/5 flex flex-col gap-3 shadow-sm">
        <h3 className="text-[10px] uppercase tracking-widest text-[#00e5a3] font-black flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#00e5a3]" /> <span>Lesson Structure</span>
        </h3>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
          {lesson.slides.map((slide, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs font-bold text-slate-200">
                {idx + 1}. {slide.title}
              </span>
              {idx < lesson.slides.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Generated Slides */}
      <div className="flex flex-col gap-4">
        <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Generated Slides</h3>
        {lesson.slides.map((slide, idx) => (
          <div key={idx} className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-sm">
            <h2 className="text-base font-extrabold text-white tracking-wide border-b border-white/5 pb-3 flex items-center gap-2">
              <span className="text-[#00e5a3] font-mono">{idx + 1}.</span> {slide.title}
            </h2>
            <MarkdownRenderer text={slide.markdown} />

            {slide.narration && (
              <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
                <span className="text-[9px] uppercase tracking-widest text-[#00e5a3] font-black flex items-center gap-1.5">
                  <Volume2 className="w-3 h-3 text-[#00e5a3]" /> Narration
                </span>
                <p className="text-xs text-slate-300 italic leading-relaxed">{slide.narration}</p>
              </div>
            )}

            {slide.diagram && (
              <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                <span className="text-[9px] uppercase tracking-widest text-[#00e5a3] font-black flex items-center gap-1.5">
                  <Workflow className="w-3 h-3 text-[#00e5a3]" /> Automaton Diagram ({slide.diagram.type})
                </span>
                <p className="text-xs text-slate-400">
                  {slide.diagram.nodes.length} states, {slide.diagram.edges.length} transitions
                  {slide.diagram.exampleInput ? ` — example input "${slide.diagram.exampleInput}"` : ''}
                </p>
                <Button
                  onClick={() => onLoadDiagram?.(slide.diagram as SlideDiagram)}
                  disabled={!onLoadDiagram}
                  className="w-fit flex items-center gap-1.5 text-xs !bg-[#00e5a3] !text-black hover:opacity-90 transition-opacity !font-bold"
                >
                  <Workflow className="w-3.5 h-3.5" /> Load into Editor &amp; Animate
                </Button>
              </div>
            )}

            {slide.quizQuestion && (
              <div className="flex flex-col gap-3 border-t border-white/5 pt-3">
                <span className="text-[9px] uppercase tracking-widest text-[#8b5cf6] font-black flex items-center gap-1.5">
                  <HelpCircle className="w-3 h-3 text-[#8b5cf6]" /> Concept Check Quiz
                </span>
                <p className="text-sm text-white font-semibold">{slide.quizQuestion}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {slide.quizOptions?.map((opt, optIdx) => (
                    <button
                      key={optIdx}
                      onClick={() => setSelectedAnswers((prev) => ({ ...prev, [idx]: optIdx }))}
                      className={`text-left p-3.5 rounded-xl border text-xs font-bold transition-all duration-300 cursor-pointer bg-black/40 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/30 ${
                        selectedAnswers[idx] === optIdx
                          ? optIdx === slide.quizAnswer
                            ? 'border-green-500/50 bg-green-500/10 text-green-400 font-bold'
                            : 'border-red-500/50 bg-red-500/10 text-red-400 font-bold'
                          : 'border-white/5 text-slate-300 hover:border-[#8b5cf6]/30 hover:text-white'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {selectedAnswers[idx] !== undefined && (
                  <div className="flex items-center gap-2 text-xs font-bold mt-1">
                    {selectedAnswers[idx] === slide.quizAnswer ? (
                      <span className="text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 animate-bounce" /> Correct Answer! Great job.
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1 animate-shake">
                        <AlertCircle className="w-4 h-4" /> Try again! That is incorrect.
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lesson Summary */}
      {lesson.summary && (
        <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-3 shadow-sm">
          <h3 className="text-[10px] uppercase tracking-widest text-[#00e5a3] font-black flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-[#00e5a3]" /> <span>Lesson Summary</span>
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">{lesson.summary}</p>
        </div>
      )}

      {/* Worksheet */}
      {lesson.worksheet.length > 0 && (
        <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
            <h3 className="text-[10px] uppercase tracking-widest text-[#8b5cf6] font-black flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-[#8b5cf6]" /> <span>Worksheet</span>
            </h3>
            <button
              onClick={downloadWorksheetAsMarkdown}
              className="flex items-center gap-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded px-2.5 py-1 text-[10px] font-bold cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/30"
            >
              <FileDown className="w-3 h-3 text-[#8b5cf6]" /> Download MD
            </button>
          </div>
          <ol className="flex flex-col gap-3 list-decimal list-inside">
            {lesson.worksheet.map((item, idx) => (
              <li key={idx} className="text-sm text-slate-200 leading-relaxed">
                {item.question}
                {item.answer && (
                  <details className="mt-1.5 ml-4">
                    <summary className="text-xs text-[#00e5a3] cursor-pointer font-bold select-none hover:underline focus:outline-none">Show answer</summary>
                    <p className="text-xs text-slate-400 mt-1.5 bg-black/30 border border-white/5 p-3 rounded-lg leading-relaxed">{item.answer}</p>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Export Package */}
      <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-3 shadow-sm">
        <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-black flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-[#00e5a3]" /> <span>Export Package</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportLesson} className="flex items-center gap-1.5 text-xs">
            <FileDown className="w-3.5 h-3.5" /> autometa-lesson.lesson
          </Button>
          {lesson.worksheet.length > 0 && (
            <Button variant="secondary" onClick={downloadWorksheetAsMarkdown} className="flex items-center gap-1.5 text-xs">
              <FileDown className="w-3.5 h-3.5" /> autometa-worksheet.md
            </Button>
          )}
        </div>
      </div>

      {/* AI Lesson Generator Tool (chat-style follow-up) */}
      <div className="bg-[#0b121e] p-5 rounded-2xl border border-[#00e5a3]/10 flex flex-col gap-3 shadow-2xl">
        <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-[#00e5a3] animate-pulse" />
          <span>Generate Another Lesson</span>
        </div>
        <GenerationForm
          options={options}
          onChange={setOptions}
          onSubmit={() => generateAILesson(options)}
          isGenerating={isGenerating}
          submitLabel="Generate Slide Deck"
        />
        {generationError && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl px-4 py-3 text-xs flex items-start gap-3 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block mb-0.5">Generation Failed</span>
              <span>{generationError}</span>
            </div>
          </div>
        )}
      </div>

      <HistoryPanel history={history} onSelect={loadFromHistory} />
    </div>
  );
};
