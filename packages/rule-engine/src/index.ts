/**
 * @autometa/rule-engine — formal-language transformations and analyses.
 *
 * Split by domain; this barrel preserves the original flat public API:
 *  - fa:       NFA→DFA subset construction, DFA minimization, and their
 *              step-by-step walkthrough variants for the editor UI
 *  - regex:    regex → NFA (Thompson's construction) with build steps
 *  - cfg:      CFG normal forms (CNF/GNF) and CYK parsing
 *  - parsing:  FIRST/FOLLOW, LL(1), LR(0), SLR(1) tables, derivations
 *  - grammar-fa: NFA ↔ right-linear regular grammar conversions
 *  - pumping:  pumping-lemma decomposition for regular languages
 *  - grading:            semantic grading (Phase 5 — behavior, not diagram shape)
 *  - exerciseGenerator:  deterministic, parameterized fresh exercises (Phase 5)
 *  - jflap:              JFLAP (.jff) import/export (Phase 6)
 *  - unrestricted:       Type-0 grammars and bounded derivation search (Phase 4)
 */
export * from './fa';
export * from './regex';
export * from './cfg';
export * from './parsing';
export * from './grammar-fa';
export * from './pumping';
export * from './grading';
export * from './exerciseGenerator';
export * from './jflap';
export * from './unrestricted';
export * from './pda-cfg';
export * from './csh';
export * from './language-parser';
export * from './regexSimplify';
