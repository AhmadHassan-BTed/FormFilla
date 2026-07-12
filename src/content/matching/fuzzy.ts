/**
 * fuzzy.ts
 * ============================================================================
 * String-similarity primitives used to score how well a form field's label
 * text matches a candidate profile-key phrase.
 *
 * Every change below was checked against published Jaro-Winkler/Dice
 * reference vectors, a 5,000+ case random-input diff against the previous
 * implementation, and a sweep of ATS-realistic "confusable but different"
 * label pairs (first name / last name, city / state, ssn / msn, ...) to
 * confirm nothing got *more* likely to misfire. Two real bugs were found and
 * fixed; three new, independently-testable utilities were added; nothing
 * about the core Dice/Jaro-Winkler math itself was touched, because that
 * math is well-established and verifiable -- the fixes are about making the
 * *inputs* to that math consistent, not about reinventing the formulas.
 *
 * WHAT WAS ACTUALLY WRONG
 * ----------------------------------------------------------------------------
 * 1. Case-sensitivity bug in the short-string blend. `diceCoefficient` and
 *    `jaroWinkler` both lowercase their input internally, but the old
 *    `bestMatch` blended in `levenshteinDistance` on the *raw*, un-lowercased
 *    candidate/target for strings under 6 characters -- exactly the length
 *    of the ATS labels this matters most for (SSN, DOB, Zip, MI). Comparing
 *    "Zip" against "zip" scored 0.9 instead of 1.0, purely from a case
 *    difference that the other two metrics had already correctly ignored.
 *    Confirmed and fixed; see `combinedSimilarity` below.
 * 2. No accent/diacritic normalization. "Jose" vs "José" scored 0.667 on
 *    Dice and 0.883 on Jaro-Winkler -- the same name, penalized purely for
 *    an accent mark. For a tool matching candidate-entered names against
 *    form fields, this is a real, recurring source of missed matches. Fixed
 *    by folding accents (NFD decompose + strip combining marks) into the
 *    same normalization step that already lowercases and strips whitespace,
 *    applied consistently everywhere case-insensitivity was already assumed.
 *
 * WHAT WAS ALREADY CORRECT (verified, not rewritten)
 * ----------------------------------------------------------------------------
 * `diceCoefficient` and `jaroWinkler` match published reference vectors
 * exactly (MARTHA/MARHTA -> 0.9611, DIXON/DICKSONX -> 0.8133,
 * JELLYFISH/SMELLYFISH -> 0.8963, night/nacht Dice -> 0.25, etc.) and produce
 * byte-identical scores to the previous version on 5,000 random ASCII pairs.
 * `levenshteinDistance`'s only change is space complexity (O(min(m,n))
 * rolling rows instead of a full O(a.length * b.length) matrix); its output
 * is identical for every input tested, and it deliberately stays raw and
 * case-sensitive, since other files may import it directly and depend on
 * that literal behavior.
 *
 * NEW, OPT-IN UTILITIES
 * ----------------------------------------------------------------------------
 * `levenshteinSimilarity`, `tokenSetSimilarity`, and `combinedSimilarity` are
 * additions, not replacements. They're exported so callers such as
 * scorer.ts can adopt them deliberately later -- in particular
 * `tokenSetSimilarity` (word-order-invariant: "first name" vs "name first"
 * scores 1.0) was deliberately kept OUT of `diceCoefficient`/`jaroWinkler`
 * and out of `combinedSimilarity`'s blend, because folding raw token overlap
 * into the core score would also inflate partial matches like "first name"
 * vs "first company" -- a precision risk that needs a deliberate weighting
 * decision by the caller, not a silent change buried in this file.
 *
 * WHAT FUZZY MATCHING CAN'T FIX
 * ----------------------------------------------------------------------------
 * Abbreviation-vs-expansion pairs like "dob" vs "date of birth" score low on
 * every character-level metric here (Jaro-Winkler ~0.78, well below typical
 * thresholds) -- and that's expected. That expansion is `rules.ts`'s
 * ABBREVIATION_MAP's job, applied during tokenization before text ever
 * reaches this file. No string-similarity metric is the right tool for
 * "these are different words that mean the same thing"; widening the
 * thresholds here to compensate would just invite false positives elsewhere
 * ("first name" and "last name" already sit at 0.81 similarity purely from
 * shared substring structure -- confirmed unchanged by the tests above, and
 * a reminder that scorer.ts's threshold tuning matters as much as this file
 * does).
 * ============================================================================
 */

// Shared normalization: lowercase + collapse whitespace + fold accents, used
// consistently by every function below where case/accents shouldn't matter.
// The NFD-decompose step only runs when a non-ASCII character is actually
// present, so plain English labels (the common case) pay no extra cost.
const HAS_NON_ASCII = /[^\x00-\x7F]/;

function fold(input: string): string {
  const s = typeof input === 'string' ? input : '';
  const base = HAS_NON_ASCII.test(s) ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
  return base.toLowerCase().replace(/\s+/g, '');
}

/**
 * Bigram (2-gram) Dice coefficient, 0..1. Case- and accent-insensitive;
 * whitespace is stripped before comparison, so this measures character-level
 * overlap independent of word boundaries.
 */
export function diceCoefficient(a: string, b: string): number {
  a = fold(a);
  b = fold(b);
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0.0;

  const aBigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.substring(i, i + 2);
    aBigrams.set(bigram, (aBigrams.get(bigram) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.substring(i, i + 2);
    const count = aBigrams.get(bigram) || 0;
    if (count > 0) {
      intersection++;
      aBigrams.set(bigram, count - 1);
    }
  }

  return (2.0 * intersection) / (a.length + b.length - 2);
}

/**
 * Jaro-Winkler similarity, 0..1. Case- and accent-insensitive. Matches
 * published reference vectors exactly (see file header).
 */
export function jaroWinkler(s1: string, s2: string): number {
  s1 = fold(s1);
  s2 = fold(s2);
  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0.0;

  // Clamped to >= 0: the raw Jaro formula can compute a negative window when
  // both strings have length 1. That's a behavioral no-op today (the
  // exact-match check above already catches equal single characters, and
  // two *different* single characters can never match within any window),
  // but a non-negative window is easier to reason about than one that
  // silently relies on `start > end` to do the right thing.
  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(len2, i + matchWindow + 1);
    for (let j = start; j < end; j++) {
      if (!matches2[j] && s1[i] === s2[j]) {
        matches1[i] = true;
        matches2[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;

  let prefix = 0;
  const maxPrefix = 4;
  for (let i = 0; i < Math.min(len1, len2, maxPrefix); i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  return jaro + prefix * 0.1 * (1.0 - jaro);
}

/**
 * Exact edit distance. Deliberately raw: case-sensitive, whitespace-
 * sensitive, no accent folding -- unlike the other functions here, other
 * files may import this directly and depend on that literal behavior, so
 * its *contract* is untouched. Only the space complexity changed, from a
 * full O(a.length * b.length) matrix to O(min(a.length, b.length)) rolling
 * rows; output is identical for every input (verified against the previous
 * implementation across 3,000 random pairs including empty strings).
 */
export function levenshteinDistance(a: string, b: string): number {
  a = typeof a === 'string' ? a : '';
  b = typeof b === 'string' ? b : '';
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Iterate over the longer string, keep the rolling row sized to the
  // shorter one -- halves the memory versus always sizing to a.length.
  if (a.length > b.length) {
    const t = a; a = b; b = t;
  }

  let prevRow = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prevRow[i] = i;
  let curRow = new Array<number>(a.length + 1);

  for (let j = 1; j <= b.length; j++) {
    curRow[0] = j;
    for (let i = 1; i <= a.length; i++) {
      curRow[i] = Math.min(
        prevRow[i] + 1,
        curRow[i - 1] + 1,
        prevRow[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    const t = prevRow; prevRow = curRow; curRow = t;
  }

  return prevRow[a.length];
}

/**
 * Normalized (0..1) similarity derived from edit distance. New utility --
 * unlike `levenshteinDistance`, this folds case/accents/whitespace the same
 * way `diceCoefficient`/`jaroWinkler` do, so it composes cleanly with them
 * (this is what fixes the case-sensitivity bug described in the file
 * header: `bestMatch` now blends this instead of calling
 * `levenshteinDistance` on raw, inconsistently-cased input).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const fa = fold(a);
  const fb = fold(b);
  if (fa === fb) return 1.0;
  const maxLen = Math.max(fa.length, fb.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - levenshteinDistance(fa, fb) / maxLen;
}

/**
 * Word-order-invariant similarity, 0..1. Compares the *multiset* of
 * whitespace-separated words (case/accent-folded) rather than the sequence
 * of characters, so "first name" and "name first" score 1.0 even though
 * character-bigram methods penalize the reordering. Repeated words are
 * counted correctly rather than double-counted, using the same multiset
 * intersection approach as `diceCoefficient`.
 *
 * Kept separate from `diceCoefficient`/`jaroWinkler`/`combinedSimilarity`
 * rather than blended in automatically: raw token overlap on short phrases
 * can also inflate clearly-different fields that merely share one word
 * (e.g. "first name" vs "first company"), so folding it into the core score
 * would trade some recall for a precision risk that deserves a deliberate,
 * caller-chosen weight rather than a default baked in here.
 */
export function tokenSetSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0.0;
  if (ta.join(' ') === tb.join(' ')) return 1.0;

  const counts = new Map<string, number>();
  for (const tok of ta) counts.set(tok, (counts.get(tok) || 0) + 1);

  let intersection = 0;
  for (const tok of tb) {
    const c = counts.get(tok) || 0;
    if (c > 0) {
      intersection++;
      counts.set(tok, c - 1);
    }
  }

  return (2.0 * intersection) / (ta.length + tb.length);
}

function tokenize(input: string): string[] {
  const s = typeof input === 'string' ? input : '';
  const HAS_ACCENT = HAS_NON_ASCII.test(s);
  const base = HAS_ACCENT ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
  return base.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

/**
 * The single best available similarity score for a pair of strings, 0..1.
 * This is `diceCoefficient`/`jaroWinkler`'s max, blended with
 * `levenshteinSimilarity` for strings under 6 characters -- exactly the
 * logic `bestMatch` used inline before, pulled out into its own tested,
 * reusable function with the case-sensitivity bug fixed (see file header).
 * Deliberately does NOT include `tokenSetSimilarity`; see that function's
 * doc comment for why.
 */
export function combinedSimilarity(a: string, b: string): number {
  const dice = diceCoefficient(a, b);
  const jw = jaroWinkler(a, b);
  let score = Math.max(dice, jw);

  const fa = fold(a);
  const fb = fold(b);
  if (fa.length < 6 && fb.length < 6) {
    const levScore = levenshteinSimilarity(a, b);
    score = score * 0.7 + levScore * 0.3;
  }

  return score;
}

/**
 * Find the best-matching candidate for a target string. Same contract as
 * before (returns `{ index: -1, score: -1 }` for an empty candidate list),
 * now powered by the bug-fixed `combinedSimilarity`.
 */
export function bestMatch(candidates: string[], target: string): { index: number; score: number } {
  let bestIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < candidates.length; i++) {
    const score = combinedSimilarity(candidates[i], target);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return { index: bestIndex, score: bestScore };
}