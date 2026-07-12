import { DEGREE_RANK } from '../../shared/constants/constants.js';

/**
 * Path resolver — the "last mile" that turns a matched field key (e.g.
 * "personal.email", "experience[0].title", "education.highest.degree",
 * "documents.resume") into an actual value from the candidate's profile.
 *
 * Hardened for the same two complaints as orchestrator.ts — missing
 * fields and wrong fields — specifically:
 *
 *  1. documents.* was silently broken. `obj.documents?.[path]` indexed
 *     with the FULL path string (e.g. "documents.resume") instead of
 *     the part after the "documents." prefix, so it could only ever
 *     find a key literally named "documents.resume" — which no real
 *     profile has. Every resume/cover-letter upload was resolving to
 *     undefined, no matter what. Fixed below.
 *  2. Degree-name matching used raw, unbounded substring search
 *     (norm.includes(key)) with no punctuation normalization and no
 *     preference for the most specific match. Plain .includes() has no
 *     concept of a word boundary, so "ba" is a literal substring of
 *     "mba" — whichever key JSON happened to iterate first decided
 *     whether an MBA got ranked as a Bachelor's or a Master's. Replaced
 *     with normalized, word-boundary, longest-match-first matching,
 *     plus a conservative typo-tolerant fallback as a last resort —
 *     never on short abbreviations, where a 1-character edit can mean
 *     a genuinely different degree level (e.g. "ba" -> "ma").
 *  3. The generic path walker had no defense against a stray/duplicated
 *     separator in a scorer-produced key, and would happily index into
 *     a string/number primitive (JS allows "abc"[0]), occasionally
 *     handing back a single stray character as a "value" instead of
 *     failing cleanly. Both are guarded now.
 *  4. Every field resolving under education.highest.* used to re-sort
 *     the whole education array and re-rank every degree from scratch
 *     — wasteful when a form asks for degree, major, school, AND
 *     graduation year as four separate fields against the identical
 *     profile snapshot. The winning entry is now cached per education
 *     array reference.
 *
 * Every entry point fails closed: on any unexpected error it returns
 * undefined / a safe default rather than throwing, so an odd profile
 * shape degrades one field to "unmapped" instead of risking a crash
 * that takes the batch down with it.
 */

/* ===================================================================
   Small generic utilities
   =================================================================== */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Standard Levenshtein edit distance (iterative DP, O(n) space). */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = new Array(n + 1);
  let currRow = new Array(n + 1);
  for (let j = 0; j <= n; j++) prevRow[j] = j;

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,       // deletion
        currRow[j - 1] + 1,   // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    const tmp = prevRow;
    prevRow = currRow;
    currRow = tmp;
  }

  return prevRow[n];
}

/* ===================================================================
   Degree normalization + ranking
   =================================================================== */

function normalizeDegreeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,'’()]/g, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface DegreeIndexEntry {
  key: string;
  rank: number;
  regex: RegExp;
}

let degreeIndexCache: DegreeIndexEntry[] | null = null;

function getDegreeIndex(): DegreeIndexEntry[] {
  if (degreeIndexCache) return degreeIndexCache;

  try {
    const source = DEGREE_RANK as Record<string, number>;
    const entries: DegreeIndexEntry[] = Object.entries(source)
      .map(([rawKey, rank]) => {
        const key = normalizeDegreeText(rawKey);
        return key ? { key, rank, regex: new RegExp(`\\b${escapeRegExp(key)}\\b`) } : null;
      })
      .filter((e): e is DegreeIndexEntry => e !== null)
      // Longest normalized key first: when a degree name matches more
      // than one dictionary key as a whole word/phrase (e.g. both
      // "bachelor" and "bachelor of science" match inside "bachelor of
      // science in nursing"), the more specific one should win.
      .sort((a, b) => b.key.length - a.key.length);
    degreeIndexCache = entries;
  } catch (err) {
    console.error('FormFilla: failed to build degree ranking index — degree ranking disabled', err);
    degreeIndexCache = [];
  }

  return degreeIndexCache;
}

export function getDegreeRank(degreeName: string): number {
  try {
    if (!degreeName || typeof degreeName !== 'string') return 0;
    const norm = normalizeDegreeText(degreeName);
    if (!norm) return 0;

    const index = getDegreeIndex();

    // 1. Exact match on the normalized dictionary key.
    for (const entry of index) {
      if (entry.key === norm) return entry.rank;
    }

    // 2. Word-boundary match, longest key wins (index is pre-sorted
    //    longest-first, so the first hit is already the most specific).
    //    A word boundary can't occur in the middle of a single word, so
    //    this alone already stops "ba" from matching inside "alabama"
    //    or "mba" — the longest-match-first ordering handles the
    //    remaining case where a shorter AND a longer key both
    //    legitimately match (e.g. "bachelor" vs "bachelor of science").
    for (const entry of index) {
      if (entry.regex.test(norm)) return entry.rank;
    }

    // 3. Last resort: tolerate a typo, but only against the FULL
    //    normalized string and only for reasonably long keys/input.
    //    Short abbreviations are excluded on purpose — "ba" -> "ma" is
    //    one edit apart but a different degree level entirely, so
    //    fuzzy-matching short tokens would trade missed fields for
    //    wrong ones, which is worse.
    if (norm.length >= 6) {
      let best: { rank: number; distance: number } | null = null;
      for (const entry of index) {
        if (entry.key.length < 6) continue;
        const maxDistance = Math.floor(Math.max(entry.key.length, norm.length) * 0.2);
        if (Math.abs(entry.key.length - norm.length) > maxDistance) continue; // cheap pre-filter
        const distance = levenshteinDistance(norm, entry.key);
        if (distance <= maxDistance && (!best || distance < best.distance)) {
          best = { rank: entry.rank, distance };
        }
      }
      if (best) return best.rank;
    }

    return 1;
  } catch (err) {
    console.error(`FormFilla: getDegreeRank failed for "${degreeName}"`, err);
    return 1;
  }
}

/* ===================================================================
   Generic path traversal — shared by every branch below so there's
   exactly one place that knows how to walk a dotted/bracketed path.
   =================================================================== */

function splitPath(path: string): string[] {
  return path
    .replace(/\]/g, '')
    .split(/[.[]/)
    .filter(part => part.length > 0); // tolerate "a..b" / ".a.b" / "a.b." from an upstream formatting slip
}

function traverse(obj: any, path: string): any {
  if (obj === undefined || obj === null || !path) return undefined;

  const parts = splitPath(path);
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    if (typeof current !== 'object') return undefined; // don't index into "abc"[0] -> "a"
    current = current[part];
  }
  return current;
}

/* ===================================================================
   education.highest.* — pick the highest-ranked degree in the array,
   then resolve a field on it. Cached per education-array reference so
   several fields resolving under the same "highest" entry (degree,
   major, school, graduation year...) don't each re-sort and re-rank
   the whole list from scratch.
   =================================================================== */

const highestEducationCache = new WeakMap<object, any>();

function extractYear(value: any): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && value >= 1900 && value <= 2100) return value;
  if (typeof value === 'string') {
    const match = value.match(/(19|20)\d{2}/);
    if (match) return parseInt(match[0], 10);
  }
  if (value instanceof Date && !isNaN(value.getTime())) return value.getFullYear();
  return null;
}

/** Best-effort recency signal, used only to break ties between two same-ranked degrees. */
function mostRecentYear(entry: any): number {
  if (!entry || typeof entry !== 'object') return -Infinity;
  if (entry.current === true) return new Date().getFullYear();

  const candidates = [
    entry.graduationYear, entry.endYear, entry.year,
    entry.endDate, entry.graduationDate, entry.completionDate, entry.date,
  ];
  for (const candidate of candidates) {
    const year = extractYear(candidate);
    if (year !== null) return year;
  }
  return -Infinity;
}

function resolveHighestEducation(obj: any, field: string): any {
  const educationList = obj.education;
  if (!Array.isArray(educationList) || educationList.length === 0) {
    return undefined;
  }

  let highest = highestEducationCache.get(educationList);
  if (highest === undefined) {
    const ranked = educationList
      .map((entry: any, originalIndex: number) => ({
        entry,
        originalIndex,
        rank: getDegreeRank(entry?.degree)
      }))
      .sort((a: any, b: any) => {
        if (b.rank !== a.rank) return b.rank - a.rank;
        const recencyDiff = mostRecentYear(b.entry) - mostRecentYear(a.entry);
        if (recencyDiff !== 0) return recencyDiff;
        return a.originalIndex - b.originalIndex; // stable fallback — matches original behavior when no recency signal exists
      });
    highest = ranked[0].entry;
    highestEducationCache.set(educationList, highest);
  }

  return field ? traverse(highest, field) : highest;
}

/* ===================================================================
   Entry point
   =================================================================== */

export function getValueByPath(obj: any, path: string): any {
  try {
    if (!obj || typeof obj !== 'object') return undefined;
    if (!path || typeof path !== 'string') return undefined;

    const trimmedPath = path.trim();
    if (!trimmedPath) return undefined;

    if (trimmedPath === 'personal.mobilePhone') {
      const val = traverse(obj, 'personal.mobilePhone');
      return val !== undefined && val !== null && val !== '' ? val : traverse(obj, 'personal.phone');
    }

    if (trimmedPath === 'personal.nationalIdType') {
      const val = traverse(obj, 'personal.nationalIdType');
      return val !== undefined && val !== null && val !== '' ? val : 'National ID';
    }

    if (trimmedPath === 'personal.languages') {
      const val = traverse(obj, 'personal.languages');
      if (val !== undefined && val !== null && val !== '') return val;
      const langs = (obj as any).languages;
      if (Array.isArray(langs)) {
        return langs.map((l: any) => typeof l === 'object' && l ? l.language : String(l));
      }
      return undefined;
    }

    if (trimmedPath.endsWith('.startMonth')) {
      const parentPath = trimmedPath.substring(0, trimmedPath.length - '.startMonth'.length);
      const dateVal = getValueByPath(obj, `${parentPath}.startDate`);
      if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString('en-US', { month: 'long' }); // e.g. "January"
        }
      }
      return undefined;
    }
    if (trimmedPath.endsWith('.startYear')) {
      const parentPath = trimmedPath.substring(0, trimmedPath.length - '.startYear'.length);
      const dateVal = getValueByPath(obj, `${parentPath}.startDate`);
      if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          return d.getFullYear().toString();
        }
      }
      return undefined;
    }
    if (trimmedPath.endsWith('.endMonth')) {
      const parentPath = trimmedPath.substring(0, trimmedPath.length - '.endMonth'.length);
      const dateVal = getValueByPath(obj, `${parentPath}.endDate`);
      if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString('en-US', { month: 'long' }); // e.g. "January"
        }
      }
      return undefined;
    }
    if (trimmedPath.endsWith('.endYear')) {
      const parentPath = trimmedPath.substring(0, trimmedPath.length - '.endYear'.length);
      const dateVal = getValueByPath(obj, `${parentPath}.endDate`);
      if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          return d.getFullYear().toString();
        }
      }
      return undefined;
    }

    if (trimmedPath.startsWith('education.highest.')) {
      return resolveHighestEducation(obj, trimmedPath.substring('education.highest.'.length));
    }

    if (trimmedPath.startsWith('documents.')) {
      // obj.documents?.[path] in the original used the FULL path
      // (including the "documents." prefix) as the lookup key, so it
      // could only ever match a key literally named "documents.resume"
      // — which no real profile object has. Strip the prefix and
      // traverse the remainder against obj.documents instead.
      const remainder = trimmedPath.substring('documents.'.length);
      return remainder ? traverse(obj.documents, remainder) : obj.documents;
    }

    return traverse(obj, trimmedPath);
  } catch (err) {
    console.error(`FormFilla: getValueByPath failed for path "${path}"`, err);
    return undefined;
  }
}