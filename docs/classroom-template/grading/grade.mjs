// Plain Node, zero npm dependencies — no `npm install` needed in student CI.
// Usage: node grade.mjs <solution-file> <automaton-type: DFA|NFA|PDA|TM> <input-string>
// Prints ACCEPT or REJECT and exits 0 either way; a mismatch with the
// expected output in autograding.json is what makes Classroom mark it failed.
import { readFileSync } from 'node:fs';
import {
  migrateAutomatonSchema,
  simulateDFA,
  simulateNFA,
  simulatePDA,
  simulateTuringMachine,
} from './simulation-engine.generated.mjs';

const [, , solutionPath, automatonType, inputString] = process.argv;

if (!solutionPath || !automatonType || inputString === undefined) {
  console.error('Usage: node grade.mjs <solution-file> <DFA|NFA|PDA|TM> <input-string>');
  process.exit(2);
}

const simulate = { DFA: simulateDFA, NFA: simulateNFA, PDA: simulatePDA, TM: simulateTuringMachine }[automatonType];
if (!simulate) {
  console.error(`Unknown automaton type "${automatonType}".`);
  process.exit(2);
}

const automaton = migrateAutomatonSchema(JSON.parse(readFileSync(solutionPath, 'utf8')));
const result = simulate(automaton, inputString);
console.log(result.accepted ? 'ACCEPT' : 'REJECT');
