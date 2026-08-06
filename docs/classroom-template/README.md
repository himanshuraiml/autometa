# AUTOMETA Classroom grading template

Copy-paste kit for instructors who want AUTOMETA students to submit
`solution.autometa` (via the desktop app's GitHub integration) and have
GitHub Classroom autograde it — no custom CI runner, no separate gradebook:
grading and gradebook are entirely GitHub Classroom's native
`.github/classroom/autograding.json` feature.

## Why this exists

`grade.mjs` needs the same DFA/NFA/PDA/TM acceptance logic
`@autometa/simulation-engine` already implements, but that package is
private to the AUTOMETA monorepo and isn't published to npm — a student's
CI (running in a fresh clone of *your* template repo, not the AUTOMETA repo)
can't `npm install` it. `simulation-engine.generated.mjs` is a **vendored,
dependency-free build** of that package's source, so grading works with
zero `npm install` step in student CI. It's regenerated (never hand-edited)
via `bun run build:grading-template` from the AUTOMETA repo, and a test
(`packages/simulation-engine/src/__tests__/grading-template.test.ts`) fails
CI there if the vendored copy ever drifts from the real engine.

## Setup for your task repo template

1. Copy this whole `grading/` folder into your task repo template (the one
   students get their own copy of via GitHub Classroom).
2. Copy `grading/autograding.json.sample` to `.github/classroom/autograding.json`
   in that repo, and edit the `run`/`output` pairs to match your task's
   `test_cases` (see the frontmatter schema below) — one test entry per case.
3. Make sure the repo template has autograding enabled in GitHub Classroom's
   assignment settings (it reads `.github/classroom/autograding.json`
   automatically once present).
4. Keep the expected submission filename as `solution.autometa` — this is
   what the AUTOMETA desktop app commits (see `SOLUTION_FILE_NAME` in
   `packages/github-service/src/submission.ts`).

## Task README.md frontmatter

Your task repo's `README.md` needs a YAML frontmatter block the desktop app
parses to show constraints and pre-flight-test the student's automaton
before they submit:

```yaml
---
id: "autometa-task-dfa-odd-b"
title: "DFA for Strings with Odd Number of 'b's"
course: "CS301 - Automata & Formal Languages"
type: "DFA"
max_states: 4
allowed_alphabet: ["a", "b"]
starter_file: "starter.autometa"
test_cases:
  - input: "ab"
    expected: true
  - input: "abb"
    expected: false
---
```

`type` must be one of `DFA`, `NFA`, `PDA`, `TM`. Each `autograding.json`
test's `run` command should call `node grading/grade.mjs solution.autometa
<type> "<input>"` and expect `output: "ACCEPT"` or `"REJECT"` matching each
test case's `expected`.

## Regenerating the vendored engine

From the AUTOMETA repo root, after any change to
`packages/simulation-engine/src/index.ts`:

```
bun run build:grading-template
```
