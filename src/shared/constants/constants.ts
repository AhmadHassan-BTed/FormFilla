import rawAbbreviations from './abbreviations.json' with { type: 'json' };
import rawDegrees from './degrees.json' with { type: 'json' };

/**
 * Shared constants + compiled dictionaries for the matching engine.
 *
 * Hardened here specifically because these two JSON files are, by
 * design (see the README's "AI-Driven Dictionary Expansion" section),
 * meant to be hand-edited or AI-edited directly — outside the
 * type-checked build. That makes a malformed entry here the single
 * most likely place bad data enters the whole pipeline, and this
 * module sits upstream of everything (scorer.ts, value-path.ts, the
 * normalizer) that depends on it.
 *
 *  1. Values were trusted with a bare `as string` / `as number` cast
 *     and no runtime check. A single wrong-typed entry (a number typed
 *     as a string, a nested object where a string was expected) used
 *     to pass straight through into the compiled map and surface as a
 *     confusing failure two or three files away. Every entry is now
 *     validated against the type it's supposed to have; anything that
 *     doesn't match is skipped with a console.warn identifying exactly
 *     which key and file, instead of silently corrupting the map.
 *  2. Keys that differ only by case/whitespace (e.g. "Bachelor" vs
 *     "bachelor") survive JSON parsing as two separate entries and can
 *     silently disagree with each other. That's now detected and
 *     flagged — both entries are kept (nothing gets dropped), but you
 *     get a warning pointing at the exact collision instead of
 *     unpredictable matching behavior downstream.
 *  3. If either JSON file were ever malformed at the top level (not a
 *     plain object — empty, an array, etc.), compilation used to throw
 *     during module evaluation. Since every other file in this
 *     extension imports from here, that's not "one field breaks" —
 *     that's the entire content script failing to load. Compilation
 *     now fails closed to an empty dictionary with a loud console.error
 *     instead of taking the whole extension down with it.
 *  4. The exported maps are frozen (Object.freeze) so nothing
 *     downstream can accidentally mutate dictionaries that are meant
 *     to be shared, read-only state across the whole matching engine.
 *  5. CONFIRM_PATTERN only recognized "confirm / repeat / verify".
 *     Common real-world phrasings like "Re-enter password" or "Retype
 *     email" didn't match at all, meaning those fields wouldn't be
 *     recognized as confirmation fields — a direct miss. Extended the
 *     pattern, but deliberately did NOT add generic words like "again"
 *     or "match" — those show up in plenty of unrelated application
 *     questions ("Are you reapplying again?") and would trade a recall
 *     win for a real precision loss.
 *
 * HIGH_THRESHOLD / LOW_THRESHOLD are left at their existing values —
 * I have no visibility into scorer.ts's actual score distribution, and
 * guessing at "better" numbers without that data would be as likely to
 * hurt precision or recall as help it. A structural sanity check was
 * added instead (HIGH_THRESHOLD must be a finite number greater than
 * LOW_THRESHOLD), which catches a future editing mistake without
 * presuming to know the "correct" calibration.
 */

export const HIGH_THRESHOLD = 50;
export const LOW_THRESHOLD = 15;
export const DEBOUNCE_MS = 400;

if (
  !Number.isFinite(HIGH_THRESHOLD) ||
  !Number.isFinite(LOW_THRESHOLD) ||
  HIGH_THRESHOLD <= LOW_THRESHOLD
) {
  console.error(
    `FormFilla: HIGH_THRESHOLD (${HIGH_THRESHOLD}) and LOW_THRESHOLD (${LOW_THRESHOLD}) are misconfigured — ` +
    'HIGH_THRESHOLD must be a finite number strictly greater than LOW_THRESHOLD, or confidence gating downstream will misbehave.'
  );
}

// Recognizes fields asking the candidate to re-enter a value for
// verification (e.g. "Confirm Password", "Re-enter Email", "Retype
// Password", "Double-check email"). Substring matching (no word
// boundaries) is intentional here, unlike the degree matcher in
// value-path.ts — these are distinctive enough words/phrases that
// letting "confirm" also catch "confirmation" / "reconfirm" /
// "unconfirmed" is a recall win with no real collision risk.
export const CONFIRM_PATTERN = /confirm|repeat|verify|re-?enter|re-?type|double[\s-]?check/i;

/* ===================================================================
   Dictionary compilation — shared logic for both JSON sources so
   validation, duplicate detection, and failure handling only need to
   be written (and trusted) once.
   =================================================================== */

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function compileDictionary<T>(
  source: unknown,
  sourceName: string,
  isValidValue: (v: unknown) => v is T
): Record<string, T> {
  const result: Record<string, T> = {};

  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    console.error(
      `FormFilla: ${sourceName} is not a valid dictionary object (got ${Array.isArray(source) ? 'an array' : typeof source}) — ` +
      'proceeding with an empty dictionary instead of failing the whole module.'
    );
    return result;
  }

  // normalized (case/whitespace-insensitive) key -> original key, purely
  // to detect and warn about likely-unintentional duplicates.
  const seenNormalized = new Map<string, string>();

  for (const [rawKey, rawVal] of Object.entries(source as Record<string, unknown>)) {
    if (rawKey.startsWith('__')) continue; // metadata / documentation entries, e.g. __meta__

    const key = rawKey.trim();
    if (!key) {
      console.warn(`FormFilla: ${sourceName} has an empty/whitespace-only key — skipping it.`);
      continue;
    }

    if (!isValidValue(rawVal)) {
      console.warn(`FormFilla: ${sourceName}["${rawKey}"] has an unexpected value type — skipping it instead of trusting an unchecked cast.`);
      continue;
    }

    const normalized = key.toLowerCase();
    const existing = seenNormalized.get(normalized);
    if (existing !== undefined && existing !== key) {
      console.warn(
        `FormFilla: ${sourceName} has two keys that differ only by case/whitespace ("${existing}" and "${key}") — ` +
        'both are kept, but this is almost certainly unintentional and can cause inconsistent matching depending on which one a lookup happens to see first.'
      );
    }
    seenNormalized.set(normalized, key);

    result[key] = rawVal;
  }

  return result;
}

export const ABBREVIATION_MAP = Object.freeze(
  compileDictionary(rawAbbreviations, 'abbreviations.json', isNonEmptyString)
);

export const DEGREE_RANK = Object.freeze(
  compileDictionary(rawDegrees, 'degrees.json', isFiniteNumber)
);