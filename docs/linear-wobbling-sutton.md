# Phase 2 — Formal-Language Algorithms (Autometa)

## Context

`docs/phase-0-4-gap-backlog.md` tracks remaining work against the original Phase 0–4
roadmap. Phase 0 and Phase 1 are already closed. This plan closes **Phase 2**
("Formal-language algorithms" — items 1–5), per the user's explicit request.

Research (Explore agent + direct reads) found Phase 2 is far more uneven than the
doc's "mostly UI wiring" framing suggests: items 1–2 need a UI primitive that
doesn't exist anywhere today (the whole app assumes exactly one automaton on
canvas), and item 3 includes PDA→CFG, one of the hardest classical
triple-construction algorithms in the field.

**User's scope decisions (asked directly, see conversation):**
1. **Exclude PDA→CFG** and the **full bespoke regex-editor rebuild** (syntax
   highlighting via a real editor surface + dedicated workspace chrome). Do a
   lightweight version of the regex side instead (highlighting overlay on the
   existing input + AST exposure), and log PDA→CFG as an explicit, justified
   remaining item — same pattern Phase 0 used for its one intentional exclusion.
2. **Build a new dedicated view** (not a modal) for two-automaton work: a new
   top-level `AppView` alongside Grammars/Practice/Library.

**Correction to the backlog doc found during research:** item 3 currently claims
"CFG→PDA... wired into the UI" — false. `cfgToPDA` (`cfg.ts:50`) is only used in
`packages/rule-engine/src/__tests__/conversions.test.ts`; no UI references it
anywhere in `apps/web/src`. The doc update at the end must correct this.

---

## Work packages

### A. Engine additions (`packages/rule-engine/src`)

All new functions get unit tests in the relevant `__tests__` file, following the
existing style (see `conversions.test.ts`, `fa.test.ts`, `parsing.test.ts`).

1. **`combineDFASteps`** (`fa.ts`, near `combineDFA` line 61) — product-construction
   walkthrough for union/intersection/difference, same row-per-step shape as
   `nfaToDfaSteps` (`NfaToDfaRow`/`NfaToDfaWalkthrough`, line 484): one row per
   product-state pair processed (`⟨a,b⟩` labels `combineDFA` already generates),
   its transitions, and the `finalDfa`. `combineDFA` stays as the "just give me
   the result" entry point; `combineDFASteps` wraps the same product-construction
   loop but records rows instead of only building the automaton.

2. **`concatenateNFA(a, b)`, `starNFA(a)`, `reverseNFA(a)`** (`fa.ts`, new
   exports) — standard NFA constructions, ID-namespaced (e.g. `a-${id}`/`b-${id}`
   for concatenation) to avoid collisions:
   - concatenation: new start = `a`'s start; ε-edge from each `a` accept state to
     `b`'s start; `a`'s accepts become non-accepting; final accepts = `b`'s accepts.
   - star: new wrapper state, `isStart: true, isAccept: true` (handles ε); ε-edge
     to `a`'s start; ε-edge from each `a` accept back to the wrapper.
   - reversal: reverse every edge's source/target; new single start state with
     ε-edges to all of `a`'s old accept states; `a`'s old start state(s) become
     the new accept state(s).
   These are NFA-native (unlike `combineDFA`, which requires complete DFAs), so
   no determinization is forced on the caller.

3. **Fix `cfgToGNF`** (`cfg.ts:254-276`) — replace the one-shot substitution with
   a fixed-point loop: keep substituting a production's leading nonterminal with
   its CNF productions until every alternative starts with a terminal, with a
   visited-set guard against cycles (self-reference or mutual recursion) that
   throws/returns a clear error instead of looping forever. Add a real
   correctness test: for 2-3 sample grammars, assert every returned production
   starts with a terminal, and cross-check language equivalence against the
   input grammar using `cykParse` on several sample strings (accept/reject must
   match).

4. **NFA ↔ regular grammar** (new file `packages/rule-engine/src/grammar-fa.ts`,
   re-exported from `index.ts`):
   - `nfaToRegularGrammar(nfa: Automaton): CFGRules` — each state → nonterminal;
     transition `q --a--> r` → production `Q -> a R`; accept states get `Q -> ε`.
   - `regularGrammarToNfa(grammar: CFGRules, startSymbol: string): Automaton` —
     inverse mapping; validates the grammar is right-linear first (every
     production is `a`, `a B`, or `ε` — reject/throw with a clear message
     otherwise, since general CFGs aren't convertible this way).

5. **Step-trace variants**, mirroring `nfaToDfaSteps`/`minimizeDFASteps`/
   `regexToNfaSteps`'s "array or object of steps + final result" shape:
   - `cfgToCNFSteps` / `cfgToGNFSteps` (`cfg.ts`) — one step per internal
     transformation stage (start symbol isolation, ε-removal, unit-production
     removal, binarization for CNF; the fixed-point substitution stages for GNF).
   - `cfgToPDASteps` (`cfg.ts`) — one step per PDA-construction stage, snapshotting
     the in-progress `Automaton` fragment like `RegexNfaStep` does.
   - `eliminateLeftRecursionSteps` / `leftFactorGrammarSteps` (`cfg.ts`) — one
     step per nonterminal processed.
   - `dfaToRegexSteps` (`fa.ts`, alongside `dfaToRegex` line 104) — one step per
     GNFA state eliminated, snapshotting the remaining regex-labeled transition
     set.
   Existing `cfgToCNF`/`cfgToGNF`/`cfgToPDA`/`eliminateLeftRecursion`/
   `leftFactorGrammar`/`dfaToRegex` stay as-is (return final result only); the
   `*Steps` variants are additive, computing the same result via a traced path.

6. **`computeFirstAndFollow`** (`parsing.ts:6`) — add `nullable: Set<string>` to
   the returned object (already computed implicitly via `first[nt].has('ε')`;
   just also return it as its own set).

7. **`generateLL1Table`** (`parsing.ts:113`) — restructure to
   `{ table: Record<string, Record<string, string[]>>; conflicts: string[] }`,
   matching `generateSLR1Table`'s cell-array + descriptive-string-array shape
   (`parsing.ts:397`). Collect every production that would land in the same
   cell rather than silently overwriting. Add a heuristic suggestion to each
   conflict message on both LL(1) and SLR(1) paths — e.g. "left-factor rule X"
   when the colliding productions share a common prefix, "eliminate left
   recursion in X" when one production directly left-recurses.

8. **`cykParseTable`** (`cfg.ts`, alongside `cykParse` line 282) —
   `(grammar, startSymbol, word) => { accepted: boolean; table: string[][][] }`
   exposing the existing internal `table: Set<string>[][]` (currently discarded)
   as a serializable structure. `cykParse` stays as the boolean-only fast path.

9. **`removeEpsilonProductions(grammar)` / `removeUnitProductions(grammar)`**
   (`cfg.ts`) — extract the two stages already living inside `cfgToCNF`'s
   pipeline into standalone exports; `cfgToCNF` calls them internally instead of
   duplicating the logic.

10. **`removeUselessSymbols(grammar, startSymbol)`** (`cfg.ts`, new) — two-pass
    unreachable/non-generating nonterminal elimination (standard textbook
    algorithm: first drop non-generating nonterminals, then drop unreachable
    ones from the result).

11. **`classifyGrammar(grammar, startSymbol)`** (`cfg.ts`, new) — returns
    `'right-linear' | 'left-linear' | 'context-free'` by checking every
    production's shape. Note in a doc-comment: `CFGRules`' single-nonterminal-LHS
    structure can't represent context-sensitive/unrestricted grammars at all, so
    classification is necessarily bounded to regular-vs-CF — matches Phase 4's
    unrestricted-grammar item, out of scope here.

12. **`findDerivationTrees(grammar, startSymbol, target, limit = 2)`**
    (`parsing.ts`, generalizing `generateLeftmostParseTree`/
    `generateLeftmostDerivations`) — returns up to `limit` distinct
    `{ path: string[]; tree: ParseTreeNode }` results by generalizing the
    existing backtracking search to collect N results instead of one.

13. **`findAmbiguousStringInLanguage(grammar, startSymbol, maxLength = 6)`**
    (`parsing.ts`, new) — bounded sweep over all strings up to `maxLength` built
    from the grammar's terminal alphabet (hard cap on total attempts, e.g. a few
    thousand, to bound runtime); returns the first string with 2+ distinct
    derivations via `findDerivationTrees`, or `null`.

### B. New "Compare & Combine" view (Phase 2 items 1 & 2)

- **`AppView`** (`NavSidebar.tsx:3`) gains `'operations'`; new `NAV_ITEMS` entry
  (icon suggestion: `GitCompare` or `Combine` from `lucide-react`, already a repo
  dependency via other icon usage).
- **New component** `apps/web/src/components/MachineOperations.tsx`, lazy-loaded
  in `App.tsx` the same way `GrammarEditor`/`PracticeHub` are (see `App.tsx:459`
  for the pattern), rendered when `activeView === 'operations'`.
- **Two automaton "slots"**, local component state (`Automaton | null` each), filled
  from: (a) `PREDEFINED_TEMPLATES` (`data/templates.ts`) converted via
  `toAutomaton(nodes, edges, type)` (`utils/flowAutomaton.ts:33`), (b) the user's
  saved projects via the existing `useProjectLibrary()` hook (already used by
  `ProjectLibrary.tsx`/`App.tsx:133`) converted the same way, (c) "use current
  canvas" pulling from `useGraphStore`. No global store mutation — this view
  reads automata into local state, never calls `loadGraph` except on an explicit
  "Load result onto Canvas" action.
- **Read-only diagram previews**: each slot (and the result) renders a small,
  non-interactive `<ReactFlow>` instance (own `ReactFlowProvider`,
  `nodesDraggable={false} nodesConnectable={false} panOnDrag={false}` +
  `fitView`), reusing the existing `StateNode`/`TransitionEdge` custom node/edge
  types from `@autometa/graph-engine` — same visual language as the main canvas,
  no new rendering code needed.
- **Mode toggle — Compare**: calls `findLanguageCounterexample(A, B)`
  (`fa.ts:15`, already correct and tested, just unwired); shows
  equivalent/not-equivalent, and if a counterexample exists, runs it through
  both machines (`simulateDFA`/`simulateNFA` from `@autometa/simulation-engine`,
  already used elsewhere in the app) to show which one accepts/rejects it.
- **Mode toggle — Combine**: operation select
  (union/intersection/difference/complement/concatenation/star/reversal). Binary
  DFA ops need both slots + auto-determinize via existing `nfaToDfaSteps(...).finalDfa`
  if either input isn't already deterministic (toast-notify when this happens,
  via the existing `useToast`); complement/star/reversal are unary (slot A
  only). Union/intersection/difference render the `combineDFASteps` walkthrough
  as a Prev/Next stepper (visually consistent with `TransformationPanel.tsx`'s
  pattern but implemented locally in this view, since it lives outside the
  graph editor's sidebar slot). Result renders in the third preview pane with a
  "Load onto Canvas" button that calls `automatonToFlow` + `loadGraph`
  (mirrors `useTransformations.ts`'s `applyLayoutToAutomaton`, `line 48`) and
  switches `activeView` back to `'graph'`.

### C. Wiring existing/new engine code into the editor UI (items 3–5)

- **`dfaToRegexSteps`**: new `TransformState` kind `'dfaToRegex'` in
  `useTransformations.ts` (replacing the current plain-`conversionResult`
  handling for this one algorithm — `handleDfaToRegex`/`conversionResult` are
  used for nothing else, confirmed via read, so this is a clean swap) + a new
  render block in `TransformationPanel.tsx` following the existing per-`kind`
  pattern (`PANEL_TITLES` entry, Prev/Next, "Apply to Canvas" once the final
  regex string is reached — no automaton to load here, so the terminal action
  is just displaying the regex, matching the current `conversionResult` display).
- **NFA/DFA → Regular Grammar**: new button in `EditorSidebar.tsx`'s Algorithms
  section (next to the existing DFA→Regex one), calls `nfaToRegularGrammar`,
  displays result rules as text (same lightweight pattern `conversionResult`
  used before, no cross-view navigation needed).
- **Regular Grammar → NFA**: new button in `GrammarEditor.tsx`, calls
  `regularGrammarToNfa` on the current rules (surfacing the right-linear
  validation error via `showToast` on failure), with a "Load onto Canvas"
  action. Requires threading a callback into `GrammarEditor` from `App.tsx`
  (which already owns `loadGraph`/`setAutomatonType`/`setActiveView`) — add an
  `onLoadAutomaton: (automaton: Automaton) => void` prop.
- **CFG→CNF/GNF/PDA + left-recursion/left-factor step traces**: add local
  stepper state to `GrammarEditor.tsx` (mirrors `TransformationPanel`'s
  Prev/Next visually, implemented locally since this component doesn't use
  `useTransformations`/`TransformState` at all today — confirmed via read).
  `cfgToPDASteps`, being automaton-producing, gets the same "Load onto Canvas"
  action as Regular Grammar → NFA above (same new prop).
- **Nullable symbols**: display the new `nullable` set in `GrammarEditor.tsx`'s
  existing FIRST/FOLLOW render area.
- **LL(1)/SLR(1) conflict parity**: update `GrammarEditor.tsx`'s conflict
  display block to render `generateLL1Table`'s new per-cell shape the same way
  SLR(1)'s `conflicts: string[]` is already rendered, plus the new suggestion
  text on both.
- **CYK DP-table visualization**: add a triangular-grid render (reusing
  `cykParseTable`'s output) to the `parsing` tab, alongside the existing
  accept/reject line.
- **User-controlled parser stepper**: convert the static, render-everything-at-once
  `parserSteps` table (`GrammarEditor.tsx:744-758`, confirmed via read — no
  interactivity exists today) into a Prev/Next reveal using a local `stepIndex`
  (steps beyond `stepIndex` stay hidden/greyed), reusing the same steps array
  already computed — this is a display-layer change only, `runParserWalk`'s
  computation doesn't need to change.
- **CFG in `TestSuitePanel`**: check current `AutomatonType`/`TestSuitePanel`
  assumptions (`utils/flowAutomaton.ts`, `TestSuitePanel.tsx`) and add a
  grammar-mode branch that batch-tests input strings via `cykParse` membership
  instead of `simulateDFA`/etc., since "run" for a CFG means parse membership,
  not state-machine simulation.
- **Derivation-tree view**: new sub-component in `GrammarEditor.tsx`'s
  `derivation` tab, alongside the existing `ParseTree` — renders the same
  derivation as a tree with the specific production/symbols rewritten at each
  step highlighted (steps are available structurally, not just as strings,
  once `findDerivationTrees` is wired in for `runDerivation`).
- **Ambiguity — side-by-side trees + bounded sweep**: `runDerivation` switches
  from `generateLeftmostDerivations` (strings only) to `findDerivationTrees`
  (paths + trees) so `ambiguityEvidence`'s two paths can each render as a real
  `ParseTree` side by side instead of the current generic banner. Add a
  separate "Scan for ambiguity" button calling `findAmbiguousStringInLanguage`
  for the bounded proactive sweep (independent of whatever string the user has
  typed).
- **Grammar transformation buttons**: `removeEpsilonProductions`,
  `removeUnitProductions`, `removeUselessSymbols`, `classifyGrammar` each get a
  button in the `simplification` tab, displaying result rules/classification as
  text (same pattern as existing CNF/GNF display).
- **Regex workspace (lightweight)**: replace the single sidebar `<input>` (in
  `EditorSidebar.tsx`, near `handleRegexToNfa`) with a larger textarea-style
  surface plus a syntax-highlighting overlay (transparent textarea stacked over
  a highlighted `<div>` backdrop — standard technique, no new dependency).
  Add `regexToAst(regex): RegexAstNode` to `regex.ts`, built by consuming the
  same `regexToPostfix` token stream `regexToNfa` already produces (a
  node-stack construction mirroring the existing fragment-stack Thompson-build
  loop, just building tree nodes instead of automaton fragments — low risk
  since tokenization/postfix conversion is unchanged and already correct). New
  small recursive tree-render component (visually modeled on `ParseTree`) shows
  the AST once a regex is entered, wired into the same `TransformState`
  `'regexToNfa'` flow.

### D. Docs — `docs/phase-0-4-gap-backlog.md`

- Mark Phase 2 items 1, 2, and 4 ✅ complete.
- Mark item 3 ✅ complete **except** PDA→CFG, called out explicitly as
  intentionally deferred with rationale (triple-construction complexity vs. the
  rest of the phase) — same pattern as Phase 0's `nodes_json`/`edges_json` note.
  Correct the doc's stale "CFG→PDA... wired into the UI" claim while here.
- Mark item 5 ✅ complete **except** the full bespoke editor/workspace chrome,
  noting the lightweight highlighting-overlay + AST approach taken instead and
  why (product-design scope, not algorithmic).
- Update the Build Checklist line (`- [ ] Phase 2 gaps closed` → `[x]`, with the
  same "except X, Y" caveat inline).
- Add a changelog entry (test count before → after, matching the Phase 0/1
  entries' style).

### E. Verification

- New/updated rule-engine unit tests for every function in section A (existing
  `__tests__` files: `fa.test.ts`, `conversions.test.ts` or similar, `parsing.test.ts`
  — match current file organization).
- Full `bun test`/vitest run **from repo root** (per prior-session finding:
  must run from root, not `apps/web`) — confirm green, record before/after test
  counts for the changelog.
- Typecheck all six monorepo packages (matching Phase 0/1's verification bar).
- Backend Python tests: not expected to be touched by this phase (pure
  frontend/engine work) — run once at the end to confirm still green as a
  regression check.
- Manual UI verification: per user preference, I will not drive Playwright
  unasked. I'll confirm the dev server builds/starts cleanly and hand off a
  manual test checklist covering: Compare & Combine view (both modes, all
  operations, load-to-canvas), regex highlighting + AST view, all new
  GrammarEditor steppers/buttons (CNF/GNF/PDA/left-recursion/left-factor
  steppers, derivation-tree view, ambiguity side-by-side, CYK table, parser
  stepper, grammar transformation buttons), and NFA↔regular-grammar round trip.
