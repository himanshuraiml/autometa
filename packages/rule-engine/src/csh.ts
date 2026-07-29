export type ChomskyLevel = 
  | 'Type-3 (Regular)' 
  | 'Type-2 (Context-Free)' 
  | 'Type-1 (Context-Sensitive)' 
  | 'Type-0 (Unrestricted)';

export interface ChomskyAnalysis {
  level: ChomskyLevel;
  isRegular: boolean;
  isContextFree: boolean;
  isContextSensitive: boolean;
  isUnrestricted: boolean;
  explanation: string;
}

/**
 * Evaluates production rules against the 4 levels of the Chomsky Hierarchy.
 * Grammar rules can be represented as a map of LHS -> RHS list.
 * Supports LHS containing multiple symbols (context-sensitive or unrestricted).
 */
export const classifyChomskyHierarchy = (rules: Record<string, string[]>, startSymbol: string = 'S'): ChomskyAnalysis => {
  const lhsKeys = Object.keys(rules);
  if (lhsKeys.length === 0) {
    return {
      level: 'Type-3 (Regular)',
      isRegular: true,
      isContextFree: true,
      isContextSensitive: true,
      isUnrestricted: true,
      explanation: 'Empty grammar defaults to Type-3 (Regular).'
    };
  }

  let isType3 = true;
  let isType2 = true;
  let isType1 = true;
  let isType0 = true;

  // Check if start symbol derives epsilon
  let startDerivesEpsilon = false;
  let startAppearsOnRhs = false;

  for (const lhs of lhsKeys) {
    const rhss = rules[lhs] || [];
    
    // Type 2 requirement: LHS must be a single nonterminal (e.g. "S", "A")
    const isSingleNonTerminal = /^[A-Z][0-9]*$/.test(lhs.trim());
    if (!isSingleNonTerminal) {
      isType2 = false;
      isType3 = false;
    }

    for (const rhs of rhss) {
      const trimmedRhs = rhs.trim();
      const rhsSymbols = trimmedRhs.split(/\s+/).filter(Boolean);

      if (trimmedRhs.includes(startSymbol)) {
        startAppearsOnRhs = true;
      }

      if (trimmedRhs === 'ε' || trimmedRhs === '' || trimmedRhs === 'lambda') {
        if (lhs.trim() === startSymbol) {
          startDerivesEpsilon = true;
        } else {
          // Non-contracting rule broken by epsilon on non-start symbol
          isType1 = false;
        }
      } else {
        // Length comparison for Type 1 (non-contracting: |LHS| <= |RHS|)
        const lhsLen = lhs.trim().split(/\s+/).length;
        const rhsLen = rhsSymbols.length;
        if (lhsLen > rhsLen) {
          isType1 = false;
        }
      }

      // Check Type 3 (Right-linear or Left-linear)
      if (isType3) {
        // Right linear: A -> aB or A -> a
        // Left linear:  A -> Ba or A -> a
        const isRightLinear = /^[a-z0-9ε]\s*[A-Z]?$/.test(trimmedRhs) || /^[a-z0-9]+$/.test(trimmedRhs);
        const isLeftLinear = /^[A-Z]?\s*[a-z0-9ε]$/.test(trimmedRhs) || /^[a-z0-9]+$/.test(trimmedRhs);
        if (!isRightLinear && !isLeftLinear) {
          isType3 = false;
        }
      }
    }
  }

  if (startDerivesEpsilon && startAppearsOnRhs) {
    isType1 = false;
  }

  let level: ChomskyLevel = 'Type-0 (Unrestricted)';
  let explanation = 'Grammar contains contracting rules or multi-symbol LHS.';

  if (isType3) {
    level = 'Type-3 (Regular)';
    explanation = 'All productions are right-linear or left-linear (A -> aB or A -> a).';
  } else if (isType2) {
    level = 'Type-2 (Context-Free)';
    explanation = 'All productions have a single nonterminal on the LHS (A -> α).';
  } else if (isType1) {
    level = 'Type-1 (Context-Sensitive)';
    explanation = 'All productions are non-contracting (|LHS| <= |RHS|).';
  }

  return {
    level,
    isRegular: isType3,
    isContextFree: isType2,
    isContextSensitive: isType1,
    isUnrestricted: isType0,
    explanation
  };
};
