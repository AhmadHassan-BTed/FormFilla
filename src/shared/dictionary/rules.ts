import { SensitivityTier } from '../types/index.js';
import rawRules from './rules.json' with { type: 'json' };
import { tokenize } from '../../content/matching/normalizer.js';

/**
 * Compiles rules.json into the FieldRule dictionary the scorer uses to
 * decide which profile key (if any) a scanned form field maps to.
 *
 * Hardened for the same reason as constants.ts, but the stakes here are
 * higher: this file compiles user-supplied regex STRINGS into real
 * RegExp objects at module-load time, and the README explicitly invites
 * hand- or AI-expansion of exactly that field ("Expanding its
 * exactPhrases and regexPatterns allows FormFilla to map highly
 * customized inputs"). A malformed pattern used to throw inside
 * `new RegExp(...)`, uncaught — which doesn't just drop that one rule,
 * it aborts the whole compilation loop before FIELD_RULES is even
 * exported, so every file that imports this one (almost certainly
 * scorer.ts, then orchestrator.ts) fails to load. Confirmed with an
 * actual reproduction: one unescaped "(" in a single pattern string is
 * enough to take the whole content script down.
 *
 * Fixes, roughly in order of how much they worried me reading this file:
 *
 *  1. Regex compilation is now isolated per-PATTERN, not just per-rule.
 *     A malformed pattern is skipped with a console.error naming the
 *     exact rule and pattern; every other pattern in that same rule,
 *     and every other rule in the file, is unaffected. Each rule's
 *     compilation is also wrapped individually, so an unrelated failure
 *     in one rule still can't take down the rest.
 *  2. sensitivityTier had no validation against the three real values
 *     ('standard' | 'sensitive' | 'critical') — a typo silently fell
 *     through unnoticed. Worse, if it had defaulted to 'standard' the
 *     way requiresOptIn did, a typo'd "critcal" on something like an
 *     SSN rule would downgrade it to auto-fillable, silently bypassing
 *     the "Critical Items (Needs Confirm)" protection the README
 *     advertises as a safety guarantee. An invalid-but-present value
 *     now fails closed to 'critical' instead — loud, and safe by
 *     default — while a genuinely absent value still defaults to
 *     'standard', exactly as before. requiresOptIn gets the same
 *     treatment: invalid fails closed to true, not false.
 *  3. allowedTypes/allowedTags were compared against hardcoded-case
 *     values (normType is always lowercase, normTag is always
 *     uppercase) but were never themselves case-normalized. A
 *     perfectly reasonable `"allowedTags": ["input"]` in rules.json
 *     would silently never match anything, since the comparison is
 *     against "INPUT" — a rule that looks correctly configured but has
 *     quietly never fired. Both are now normalized to the casing the
 *     comparison actually expects.
 *  4. exactPhrases / autocompleteTokens / allowedTypes / allowedTags
 *     all trusted `|| []` without checking the value was actually an
 *     array of strings. A single string instead of a one-element array
 *     (an easy JSON typo) used to pass straight through and could crash
 *     later — not at import time, but the first time scorer.ts called
 *     .some()/.map() on what turned out to be a string, which is a much
 *     harder bug to trace back to its source. Every list is now
 *     validated and cleaned at compile time instead.
 *  5. __arrayShapeSignatures__ (repeated-block detection — multiple
 *     jobs/degrees) had zero validation and would throw if rules.json
 *     were ever missing it. Now validated and fails closed to an empty
 *     map with a loud warning instead of crashing.
 *  6. FIELD_RULES and arrayShapeSignatures are deep-frozen — structurally
 *     (objects and arrays), not the RegExp instances themselves, since
 *     freezing those risks breaking .lastIndex-dependent regex usage
 *     I can't see from this file alone — so nothing downstream can
 *     accidentally corrupt the shared rule dictionary mid-session.
 *
 * FieldRule's shape and rules.json's structure are both unchanged —
 * nothing here requires touching rules.json or scorer.ts's contract
 * with this file.
 */

export interface FieldRule {
  sensitivityTier: SensitivityTier;
  requiresOptIn?: boolean;
  optInKey?: string;
  typeCompatible(type: string, tagName: string): boolean;
  exactPhrases: string[];
  regexPatterns: RegExp[];
  autocompleteTokens: string[];
  negativePatterns?: RegExp[];
  rejectIfMatches?: RegExp[];
}

function defaultTypeCompatible(type: string, tagName: string, allowedTypes?: string[], allowedTags?: string[]): boolean {
  // Defensive coercion only — the comparison logic below is unchanged.
  // A pseudo-element (like orchestrator.ts's date-group descriptor) or
  // any other caller that doesn't have a real .type/.tagName shouldn't
  // be able to throw its way past this gate.
  const normType = String(type ?? '').toLowerCase();
  const normTag = String(tagName ?? '').toUpperCase();

  if (normType === 'file') {
    return allowedTypes?.includes('file') || false;
  }

  if (allowedTypes && allowedTypes.includes('file') && normType !== 'file') {
    return false;
  }

  if (allowedTags && !allowedTags.includes(normTag)) {
    return false;
  }

  if (allowedTypes && !allowedTypes.includes(normType)) {
    const isTextLikeInput = ['text', 'email', 'tel', 'url', 'number', 'date', 'password', 'textarea'].includes(normType) || normTag === 'TEXTAREA';
    const isTextLikeAllowed = allowedTypes.some(t => ['text', 'email', 'tel', 'url', 'number', 'date', 'password', 'textarea'].includes(t));
    if (isTextLikeInput && isTextLikeAllowed) {
      return true;
    }
    return false;
  }

  return true;
}

/* ===================================================================
   Validation helpers — every one of these fails closed to something
   safe/empty and logs a specific console.warn/error rather than
   letting a malformed rules.json entry throw or silently corrupt data.
   =================================================================== */

function normalizeStringArray(value: unknown, ruleName: string, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    console.warn(`FormFilla: rules.json["${ruleName}"].${fieldName} is not an array — ignoring it.`);
    return undefined;
  }
  return value.filter((v): v is string => {
    const ok = typeof v === 'string' && v.trim().length > 0;
    if (!ok) {
      console.warn(`FormFilla: rules.json["${ruleName}"].${fieldName} has a non-string/empty entry (${JSON.stringify(v)}) — skipping it.`);
    }
    return ok;
  });
}

function compileRegexList(patterns: unknown, ruleName: string, fieldName: string): RegExp[] {
  if (patterns === undefined) return [];
  if (!Array.isArray(patterns)) {
    console.warn(`FormFilla: rules.json["${ruleName}"].${fieldName} is not an array — ignoring it.`);
    return [];
  }

  const compiled: RegExp[] = [];
  for (const pat of patterns) {
    if (typeof pat !== 'string' || pat.trim().length === 0) {
      console.warn(`FormFilla: rules.json["${ruleName}"].${fieldName} has a non-string/empty pattern — skipping it.`);
      continue;
    }
    try {
      compiled.push(new RegExp(pat, 'i'));
    } catch (err) {
      console.error(
        `FormFilla: rules.json["${ruleName}"].${fieldName} has an invalid regex pattern ${JSON.stringify(pat)} — ` +
        `skipping just this pattern, every other pattern in this rule is unaffected. (${(err as Error).message})`
      );
    }
  }
  return compiled;
}

const VALID_SENSITIVITY_TIERS: readonly SensitivityTier[] = ['standard', 'sensitive', 'critical'];

function resolveSensitivityTier(rawValue: unknown, ruleName: string): SensitivityTier {
  if (rawValue === undefined) return 'standard'; // absent -> matches original default for ordinary fields
  if (typeof rawValue === 'string' && (VALID_SENSITIVITY_TIERS as readonly string[]).includes(rawValue)) {
    return rawValue as SensitivityTier;
  }
  console.error(
    `FormFilla: rules.json["${ruleName}"].sensitivityTier is ${JSON.stringify(rawValue)}, not one of ${VALID_SENSITIVITY_TIERS.join('/')} — ` +
    'defaulting to "critical" (not "standard") so a likely-intended protection fails closed instead of silently disappearing. Fix the JSON to clear this warning.'
  );
  return 'critical';
}

function resolveRequiresOptIn(rawValue: unknown, ruleName: string): boolean | undefined {
  if (rawValue === undefined) return undefined; // absent -> no opt-in required, matches original default
  if (typeof rawValue === 'boolean') return rawValue;
  console.error(
    `FormFilla: rules.json["${ruleName}"].requiresOptIn is ${JSON.stringify(rawValue)}, not a real boolean — ` +
    'defaulting to true (requires opt-in) rather than silently dropping a likely-intended protection. Fix the JSON to clear this warning.'
  );
  return true;
}

function resolveOptInKey(rawValue: unknown, ruleName: string, requiresOptIn: boolean | undefined): string | undefined {
  if (rawValue === undefined) {
    if (requiresOptIn) {
      console.error(`FormFilla: rules.json["${ruleName}"] sets requiresOptIn but has no optInKey — this field can never be unlocked until that's fixed.`);
    }
    return undefined;
  }
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) return rawValue.trim();
  console.warn(`FormFilla: rules.json["${ruleName}"].optInKey is not a valid non-empty string — ignoring it.`);
  return undefined;
}

/** Freezes an object/array structurally, but stops at RegExp instances
 *  rather than freezing them — some regex usage patterns rely on
 *  mutating .lastIndex, and this file can't see how scorer.ts uses
 *  these, so leaving the leaf RegExp objects mutable is the safer call. */
function deepFreeze<T>(obj: T): T {
  if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) return obj;
  if (obj instanceof RegExp) return obj;
  if (Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj as Record<string, unknown>)) {
    deepFreeze(value);
  }
  return obj;
}

/* ===================================================================
   Per-rule compilation
   =================================================================== */

export function compileRule(key: string, raw: unknown): FieldRule | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    console.warn(`FormFilla: rules.json["${key}"] is not a valid rule object — skipping it.`);
    return null;
  }

  const rawRule = raw as Record<string, unknown>;

  const requiresOptIn = resolveRequiresOptIn(rawRule.requiresOptIn, key);
  const optInKey = resolveOptInKey(rawRule.optInKey, key, requiresOptIn);

  // Normalized to the exact casing defaultTypeCompatible's comparisons
  // expect (allowedTypes: lowercase: allowedTags: uppercase) — see fix #3.
  const allowedTypes = normalizeStringArray(rawRule.allowedTypes, key, 'allowedTypes')?.map(t => t.toLowerCase());
  const allowedTags = normalizeStringArray(rawRule.allowedTags, key, 'allowedTags')?.map(t => t.toUpperCase());

  return {
    sensitivityTier: resolveSensitivityTier(rawRule.sensitivityTier, key),
    requiresOptIn,
    optInKey,
    typeCompatible: (type: string, tagName: string) => defaultTypeCompatible(type, tagName, allowedTypes, allowedTags),
    exactPhrases: (normalizeStringArray(rawRule.exactPhrases, key, 'exactPhrases') ?? []).map(phrase => {
      return tokenize(phrase).join(' ');
    }),
    regexPatterns: compileRegexList(rawRule.regexPatterns, key, 'regexPatterns'),
    autocompleteTokens: normalizeStringArray(rawRule.autocompleteTokens, key, 'autocompleteTokens') ?? [],
    negativePatterns: rawRule.negativePatterns !== undefined
      ? compileRegexList(rawRule.negativePatterns, key, 'negativePatterns')
      : undefined,
    rejectIfMatches: rawRule.rejectIfMatches !== undefined
      ? compileRegexList(rawRule.rejectIfMatches, key, 'rejectIfMatches')
      : undefined,
  };
}

function compileArrayShapeSignatures(raw: unknown): Record<string, string[]> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    console.error(
      'FormFilla: rules.json.__arrayShapeSignatures__ is missing or not a valid object — repeated-block detection ' +
      '(multiple jobs/degrees/etc.) will not work until this is fixed. Falling back to an empty map instead of crashing.'
    );
    return {};
  }

  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = normalizeStringArray(value, '__arrayShapeSignatures__', key);
    if (clean && clean.length > 0) {
      result[key] = clean;
    } else {
      console.warn(`FormFilla: rules.json.__arrayShapeSignatures__["${key}"] is not a valid non-empty string array — skipping it.`);
    }
  }
  return result;
}

/* ===================================================================
   Top-level compilation — wrapped so a rules.json malformed badly
   enough to defeat every guard above still can't stop this module
   (and therefore everything that imports it) from loading.
   =================================================================== */

let compiledRules: Record<string, FieldRule> = {};
let compiledArrayShapeSignatures: Record<string, string[]> = {};

try {
  if (rawRules === null || typeof rawRules !== 'object' || Array.isArray(rawRules)) {
    console.error('FormFilla: rules.json is not a valid object at the top level — no field rules will be available.');
  } else {
    const rawRulesObj = rawRules as Record<string, unknown>;

    for (const [key, raw] of Object.entries(rawRulesObj)) {
      if (key.startsWith('__')) continue;
      try {
        const rule = compileRule(key, raw);
        if (rule) compiledRules[key] = rule;
      } catch (err) {
        console.error(`FormFilla: unexpected error compiling rule "${key}" from rules.json — this rule is unavailable, the rest of the dictionary is unaffected.`, err);
      }
    }

    compiledArrayShapeSignatures = compileArrayShapeSignatures(rawRulesObj.__arrayShapeSignatures__);
  }
} catch (err) {
  console.error('FormFilla: rules.json compilation failed entirely — falling back to empty rule/shape dictionaries instead of failing to load.', err);
  compiledRules = {};
  compiledArrayShapeSignatures = {};
}

export const FIELD_RULES = deepFreeze(compiledRules);

export const arrayShapeSignatures: Record<string, string[]> = deepFreeze(compiledArrayShapeSignatures);