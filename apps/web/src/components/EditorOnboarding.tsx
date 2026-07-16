import { useState } from 'react';
import {
  Plus, ArrowRightLeft, Pencil, Trash2, PlayCircle, Keyboard,
  ChevronRight, ChevronLeft, X
} from 'lucide-react';
import { Button } from '@autometa/ui';

interface EditorOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    icon: Plus,
    title: 'Add a State',
    body: "Double-click anywhere on the empty canvas to drop a new state there — or press \"N\" if you'd rather not use the mouse.",
  },
  {
    icon: ArrowRightLeft,
    title: 'Add a Transition',
    body: 'Drag from the edge of one state to another (or back onto itself for a self-loop) to connect them with a transition.',
  },
  {
    icon: Pencil,
    title: 'Edit a State',
    body: 'Click a state to select it. The Element Properties panel on the right lets you rename it and toggle it as a Start or Accept state.',
  },
  {
    icon: Pencil,
    title: 'Edit a Transition',
    body: "Click a transition to select it, then type its symbol(s) in the Element Properties panel. The expected format is shown there and depends on your automaton type — e.g. comma-separated symbols for DFA/NFA, input/output for Mealy, read,pop→push for PDA.",
  },
  {
    icon: Trash2,
    title: 'Delete Anything',
    body: 'Select a state or transition, then press Delete/Backspace (or the platform shortcut shown in its panel) — or just click the Delete button.',
  },
  {
    icon: PlayCircle,
    title: 'Run a Simulation',
    body: 'Type an input string in the Simulation Input panel and press Play to watch it animate through your automaton.',
  },
  {
    icon: Keyboard,
    title: 'Keyboard Shortcuts',
    body: 'Space toggles play/pause, and the ← → arrow keys step through the simulation one frame at a time.',
  },
];

export const EditorOnboarding = ({ isOpen, onClose }: EditorOnboardingProps) => {
  const [stepIndex, setStepIndex] = useState(0);

  if (!isOpen) return null;

  const step = STEPS[stepIndex];
  const Icon = step.icon;
  const isLastStep = stepIndex === STEPS.length - 1;

  const handleClose = () => {
    setStepIndex(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-[#0b121e] border border-white/5 rounded-2xl shadow-2xl animate-fade-in select-none flex flex-col overflow-hidden">
        <button
          onClick={handleClose}
          aria-label="Close tutorial"
          className="absolute top-4 right-4 text-slate-500 hover:text-white cursor-pointer border-none bg-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30 p-1"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#00e5a3]">
              Editor Basics
            </span>
            <span className="text-[10px] text-slate-500">
              {stepIndex + 1} / {STEPS.length}
            </span>
          </div>

          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="p-4 bg-gradient-to-br from-[#00e5a3] to-[#8b5cf6] rounded-2xl shadow-glow-green">
              <Icon className="w-7 h-7 text-black" />
            </div>
            <h3 className="text-lg font-extrabold text-white">{step.title}</h3>
            <p className="text-sm text-slate-300 leading-relaxed max-w-sm">{step.body}</p>
          </div>

          <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setStepIndex(idx)}
                aria-label={`Go to step ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all cursor-pointer border-none focus:outline-none focus:ring-2 focus:ring-[#00e5a3]/30 ${
                  idx === stepIndex ? 'w-5 bg-[#00e5a3]' : 'w-1.5 bg-white/15 hover:bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-4 border-t border-white/10">
          <button
            onClick={handleClose}
            className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer bg-transparent border-none rounded focus:outline-none focus:ring-1 focus:ring-[#00e5a3]/30"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="secondary" onClick={() => setStepIndex((i) => i - 1)} className="flex items-center gap-1 !px-3 !py-1.5 text-xs">
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </Button>
            )}
            {isLastStep ? (
              <Button onClick={handleClose} className="flex items-center gap-1 !px-4 !py-1.5 text-xs">
                Start Building
              </Button>
            ) : (
              <Button onClick={() => setStepIndex((i) => i + 1)} className="flex items-center gap-1 !px-4 !py-1.5 text-xs">
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
