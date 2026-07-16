import {
  Play, Pause, ChevronRight, ChevronLeft, CheckCircle2, Trash2, Video, VideoOff, Film
} from 'lucide-react';
import type { SimulationPlayback } from '../hooks/useSimulationPlayback';
import type { AutomatonType } from '../utils/flowAutomaton';

interface PlaybackBarProps {
  playback: SimulationPlayback;
  automatonType: AutomatonType;
  isRecording: boolean;
  isExportingGif: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onExportGif: () => void;
}

/** Renders the input string with the currently read character highlighted. */
const InputStringWithHead = ({ inputString, headIndex }: { inputString: string; headIndex: number }) => (
  <div className="flex items-center gap-1 font-mono text-xl tracking-widest bg-[var(--bg-primary)] px-4 py-2 rounded-lg border border-[var(--border-color)] select-none">
    {inputString.split('').map((char, idx) => {
      const isCurrentHead = idx === headIndex;
      return (
        <span
          key={idx}
          className={`px-1.5 py-0.5 rounded transition-all duration-300 ${
            isCurrentHead
              ? 'bg-[var(--color-blue)] text-[var(--bg-primary)] font-bold scale-110 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
              : idx < headIndex
                ? 'text-[var(--text-dim)] line-through'
                : 'text-[var(--text-main)]'
          }`}
        >
          {char}
        </span>
      );
    })}
    {inputString.length === 0 && <span className="text-[var(--text-muted)]">ε</span>}
    {headIndex >= inputString.length && (
      <span className="ml-1 px-1.5 py-0.5 rounded bg-[var(--color-blue)] text-[var(--bg-primary)] text-xs font-bold uppercase animate-pulse">
        EOF
      </span>
    )}
  </div>
);

/** Bottom simulation control panel: playback transport, recording, speed, verdict. */
export const PlaybackBar = ({
  playback, automatonType, isRecording, isExportingGif, onStartRecording, onStopRecording, onExportGif,
}: PlaybackBarProps) => {
  const {
    inputString, simulationEvents, simulationResult, currentStep,
    isPlaying, setIsPlaying, playbackSpeed, setPlaybackSpeed, stepForward, stepBackward,
  } = playback;

  if (simulationEvents.length === 0) return null;

  const activeEvent = simulationEvents[currentStep];
  const headIndex = activeEvent ? (activeEvent.symbolIndex ?? -1) : -1;

  return (
    <div className="h-24 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-between px-8 z-10 select-none shadow-sm text-[var(--text-main)]">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">Active Run</span>
        <InputStringWithHead inputString={inputString} headIndex={headIndex} />
        {(automatonType === 'Mealy' || automatonType === 'Moore') && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Transduced Output:</span>
            <span className="text-xs font-mono font-bold text-[var(--color-blue)] bg-[var(--bg-primary)] px-2 py-0.5 rounded border border-[var(--border-color)]">
              {simulationResult?.outputString || ""}
            </span>
          </div>
        )}
      </div>

      {/* Playback Button Group */}
      <div className="flex items-center gap-4">
        {isRecording ? (
          <button
            onClick={onStopRecording}
            className="p-2 rounded-lg bg-[var(--color-rose)] hover:opacity-90 text-white flex items-center justify-center gap-1.5 px-3 py-1.5 animate-pulse text-xs font-bold focus:outline-none"
            title="Stop Recording"
          >
            <VideoOff className="w-4 h-4" /> Stop Rec
          </button>
        ) : (
          <button
            onClick={onStartRecording}
            className="p-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-main)] flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold focus:outline-none"
            title="Record Simulation Video"
          >
            <Video className="w-4 h-4 text-[var(--text-muted)]" /> Record MP4/WebM
          </button>
        )}

        <button
          onClick={onExportGif}
          disabled={isExportingGif}
          className="p-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-main)] flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none"
          title="Export Simulation as GIF"
        >
          <Film className="w-4 h-4 text-[var(--text-muted)]" /> {isExportingGif ? 'Exporting GIF...' : 'Export GIF'}
        </button>

        <button
          onClick={stepBackward}
          disabled={currentStep <= 0}
          title="Previous step (←)"
          aria-label="Previous step"
          className="p-2 rounded-lg hover:bg-[var(--bg-panel-hover)] disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none"
        >
          <ChevronLeft className="w-6 h-6 text-[var(--text-main)]" />
        </button>

        {isPlaying ? (
          <button
            onClick={() => setIsPlaying(false)}
            title="Pause (Space)"
            aria-label="Pause"
            className="p-3 bg-[var(--color-ui-accent)] rounded-full text-[var(--bg-primary)] hover:scale-105 transition-all focus:outline-none"
          >
            <Pause className="w-6 h-6 fill-current text-[var(--bg-primary)]" />
          </button>
        ) : (
          <button
            onClick={() => setIsPlaying(true)}
            disabled={currentStep >= simulationEvents.length - 1}
            title="Play (Space)"
            aria-label="Play"
            className="p-3 bg-[var(--color-ui-accent)] rounded-full text-[var(--bg-primary)] hover:scale-105 transition-all disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none"
          >
            <Play className="w-6 h-6 fill-current text-[var(--bg-primary)]" />
          </button>
        )}

        <button
          onClick={stepForward}
          disabled={currentStep >= simulationEvents.length - 1}
          title="Next step (→)"
          aria-label="Next step"
          className="p-2 rounded-lg hover:bg-[var(--bg-panel-hover)] disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none"
        >
          <ChevronRight className="w-6 h-6 text-[var(--text-main)]" />
        </button>
      </div>

      {/* Simulation Verdict Status */}
      <div className="flex items-center gap-4">
        {/* Speed slider */}
        <div className="flex flex-col gap-1 mr-4">
          <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Playback Speed</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="200"
              max="2000"
              step="100"
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              aria-label="Playback speed"
              className="w-24 accent-[var(--color-ui-accent)]"
            />
            <span className="text-xs text-[var(--text-muted)] font-mono">{(playbackSpeed / 1000).toFixed(1)}s</span>
          </div>
        </div>

        {currentStep >= simulationEvents.length - 1 ? (
          simulationResult?.accepted ? (
            <div className="flex items-center gap-2 bg-[var(--color-emerald)]/15 border border-[var(--color-emerald)]/30 px-4 py-2 rounded-lg text-[var(--color-emerald)] font-bold text-sm animate-bounce" role="status">
              <CheckCircle2 className="w-5 h-5" /> ACCEPTED
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-[var(--color-rose)]/15 border border-[var(--color-rose)]/30 px-4 py-2 rounded-lg text-[var(--color-rose)] font-bold text-sm" role="status">
              <Trash2 className="w-5 h-5" /> REJECTED
            </div>
          )
        ) : (
          <div className="text-xs text-[var(--text-muted)] animate-pulse uppercase tracking-wider font-bold">
            Step {currentStep + 1} of {simulationEvents.length}
          </div>
        )}
      </div>
    </div>
  );
};
