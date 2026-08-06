import { isEpsilon } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';
import type { TaskFrontmatter } from '@autometa/github-service';
import type { AutomatonType } from './flowAutomaton';

/**
 * Local, instant structural checks against a task's constraints — run before
 * the student burns a CI grading run on GitHub. Behavioral checks (does it
 * actually accept/reject the right strings) go through
 * @autometa/simulation-engine's runBatchTests separately.
 */
export const validateAssignmentSubmission = (
  automaton: Automaton,
  automatonType: AutomatonType,
  frontmatter: TaskFrontmatter
): string[] => {
  const issues: string[] = [];

  if (automatonType !== frontmatter.type) {
    issues.push(`This task expects a ${frontmatter.type}, but the canvas is currently a ${automatonType}.`);
  }

  if (automaton.nodes.length > frontmatter.max_states) {
    issues.push(`Uses ${automaton.nodes.length} states, but this task allows at most ${frontmatter.max_states}.`);
  }

  const allowed = new Set(frontmatter.allowed_alphabet);
  const usedSymbols = new Set<string>();
  for (const edge of automaton.edges) {
    for (const symbol of edge.symbols) {
      if (!isEpsilon(symbol)) usedSymbols.add(symbol);
    }
  }
  const outside = [...usedSymbols].filter((s) => !allowed.has(s));
  if (outside.length > 0) {
    issues.push(
      `Uses symbol(s) outside the allowed alphabet {${frontmatter.allowed_alphabet.join(', ')}}: ${outside.join(', ')}.`
    );
  }

  return issues;
};
