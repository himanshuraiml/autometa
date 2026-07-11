import { useState } from 'react';
import { BookOpen, FileDown, FileUp, Sparkles, AlertCircle, CheckCircle2, Volume2, ClipboardList, Workflow, Send, Plus } from 'lucide-react';
import { Button } from '@autometa/ui';
import { MarkdownRenderer } from './MarkdownRenderer';
import { downloadFile } from '../utils/exportUtils';

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
}

const SUGGESTED_PROMPTS = [
  "Teach DFA to first-year students",
  "Explain NFA to DFA conversion",
  "Introduce Pushdown Automata (PDA)",
  "Explain Turing Machines and the Church-Turing thesis"
];

export const LessonBuilder = ({ onLoadDiagram }: LessonBuilderProps) => {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [summary, setSummary] = useState("");
  const [worksheet, setWorksheet] = useState<WorksheetItem[]>([]);

  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const currentSlide = slides[activeSlideIdx];

  const exportLesson = () => {
    const payload = JSON.stringify({ version: "1.1", slides, summary, worksheet }, null, 2);
    downloadFile(payload, 'autometa-lesson.lesson', 'application/json');
  };

  const downloadWorksheetAsMarkdown = () => {
    let content = `# Worksheet: ${slides[0]?.title || "Automata Lesson"}\n\n`;
    worksheet.forEach((item, idx) => {
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
          setSlides(parsed.slides);
          setSummary(parsed.summary ?? "");
          setWorksheet(parsed.worksheet ?? []);
          setActiveSlideIdx(0);
          setSelectedAnswer(null);
        }
      } catch (err) {
        alert("Failed to parse .lesson file.");
      }
    };
    reader.readAsText(file);
  };

  const generateAILesson = async (topic: string) => {
    if (!topic) return;
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const provider = localStorage.getItem('autometa_api_provider') || 'Ollama';
      let apiKey = '';
      if (provider === 'Gemini') apiKey = localStorage.getItem('autometa_gemini_key') || '';
      else if (provider === 'OpenAI') apiKey = localStorage.getItem('autometa_openai_key') || '';
      else if (provider === 'Groq') apiKey = localStorage.getItem('autometa_groq_key') || '';

      const response = await fetch("http://localhost:8000/api/tutor/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          audience: "first-year students",
          provider,
          api_key: apiKey
        })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        setGenerationError(errBody?.detail || `Lesson generation failed (HTTP ${response.status}). Verify the backend and Ollama are running.`);
        return;
      }

      const lesson = await response.json();
      if (!Array.isArray(lesson.slides) || lesson.slides.length === 0) {
        setGenerationError("AI response did not include any slides.");
        return;
      }

      setSlides(lesson.slides);
      setSummary(lesson.summary ?? "");
      setWorksheet(Array.isArray(lesson.worksheet) ? lesson.worksheet : []);
      setActiveSlideIdx(0);
      setSelectedAnswer(null);
      setAiPrompt("");
    } catch (err) {
      setGenerationError("Error generating AI lesson. Verify backend is running.");
    } finally {
      setIsGenerating(false);
    }
  };

  const startNewLesson = () => {
    setSlides([]);
    setSummary("");
    setWorksheet([]);
    setActiveSlideIdx(0);
    setSelectedAnswer(null);
    setGenerationError(null);
    setAiPrompt("");
  };

  // Chat-style empty state: no lesson generated yet
  if (slides.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 h-full select-none">
        <div className="p-4 bg-gradient-to-br from-[#00f0ff] to-[#ff007f] rounded-2xl shadow-glow-blue animate-pulse">
          <Sparkles className="w-8 h-8 text-black" />
        </div>
        <div className="text-center flex flex-col gap-2 max-w-lg">
          <h2 className="text-2xl font-extrabold text-white tracking-wide">AI Lesson Generator</h2>
          <p className="text-sm text-gray-400">
            Describe a computer science topic and AUTOMETA will draft slides, diagrams, animations, a quiz, narration, a summary, and a worksheet.
          </p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); generateAILesson(aiPrompt); }}
          className="w-full max-w-xl flex items-center gap-2 bg-black/50 border border-white/10 rounded-2xl p-2 pl-4 focus-within:border-[#00f0ff] transition-colors shadow-2xl"
        >
          <input
            autoFocus
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g. Teach DFA to first-year students"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <Button type="submit" disabled={isGenerating || !aiPrompt} className="flex items-center gap-1.5 !rounded-xl">
            {isGenerating ? "Generating..." : <Send className="w-4 h-4" />}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2 justify-center max-w-xl">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => generateAILesson(prompt)}
              disabled={isGenerating}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-[#00f0ff]/40 transition-colors cursor-pointer disabled:opacity-40"
            >
              {prompt}
            </button>
          ))}
        </div>

        {isGenerating && (
          <p className="text-[11px] text-gray-500 animate-pulse">Thinking... local models can take a minute to draft a full lesson.</p>
        )}
        {generationError && (
          <p className="text-[11px] text-red-400 flex items-center gap-1.5 max-w-xl text-center">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {generationError}
          </p>
        )}

        <label className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 cursor-pointer transition-colors mt-2">
          <FileUp className="w-3.5 h-3.5" /> or import an existing .lesson file
          <input type="file" accept=".lesson" onChange={importLesson} className="hidden" />
        </label>
      </div>
    );
  }

  return (
    <div className="flex-1 flex gap-6 p-6 h-full overflow-hidden select-none">
      {/* Sidebar: Slides Index */}
      <div className="w-64 flex flex-col gap-3 border-r border-white/10 pr-6 h-full overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xs uppercase tracking-widest text-gray-400">Lesson Slides</h3>
          <button
            onClick={startNewLesson}
            title="Start a new lesson"
            className="text-gray-400 hover:text-[#00f0ff] transition-colors cursor-pointer border-none bg-transparent p-0.5"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {slides.map((slide, idx) => (
            <button
              key={idx}
              onClick={() => { setActiveSlideIdx(idx); setSelectedAnswer(null); }}
              className={`text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
                idx === activeSlideIdx
                  ? 'bg-gradient-to-r from-[#00f0ff]/10 to-[#0072ff]/5 text-[#00f0ff] border border-[#00f0ff]/30 shadow-glow-blue/5 font-extrabold'
                  : 'text-gray-400 hover:text-white bg-white/2 hover:bg-white/5 border border-transparent'
              }`}
            >
              {idx + 1}. {slide.title}
            </button>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-4 border-t border-white/5">
          <Button variant="secondary" onClick={exportLesson} className="flex items-center gap-1.5 text-xs w-full">
            <FileDown className="w-3.5 h-3.5" /> Export .lesson
          </Button>
          <label className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200 glass-button text-gray-200 hover:text-white cursor-pointer w-full text-center">
            <FileUp className="w-3.5 h-3.5 text-gray-400" /> Import .lesson
            <input type="file" accept=".lesson" onChange={importLesson} className="hidden" />
          </label>
        </div>
      </div>

      {/* Main Slide Panel */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2">
        <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
          <h2 className="text-xl font-extrabold text-white tracking-wide border-b border-white/10 pb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#00f0ff]" /> {currentSlide.title}
          </h2>
          <MarkdownRenderer text={currentSlide.markdown} />
        </div>

        {/* Narration */}
        {currentSlide.narration && (
          <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-3">
            <h3 className="text-xs uppercase tracking-widest text-[#00f0ff] font-black flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> <span>Narration Script</span>
            </h3>
            <p className="text-sm text-gray-300 italic leading-relaxed">{currentSlide.narration}</p>
          </div>
        )}

        {/* Diagram */}
        {currentSlide.diagram && (
          <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-3">
            <h3 className="text-xs uppercase tracking-widest text-[#00f0ff] font-black flex items-center gap-1.5">
              <Workflow className="w-3.5 h-3.5" /> <span>Automaton Diagram ({currentSlide.diagram.type})</span>
            </h3>
            <p className="text-xs text-gray-400">
              {currentSlide.diagram.nodes.length} states, {currentSlide.diagram.edges.length} transitions
              {currentSlide.diagram.exampleInput ? ` — example input "${currentSlide.diagram.exampleInput}"` : ''}
            </p>
            <Button
              onClick={() => onLoadDiagram?.(currentSlide.diagram as SlideDiagram)}
              disabled={!onLoadDiagram}
              className="w-fit flex items-center gap-1.5 text-xs"
            >
              <Workflow className="w-3.5 h-3.5" /> Load into Editor &amp; Animate
            </Button>
          </div>
        )}

        {/* Quiz Widget */}
        {currentSlide.quizQuestion && (
          <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <h3 className="text-xs uppercase tracking-widest text-[#ff007f] font-black flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[#ff007f] rounded-full animate-ping" />
              <span>Concept Check Quiz</span>
            </h3>
            <p className="text-sm text-white font-bold">{currentSlide.quizQuestion}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentSlide.quizOptions?.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedAnswer(idx)}
                  className={`text-left p-3.5 rounded-xl border text-xs font-bold transition-all cursor-pointer bg-black/40 ${
                    selectedAnswer === idx
                      ? idx === currentSlide.quizAnswer
                        ? 'border-green-500/50 bg-green-500/10 text-green-400'
                        : 'border-red-500/50 bg-red-500/10 text-red-400'
                      : 'border-white/5 text-gray-300 hover:border-white/15 hover:text-white'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>

            {selectedAnswer !== null && (
              <div className="flex items-center gap-2 text-xs font-bold">
                {selectedAnswer === currentSlide.quizAnswer ? (
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Correct Answer! Great job.
                  </span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> Try again! That is incorrect.
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Lesson Summary */}
        {summary && (
          <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-3">
            <h3 className="text-xs uppercase tracking-widest text-[#00f0ff] font-black flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> <span>Lesson Summary</span>
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed">{summary}</p>
          </div>
        )}

        {/* Worksheet */}
        {worksheet.length > 0 && (
          <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
              <h3 className="text-xs uppercase tracking-widest text-[#ff007f] font-black flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" /> <span>Worksheet</span>
              </h3>
              <button
                onClick={downloadWorksheetAsMarkdown}
                className="flex items-center gap-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded px-2.5 py-1 text-[10px] font-bold cursor-pointer transition-all"
              >
                <FileDown className="w-3 h-3 text-[#ff007f]" /> Download MD
              </button>
            </div>
            <ol className="flex flex-col gap-3 list-decimal list-inside">
              {worksheet.map((item, idx) => (
                <li key={idx} className="text-sm text-gray-200">
                  {item.question}
                  {item.answer && (
                    <details className="mt-1 ml-4">
                      <summary className="text-xs text-[#00f0ff] cursor-pointer font-bold">Show answer</summary>
                      <p className="text-xs text-gray-400 mt-1">{item.answer}</p>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* AI Lesson Generator Tool (chat-style follow-up) */}
        <div className="bg-[#0c101d] p-5 rounded-2xl border border-[#00f0ff]/10 flex flex-col gap-3 shadow-2xl mt-auto">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-[#00f0ff] animate-pulse" />
            <span>Generate Another Lesson</span>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); generateAILesson(aiPrompt); }}
            className="flex gap-2.5"
          >
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. Teach PDA stack properties..."
              className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#00f0ff] hover:border-white/20 transition-colors"
            />
            <Button type="submit" disabled={isGenerating || !aiPrompt}>
              {isGenerating ? "Generating..." : "Generate Slide Deck"}
            </Button>
          </form>
          {generationError && (
            <p className="text-[11px] text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {generationError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
