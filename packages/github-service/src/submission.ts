import { stampAutomatonSchema } from '@autometa/simulation-engine';
import type { Automaton } from '@autometa/simulation-engine';

export const SOLUTION_FILE_NAME = 'solution.autometa';

/**
 * Serializes a canvas automaton the same way a saved project is serialized
 * (via stampAutomatonSchema), so a submitted solution.autometa round-trips
 * through migrateAutomatonSchema exactly like any other saved automaton.
 */
export const buildSolutionFileContent = (automaton: Automaton): string =>
  JSON.stringify(stampAutomatonSchema(automaton), null, 2);
