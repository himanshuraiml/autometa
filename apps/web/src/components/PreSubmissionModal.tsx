import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { Button } from '@autometa/ui';
import { runBatchTests } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';
import type { TaskAssignment } from '@autometa/github-service';
import type { AutomatonType } from '../utils/flowAutomaton';
import { validateAssignmentSubmission } from '../utils/assignmentValidation';

interface PreSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: TaskAssignment | null;
  getAutomatonData: () => Automaton;
  automatonType: AutomatonType;
  onSubmit: () => Promise<void>;
}

/**
 * Runs the same test cases the CI grader will run — via
 * @autometa/simulation-engine's runBatchTests, the identical function used
 * for the Simulation tab's batch mode — so a failing submission is caught
 * here instead of burning a GitHub Actions run.
 */
export const PreSubmissionModal = ({ isOpen, onClose, assignment, getAutomatonData, automatonType, onSubmit }: PreSubmissionModalProps) => {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const check = useMemo(() => {
    if (!isOpen || !assignment) return null;
    const automaton = getAutomatonData();
    const structuralIssues = validateAssignmentSubmission(automaton, automatonType, assignment.frontmatter);
    const results = runBatchTests(
      automaton,
      assignment.frontmatter.type,
      assignment.frontmatter.test_cases.map((tc) => tc.input)
    );
    const rows = assignment.frontmatter.test_cases.map((tc, i) => ({
      ...tc,
      actual: results[i]?.accepted ?? false,
      pass: (results[i]?.accepted ?? false) === tc.expected,
    }));
    return { structuralIssues, rows, passCount: rows.filter((r) => r.pass).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, assignment, automatonType]);

  if (!isOpen || !assignment || !check) return null;

  const canSubmit = check.structuralIssues.length === 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit to GitHub.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b1220] border border-white/5 max-w-lg w-full rounded-2xl p-6 flex flex-col gap-5 shadow-2xl" role="dialog" aria-label="Review before submitting">
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <h3 className="font-extrabold text-sm tracking-widest text-slate-100 uppercase">Review Before Submitting</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white bg-transparent border-none cursor-pointer text-sm">
            CLOSE
          </button>
        </div>

        {check.structuralIssues.length > 0 && (
          <div className="flex flex-col gap-1.5 bg-[var(--color-rose,#f43f5e)]/10 border border-[var(--color-rose,#f43f5e)]/20 rounded-lg p-3">
            {check.structuralIssues.map((issue, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-[var(--color-rose,#f43f5e)]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {issue}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase">
            Test Cases: {check.passCount}/{check.rows.length} passing
          </span>
          <div className="max-h-56 overflow-y-auto custom-scrollbar border border-white/5 rounded-lg flex flex-col bg-black/20">
            {check.rows.map((row, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/5 last:border-b-0 text-xs">
                <span className="font-mono text-slate-300 truncate">{row.label ?? `"${row.input}"`}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {row.pass ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#00e5a3]" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-[var(--color-rose,#f43f5e)]" />
                  )}
                  <span className="text-slate-500">expected {row.expected ? 'accept' : 'reject'}, got {row.actual ? 'accept' : 'reject'}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {submitError && <p className="text-xs text-[var(--color-rose,#f43f5e)]">{submitError}</p>}

        <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="flex items-center justify-center gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? 'Submitting…' : 'Submit to GitHub'}
        </Button>
      </div>
    </div>
  );
};
