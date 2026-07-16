import { Sparkles } from 'lucide-react';
import { Button } from '@autometa/ui';
import { MarkdownRenderer } from './MarkdownRenderer';

interface GradingReportModalProps {
  result: string | null;
  onClose: () => void;
}

/** Modal presenting the AI grading feedback report. */
export const GradingReportModal = ({ result, onClose }: GradingReportModalProps) => {
  if (!result) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#0b1220] border border-white/5 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar animate-fade-in" role="dialog" aria-label="AI grading report">
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#00e5a3]" />
            <h3 className="text-base font-bold tracking-wider uppercase text-[#00e5a3]">AI Grading Report</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer text-sm"
          >
            ✕ Close
          </button>
        </div>

        <div className="prose prose-invert text-sm leading-relaxed text-slate-300">
          <MarkdownRenderer text={result} />
        </div>

        <div className="flex justify-end mt-2 pt-3 border-t border-white/5">
          <Button onClick={onClose} className="!bg-[#00e5a3] !text-black !font-bold">Got It</Button>
        </div>
      </div>
    </div>
  );
};
