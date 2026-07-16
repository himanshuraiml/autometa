import { Sparkles } from 'lucide-react';
import { Button } from '@autometa/ui';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useTutorChat } from '../hooks/useTutorChat';
import type { Automaton } from '@autometa/simulation-engine';
import type { AutomatonType } from '../utils/flowAutomaton';
import type { TutorMode } from '../hooks/useTutorChat';

interface TutorPanelProps {
  automatonType: AutomatonType;
  inputString: string;
  getAutomatonData: () => Automaton;
  /** Lifts the floating toggle above the playback bar when a run is active. */
  isPlaybackBarVisible: boolean;
}

/** Floating AI tutor toggle plus the slide-in chat drawer. */
export const TutorPanel = ({ automatonType, inputString, getAutomatonData, isPlaybackBarVisible }: TutorPanelProps) => {
  const {
    tutorMessages,
    tutorInput, setTutorInput,
    tutorMode, setTutorMode,
    isTutorLoading,
    isTutorOpen, setIsTutorOpen,
    askTutor,
    getSuggestedTutorPrompts,
  } = useTutorChat({ automatonType, inputString, getAutomatonData });

  return (
    <>
      {/* Floating AI Tutor Toggle Button */}
      <button
        onClick={() => setIsTutorOpen(!isTutorOpen)}
        className={`fixed right-6 z-30 p-4 bg-gradient-to-br from-[#00e5a3] to-[#8b5cf6] hover:scale-105 active:scale-95 transition-all rounded-full shadow-glow-green text-black font-extrabold flex items-center justify-center border-none cursor-pointer duration-300 ${
          isPlaybackBarVisible ? 'bottom-28' : 'bottom-6'
        }`}
        title="Toggle AI Tutor"
        aria-label={isTutorOpen ? 'Close AI Tutor' : 'Open AI Tutor'}
        aria-expanded={isTutorOpen}
      >
        <Sparkles className="w-6 h-6 animate-pulse" />
      </button>

      {/* AI Tutor Drawer Overlay */}
      {isTutorOpen && (
        <div
          className="fixed right-0 top-0 h-screen w-[420px] bg-[#0b1220] border-l border-white/5 shadow-2xl z-40 flex flex-col transition-all duration-300"
          role="dialog"
          aria-label="AI Tutor chat"
        >
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/30">
            <div className="flex items-center gap-2 text-[#00e5a3] font-bold">
              <Sparkles className="w-5 h-5 animate-spin text-[#00e5a3]" /> AI TUTOR PANEL
            </div>
            <button onClick={() => setIsTutorOpen(false)} className="text-slate-400 hover:text-white font-bold text-xs bg-transparent border-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30 rounded px-1">
              CLOSE
            </button>
          </div>

          {/* Mode Selector */}
          <div className="p-4 bg-white/2 border-b border-white/5 flex items-center justify-between text-xs">
            <span className="text-slate-400">Tutor Mode:</span>
            <select
              value={tutorMode}
              onChange={(e) => setTutorMode(e.target.value as TutorMode)}
              aria-label="Tutor mode"
              className="bg-black/60 border border-white/10 rounded px-2 py-1 text-[#00e5a3] focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/20 cursor-pointer"
            >
              <option className="bg-[#0b121e]" value="Beginner">Beginner (Analogies)</option>
              <option className="bg-[#0b121e]" value="Intermediate">Intermediate (Normal)</option>
              <option className="bg-[#0b121e]" value="Advanced">Advanced (Formulas)</option>
              <option className="bg-[#0b121e]" value="Professor">Professor (Rigorous)</option>
            </select>
          </div>

          {/* Message List */}
          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4" aria-live="polite">
            {tutorMessages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="text-[9px] text-slate-500 mb-1">
                  {msg.sender === 'user' ? 'You' : `Tutor (${tutorMode})`}
                </div>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.sender === 'user'
                    ? 'bg-[#8b5cf6]/10 text-slate-100 border border-[#8b5cf6]/20'
                    : 'bg-white/5 text-slate-200 border border-white/5'
                }`}>
                  {msg.sender === 'user' ? (
                    msg.text
                  ) : (
                    <MarkdownRenderer text={msg.text} />
                  )}
                </div>
              </div>
            ))}
            {isTutorLoading && (
              <div className="flex items-center gap-2 text-xs text-[#00e5a3] animate-pulse">
                <Sparkles className="w-4 h-4 animate-spin" /> AI Tutor is thinking...
              </div>
            )}
          </div>

          {/* Preset Helper Prompts - derived from the automaton currently on the canvas */}
          <div className="p-4 bg-white/2 border-t border-white/5 flex gap-2 flex-wrap">
            {getSuggestedTutorPrompts().map((prompt) => (
              <button
                key={prompt}
                onClick={() => askTutor(prompt)}
                className="text-[10px] bg-[#0c1223]/50 hover:bg-[#00e5a3]/10 border border-white/5 hover:border-[#00e5a3]/30 px-2.5 py-1.5 rounded-lg text-slate-300 cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <div className="p-4 border-t border-white/5 bg-black/20 flex gap-2">
            <input
              type="text"
              value={tutorInput}
              onChange={(e) => setTutorInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') askTutor(); }}
              placeholder="Ask the AI Tutor..."
              aria-label="Ask the AI Tutor"
              className="flex-1 bg-black/60 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#00e5a3] focus:ring-2 focus:ring-[#00e5a3]/20 transition-all"
            />
            <Button onClick={() => askTutor()} disabled={isTutorLoading} className="!bg-[#00e5a3] !text-black !font-bold">
              Ask
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
