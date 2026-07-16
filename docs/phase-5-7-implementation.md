# Phase 5–7 Implementation Plan

Status legend: ⬜ not started · 🟨 in progress · ✅ complete

This doc is updated as each phase completes. It is the single source of truth
for scope decisions made along the way — read it before resuming work here in
a future session.

## Cross-cutting architectural decisions

- **Accounts model (decided 2026-07-14):** lightweight local profiles, not
  hosted multi-tenant auth. A `Profile` is just `{ name, role: student |
  instructor }` stored in the local SQLite DB — no passwords. This matches
  the app's existing local-first, per-install Python sidecar + single shared
  bearer token architecture. It scopes progress/authoring/gradebook data
  per-profile on one machine (or a LAN-shared instance); it is **not**
  network-level access control. Real hosted auth (password hashing, sessions,
  per-user data isolation, actual cloud hosting) is out of scope unless
  requested later — this design does not block adding it.
- **Automaton semantics stay client-side.** The Python backend has never
  implemented DFA/NFA/PDA/TM/CFG semantics (simulation, equivalence,
  parsing) — that all lives in the TypeScript `rule-engine` /
  `simulation-engine` packages and runs in the browser/Tauri webview. Phase
  5's semantic grading and exercise generation follow the same split: the
  backend only persists data and proxies LLM calls; grading correctness and
  exercise construction are computed in TypeScript.
- **No routing library exists.** New top-level surfaces are added as new
  `AppView` values (`NavSidebar.tsx`) + a lazy-loaded component branch in
  `App.tsx`, exactly like the existing `grammars`/`lessons` views.
- **New tables need no explicit migration entry.** `migrations.py` already
  calls `SQLModel.metadata.create_all(engine)` after applying numbered
  migrations, which picks up brand-new tables automatically. A numbered
  migration is only needed when altering an *existing* table.

---

## Phase 5 — Learning and assessment · Status: ✅ complete

### Data model (backend, `services/backend/models.py`)
New tables: `Profile`, `Exercise`, `Attempt`, `LessonPath`, `LessonPathStep`,
`PathProgress`. Exercises store a reference solution (nodes/edges for
FA/PDA/TM, a regex string, or CFG rules depending on `automaton_type`) plus a
`sample_tests` battery of `{input, expectedAccept}` computed once from that
reference solution when the exercise is created.

### Semantic grading (`packages/rule-engine/src/grading.ts`)
Grades by behavior, not diagram shape:
- **DFA/NFA/Regex:** exact language equivalence via the existing
  `findLanguageCounterexample` (regex is compiled to an NFA first via
  `regexToNfa`), giving a real minimal counterexample, not a sampled guess.
- **CFG:** `cykParse` run on both the reference and submitted grammars
  across the exercise's sample-test strings; first mismatch reported as the
  counterexample.
- **PDA/TM:** batch-simulated (`simulatePDA`/`simulateTuringMachine`) across
  the sample-test strings and diffed against expected accept/reject (exact
  equivalence isn't decidable/available for these).
- Every path returns a uniform `GradingResult { passed, score, counterexample,
  expected, actual, message }`.

### Exercise generator (`packages/rule-engine/src/exerciseGenerator.ts`)
Deterministic, parameterized "language families" per automaton type (extending
the pattern already used by `templates.ts`) generate a fresh reference
solution + description each time from a difficulty/objective pick and a
random seed — this keeps grading trustworthy (the reference is always a
valid, correct automaton/grammar, never LLM-hallucinated graph JSON). The
LLM (existing `ai.py` multi-provider plumbing, reused as-is) is optional and
only used to humanize the description text and add extra hints, with a
graceful fallback to the templated description if no LLM is reachable.

### Practice mode (frontend)
New `AppView = 'practice'` hub (browse/generate exercises, progress stats).
Starting an exercise switches to the existing graph/grammar canvas with a
`PracticePanel` overlay (prompt, progressive hint reveal, attempt counter,
Check Answer, score/counterexample feedback, retry/next) — the same
canvas-plus-overlay pattern already used for algorithm walkthroughs
(`TransformationPanel`), not a second editor.

### Lesson paths
`LessonPath` = ordered `LessonPathStep`s (topic milestone or exercise
reference), e.g. "DFA → NFA → subset construction → minimization → regex".
`PathProgress` tracks each profile's current step and completed steps.

### Instructor authoring
Visible when the active profile's role is `instructor`. Create/edit
exercises (metadata form + "design reference solution" on the normal
canvas/grammar editor) and lesson paths (ordered step list). Deadline and
max-attempt fields are enforced client-side in Practice Mode.

### Build checklist
- [x] Backend models + CRUD endpoints (profiles, exercises, attempts,
      lesson paths/steps, progress)
- [x] `grading.ts` + tests
- [x] `exerciseGenerator.ts` + tests
- [x] Frontend hooks (`useProfile`, `useExercises`, `usePractice`,
      `useLessonPaths`)
- [x] `PracticeHub`, `PracticePanel`, instructor authoring UI, lesson path UI
- [x] NavSidebar + App.tsx wiring
- [x] Typecheck / build / vitest / pytest all green

### Notes from manual testing
- `PracticePanel` initially replaced `EditorSidebar` in the graph editor's
  right-sidebar slot while a DFA/NFA/PDA/TM exercise was active, which hid
  the "Element Properties" editor needed to rename states and set
  transition symbols — practice mode was unusable for graph-based exercises.
  Fixed by making `PracticePanel` a floating, collapsible overlay
  (`top-4 right-4` inside the canvas wrapper) so `EditorSidebar` stays
  visible and editable at all times.

---

## Phase 6 — Projects, collaboration, and interoperability · Status: ✅ complete

### File interoperability
SVG/PNG/HTML/PDF export already existed (pre-dated this phase, confirmed in
`exportUtils.ts`/`EditorHeader.tsx`) and Autometa's own `.project` JSON format
already existed (`projectFormat.ts`) — so the only real gap was **JFLAP
`.jff` import/export**, implemented in `packages/rule-engine/src/jflap.ts`
(hand-rolled tag scanner, not `DOMParser`, since this package's tests run
under plain Node) plus a thin `apps/web/src/utils/jflapExport.ts` wrapper for
React Flow node/edge positions. Scope: `fa` (DFA/NFA — JFLAP doesn't
distinguish them, so import always yields NFA) is fully supported; `pda`/
`turing` support the common case of single-character stack/tape symbols;
`mealy` (input/output per transition) is supported; **Moore has no JFLAP
representation** (JFLAP has no per-state output format) and is rejected with
a clear error on export. Wired into `EditorHeader`'s Export-As menu and the
Import file input (`.project,.jff`, sniffed by extension). Printable
worksheets were already covered by `LessonBuilder`'s markdown export plus the
new PDF/Print diagram export.

### JSON sharing links
No hosted multi-tenant server exists (see the accounts decision above), so
"sharing links" became an export/import **share package**
(`apps/web/src/utils/shareFormat.ts`): a self-contained JSON file bundling a
project plus its saved version history, with a `readOnly` flag. Read-only is
**advisory, not a hard technical restriction** — importing a read-only
package tags the new local copy with `shared:read-only` (visible as a badge
in the Project Library) rather than disabling edits at the code level,
consistent with the local-first trust model.

### Project library
`Project` gained `tags_json`, `visibility` (private/public), `is_favorite`,
`owner_profile_id`, and `cloned_from_id` (backend). New `ProjectVersion`
table for explicit snapshots (`Save Version` button in `EditorHeader`, only
shown once a project has been saved to the DB). New `AppView = 'library'`
(`ProjectLibrary.tsx`) with My Projects / Public / Favorites tabs, per-project
tag editing, visibility toggle, favorite star, clone, share-package
export/import, version history (restore/delete), and a comment thread.

### Collaboration and accounts
New `Comment` table (profile + one of project/exercise/attempt) backs a
reusable `CommentThread` component used on both projects (Library) and could
extend to attempts. **Class assignments reuse Phase 5's `Exercise`/
`LessonPath`** (already carry `deadline`/`max_attempts`/`created_by`) rather
than adding a separate assignment/enrollment table — assigning work to
students is just sharing an exercise or lesson-path id, which the existing
Practice browse UI already supports; a dedicated enrollment model was judged
unnecessary scope for the local-first, single-shared-DB model. **Gradebook**
is a new tab in `PracticeHub`'s Instructor Studio: every attempt across every
profile, joined client-side against `exercises`/`profiles` already in memory
— no new backend endpoint needed beyond the existing unfiltered
`GET /api/attempts`.

### Batch mode
`apps/web/src/utils/batchSimulation.ts`: `runBatch` dispatches across all six
editor automaton types (DFA/NFA/PDA/TM → accept/reject via the simulation
engine; Mealy/Moore → output string, since they're transducers, not
recognizers) and `generateLanguageSamples` enumerates every string up to a
chosen length (capped at 1000 rows). New `BatchModeModal`, launched from a
button in `EditorSidebar`, runs either generated samples or pasted custom
inputs against the current canvas and exports CSV/JSON.

### Notable bugs found and fixed during this phase

**Missing migration for the new `Project` columns.** Restarting the real dev
backend against its actual local database (not a test DB) surfaced
`no such column: project.tags_json` — a genuine upgrade bug. New *tables*
(`ProjectVersion`, `Comment`, etc.) are auto-created by
`SQLModel.metadata.create_all`, but *new columns on an existing table*
(`tags_json`, `visibility`, `is_favorite`, `owner_profile_id`,
`cloned_from_id` on `Project`) are not — `create_all` skips tables that
already exist. Fixed by adding migration version 3 (`ALTER TABLE project ADD
COLUMN ...` for each) to `migrations.py`, following the exact pattern already
established by version 2 (added when `metadata_json` was introduced). Verified
against the real local app database (`~/Library/Application Support/Autometa/autometa.db`):
migrated cleanly from version 2 → 3 with no data loss.

`services/backend/tests/conftest.py`'s test-isolation was incomplete:
`database.py`'s legacy-database adoption (a real upgrade path — it copies a
pre-existing `autometa.db` from the current working directory into place on
first run) was matching a stray dev-server-created `autometa.db` left in
`services/backend/` from earlier manual testing, silently reusing its
out-of-date schema for the "fresh" test DB whenever pytest was invoked with
that directory as cwd. Fixed by having conftest also `os.chdir()` into its
isolated temp dir, so test runs are robust regardless of invocation
directory. (The stray file itself was left untouched — it's gitignored,
pre-dates this session, and may hold data from earlier manual testing.)

### Build checklist
- [x] Backend: `Project` tags/visibility/favorite/clone fields, `ProjectVersion`
      CRUD, `Comment` CRUD, filtered `GET /api/projects` + tests
- [x] `packages/rule-engine/src/jflap.ts` + tests (FA thorough, PDA/TM/Mealy
      best-effort, Moore explicitly unsupported)
- [x] `shareFormat.ts` + `batchSimulation.ts` + tests
- [x] `useProjectLibrary`, `useComments` hooks
- [x] `ProjectLibrary`, `CommentThread`, `BatchModeModal` components;
      Gradebook tab in `PracticeHub`; Save Version button in `EditorHeader`
- [x] NavSidebar + App.tsx wiring (`library` view)
- [x] Typecheck / build / vitest / pytest all green (146 frontend + 56
      backend tests)

## Phase 7 — Accessibility and product quality · Status: ✅ complete

**Scope change (user, 2026-07-14): Responsive design (tablet/small-screen
layouts) and color-blind-safe simulation-state cues were explicitly skipped**
— not attempted, not partially done. Everything else in the original outline
was completed.

### Accessibility
- `StateNode` (`packages/graph-engine`) gained a computed `aria-label`
  ("State q0, start state, accepting state...") so a screen reader announces
  each state's role, not just a bare focusable div. Accept/reject/start were
  already partly shape/text-distinguished (double border for accept, an
  arrow + "Start" text label) — untouched, since color-blind-safe cues were
  descoped.
- `TransitionEdge` gained an SVG `<title>` + `aria-label` describing "Transition
  from X to Y on symbol" for hover/assistive-tech description.
- React Flow's own keyboard node focus/move (`nodesFocusable`, on by default —
  confirmed not disabled anywhere) now composes correctly with the existing
  simulation-step arrow-key shortcut: arrow keys move a **keyboard-focused
  state** when one has focus, and only step the simulation otherwise
  (previously the simulation-step handler always won, silently breaking
  arrow-key repositioning during/after a run).
- New **"N" keyboard shortcut** adds a state near the current view center —
  the keyboard-only equivalent of double-clicking the canvas (the only
  canvas edit that had no non-mouse path). Documented in `EditorOnboarding`
  and the Settings → Shortcuts tab (`EDITOR_SHORTCUT_GROUPS`).
- Four previously-unassociated `<label>`/`<input>` pairs in `EditorSidebar`
  (state label, **transition symbols** — the actual "accessible
  transition-label editing" target, simulation input string, AI-grading
  language description) now use `htmlFor`/`id` so screen readers announce
  the field's purpose.
- Icon-only buttons added in Phase 5/6 (`ProjectLibrary`, `CommentThread`)
  gained visible `focus-visible` rings — they previously relied on
  `border-none` with no focus indicator at all.

### Performance
- `TransitionEdge` is now `memo`-wrapped, matching `StateNode` — large
  automata have far more edges than states, so this was the bigger of the
  two render-cost gaps.
- `TapeHistory.tsx` rendered every TM tape snapshot unconditionally (up to
  `simulateTuringMachine`'s `maxSteps = 1000`, unmemoized) on every playback
  step. Now windowed to 150 rows centered on the current step (with a
  memoized row component and a "showing N of M" note) — the concrete fix for
  "long TM traces without UI freezes".
- Investigated and ruled out a suspected debounce gap in `GrammarEditor`'s
  parsing-table `useEffect`: confirmed via all `setRules` call sites that it
  only fires on discrete Add/Delete/Load-example actions, never per
  keystroke, so no fix was needed there.

### Documentation
- New `HelpCenterModal.tsx`, opened from the NavSidebar "Help" button
  (previously that button only replayed the editor onboarding tour).
  Four tabs: **Overview** (with buttons to replay the onboarding tour or
  jump to the Shortcuts settings tab), **Automaton Types** (DFA/NFA/Mealy/
  Moore/PDA/TM/Regex/CFG explained in a few sentences each — the "algorithm
  explanations"), **File Formats** (`.project`, `.jff`, `.share.json` — the
  Phase 6 "format guides"), and **Features** (one paragraph per top-level
  view: Editor, Grammars, Lesson Builder, Practice, Library, Batch Mode).
- `EditorOnboarding`'s "add a state" step and the shortcuts reference both
  updated to mention the new "N" shortcut.

### Build checklist
- [x] `StateNode`/`TransitionEdge` aria-labels; edge memoization
- [x] Arrow-key node-move vs. simulation-step conflict fixed
- [x] "N" keyboard shortcut to add a state; documented in onboarding +
      shortcuts reference
- [x] Accessible label/input association for 4 `EditorSidebar` fields
- [x] Focus-visible rings on new Phase 5/6 icon-only buttons
- [x] `TapeHistory` windowed/memoized for long TM traces
- [x] `HelpCenterModal` (overview, automaton types, file formats, features)
- [x] Typecheck / build / vitest / pytest all green (146 frontend + 56
      backend tests)

---

## Change log
- 2026-07-14: Doc created; accounts-model decision recorded; Phase 5 scope
  finalized before implementation started.
- 2026-07-14: Phase 5 complete — practice mode, exercise generator, semantic
  grading, lesson paths, and instructor authoring all implemented, tested,
  and manually verified end-to-end (including a sidebar-overlay fix found
  during manual testing). Starting Phase 6.
- 2026-07-14: Phase 6 complete — JFLAP import/export, JSON share packages,
  project library (tags/visibility/favorites/cloning/versions), comments,
  gradebook, and batch mode all implemented and tested (146 frontend + 56
  backend tests passing). Also fixed a pre-existing test-isolation gap in
  conftest.py (see notes above). Starting Phase 7.
- 2026-07-14: user descoped responsive design and color-blind-safe state
  cues from Phase 7 — not attempted.
- 2026-07-15: Phase 7 complete — accessibility (aria-labels, keyboard state
  creation, arrow-key focus conflict fix, accessible label associations,
  focus-visible rings), performance (edge memoization, TapeHistory
  windowing), and documentation (HelpCenterModal) all implemented and
  verified (146 frontend + 56 backend tests still green). All three phases
  (5, 6, 7) are now complete.
