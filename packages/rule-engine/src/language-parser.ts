import type { Automaton } from '@autometa/simulation-engine';
import { regexToDfa, stringListToDfa, normalizeAutomatonStateLabels } from './fa';

export interface LanguageParseResult {
  dfa: Automaton;
  regex: string;
  alphabet: string[];
  description: string;
}

/**
 * Parses natural language descriptions or set-builder notation into a minimal DFA.
 * Examples supported:
 *  - "L = { w ∈ {0,1}* | w ends with 01 }"
 *  - "Strings ending with 01 over {0,1}"
 *  - "starts with 10"
 *  - "contains 101"
 *  - "does not contain 11"
 *  - "even number of 0s"
 *  - "cat, car, card" or {"abc", "de"}
 */
export const parseLanguageToDfa = (input: string): LanguageParseResult => {
  const cleanInput = input.trim();
  if (!cleanInput) {
    throw new Error('Language description is empty.');
  }

  // 1. Extract declared alphabet if present in input, e.g. {0,1} or {a,b}
  let alphabet: string[] = [];
  const alphaMatch = cleanInput.match(/\{([a-zA-Z0-9,\s]+)\}\*/)|| cleanInput.match(/over\s*\{([a-zA-Z0-9,\s]+)\}/i) || cleanInput.match(/in\s*\{([a-zA-Z0-9,\s]+)\}/i);
  if (alphaMatch) {
    alphabet = alphaMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }

  // 2. Check if input is a comma-separated list or set of finite words: {"abc", "de"} or cat, car, card
  const isFiniteSetNotation = /^\s*\{?\s*"?[a-zA-Z0-9ε]+"?\s*(,\s*"?[a-zA-Z0-9ε]+"?\s*)*\}?\s*$/.test(cleanInput)
    && !/ends\s+with|starts\s+with|contains|even|odd|length/i.test(cleanInput);

  // Helper to wrap final result with clean state names (q0, q1, q2...) and trim unnecessary dead states
  const finalizeResult = (res: LanguageParseResult): LanguageParseResult => {
    return {
      ...res,
      dfa: normalizeAutomatonStateLabels(res.dfa, true)
    };
  };

  if (isFiniteSetNotation) {
    const rawWords = cleanInput.replace(/[\{\}"]/g, '').split(',').map(s => s.trim()).filter(Boolean);
    const dfa = stringListToDfa(rawWords);
    return finalizeResult({
      dfa,
      regex: rawWords.join('|') || 'ε',
      alphabet: [...new Set(rawWords.join('').split(''))].sort(),
      description: `Finite set of words {${rawWords.join(', ')}}`
    });
  }

  // Helper to build Sigma star regex: (0|1)* or (a|b)*
  const getSigmaStar = (targetPattern: string): string => {
    let alpha = alphabet;
    if (alpha.length === 0) {
      // Infer alphabet from characters in targetPattern (defaulting to {0,1} if digits, or {a,b} if letters)
      const chars = [...new Set(targetPattern.replace(/[^a-zA-Z0-9]/g, '').split(''))];
      if (chars.every(c => /[0-1]/.test(c))) {
        alpha = ['0', '1'];
      } else if (chars.every(c => /[a-bA-B]/.test(c))) {
        alpha = ['a', 'b'];
      } else {
        alpha = chars.length > 0 ? chars : ['0', '1'];
      }
    }
    return `(${alpha.join('|')})*`;
  };

  // 3. Match "ends with [pattern]" or "ending with [pattern]"
  const endsWithMatch = cleanInput.match(/(?:ends?\s+with|ending\s+with)\s+([a-zA-Z0-9]+)/i);
  if (endsWithMatch) {
    const pattern = endsWithMatch[1];
    const sigmaStar = getSigmaStar(pattern);
    const regex = `${sigmaStar}${pattern}`;
    const dfa = regexToDfa(regex);
    return finalizeResult({
      dfa,
      regex,
      alphabet: [...new Set(regex.replace(/[^a-zA-Z0-9]/g, '').split(''))].sort(),
      description: `Strings ending with "${pattern}"`
    });
  }

  // 4. Match "starts with [pattern]" or "starting with [pattern]"
  const startsWithMatch = cleanInput.match(/(?:starts?\s+with|starting\s+with)\s+([a-zA-Z0-9]+)/i);
  if (startsWithMatch) {
    const pattern = startsWithMatch[1];
    const sigmaStar = getSigmaStar(pattern);
    const regex = `${pattern}${sigmaStar}`;
    const dfa = regexToDfa(regex);
    return finalizeResult({
      dfa,
      regex,
      alphabet: [...new Set(regex.replace(/[^a-zA-Z0-9]/g, '').split(''))].sort(),
      description: `Strings starting with "${pattern}"`
    });
  }

  // 5. Match "contains [pattern]" or "containing [pattern]"
  const containsMatch = !cleanInput.includes('does not') ? cleanInput.match(/(?:contains?|containing)\s+([a-zA-Z0-9]+)/i) : null;
  if (containsMatch) {
    const pattern = containsMatch[1];
    const sigmaStar = getSigmaStar(pattern);
    const regex = `${sigmaStar}${pattern}${sigmaStar}`;
    const dfa = regexToDfa(regex);
    return finalizeResult({
      dfa,
      regex,
      alphabet: [...new Set(regex.replace(/[^a-zA-Z0-9]/g, '').split(''))].sort(),
      description: `Strings containing substring "${pattern}"`
    });
  }

  // 6. Match "does not contain [pattern]" or "without [pattern]"
  const notContainMatch = cleanInput.match(/(?:does\s+not\s+contain|without|not\s+containing)\s+([a-zA-Z0-9]+)/i);
  if (notContainMatch) {
    const pattern = notContainMatch[1];
    const sigmaStar = getSigmaStar(pattern);
    const containsRegex = `${sigmaStar}${pattern}${sigmaStar}`;
    // Complement of contains DFA
    const containsDfa = regexToDfa(containsRegex);
    // Complement accept states:
    const complementedNodes = containsDfa.nodes.map(n => ({ ...n, isAccept: !n.isAccept }));
    const dfa = { ...containsDfa, nodes: complementedNodes };
    return finalizeResult({
      dfa,
      regex: `¬(${containsRegex})`,
      alphabet: [...new Set(pattern.split(''))].sort(),
      description: `Strings that do NOT contain substring "${pattern}"`
    });
  }

  // 7. Fallback: try parsing input directly as regular expression pattern (e.g. (0|1)*01)
  try {
    const dfa = regexToDfa(cleanInput);
    return finalizeResult({
      dfa,
      regex: cleanInput,
      alphabet: [...new Set(cleanInput.replace(/[^a-zA-Z0-9]/g, '').split(''))].sort(),
      description: `DFA for regular expression "${cleanInput}"`
    });
  } catch {
    throw new Error(
      `Could not parse language description "${cleanInput}". Supported formats:\n` +
      `• Set-builder / English: "Strings ending with 01 over {0,1}", "L = { w ∈ {0,1}* | w ends with 01 }"\n` +
      `• Patterns: "starts with 10", "contains 101", "does not contain 11"\n` +
      `• Finite word lists: "cat, car, card"`
    );
  }
};
