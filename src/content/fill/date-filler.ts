import { DateFieldGroup } from '../../shared/types/index.js';
import { setNativeValue } from './native-setter.js';
import { fillSelect } from './select-filler.js';
import { fillCombobox } from './combobox-adapter.js';
import { FieldFiller, FillContext } from './filler.interface.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Fills a date field from an ISO-ish date string ("YYYY-MM-DD", "YYYY-MM",
 * or a full ISO 8601 timestamp — any trailing time/timezone is ignored, and
 * a trailing "-05:00"-style offset can no longer corrupt the parse the way
 * a naive `.split('-')` would).
 *
 * Handles three field shapes:
 *  - `<input type="date"|"month"|"week">` — native browser value formats,
 *    always zero-padded (an unpadded value silently resets these inputs
 *    to empty, so padding isn't optional).
 *  - `<input type="text">` with a detectable format hint (placeholder,
 *    aria-describedby, aria-label, or title) — any order of day/month/year
 *    (YMD, MDY, DMY, ...), any single-char divider (or none), several
 *    European locale tokens (dd/tt/jj/gg, yyyy/jjjj/aaaa), a 2-digit year
 *    token, and "DD-MON-YYYY"-style literal 3-letter month slots.
 *  - A `DateFieldGroup` of separate month/day/year sub-elements, each of
 *    which may be a native <select> or <input>.
 *
 * Rejects (returns false for) calendar-invalid dates — e.g. month 13 or
 * Feb 30 — rather than silently pushing nonsense into the field.
 *
 * `fillDate` is synchronous and drop-in compatible with the original
 * signature. `fillDateAsync` additionally falls back to `fillCombobox` for
 * date-group sub-elements that are neither <select> nor <input> — common
 * with custom-styled (non-native) dropdowns standing in for month/day/year
 * <select>s. That fallback needs real async waiting (opening a dropdown,
 * waiting for its options to render), which is why it isn't part of the
 * synchronous `fillDate` and is a separate, additive export instead of a
 * signature change.
 */
export function fillDate(field: HTMLInputElement | DateFieldGroup, isoDate: string): boolean {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return false;

  if (isDateFieldGroup(field)) {
    return fillDateGroupSync(field, parsed);
  }

  return fillDateInput(field, parsed);
}

export async function fillDateAsync(field: HTMLInputElement | DateFieldGroup, isoDate: string): Promise<boolean> {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return false;

  if (isDateFieldGroup(field)) {
    return fillDateGroupAsync(field, parsed);
  }

  return fillDateInput(field, parsed);
}

// ============================================================
// Parsing & calendar validation
// ============================================================

interface ParsedDate {
  year: string;   // 4-digit, zero-padded by construction
  month: string;  // 2-digit, zero-padded
  day: string;    // 2-digit, zero-padded
  dayWasExplicit: boolean;
  yearNum: number;
  monthNum: number;
  dayNum: number;
}

// Deliberately tolerant of 1-or-2-digit month/day (so "2024-5-5" still
// parses) and deliberately NOT anchored at the end, so any trailing
// "T10:30:00-05:00" time/timezone suffix is simply left unmatched instead
// of corrupting the parse the way `.split('-')` would.
const ISO_DATE_RE = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/;

function parseIsoDate(isoDate: string): ParsedDate | null {
  if (typeof isoDate !== 'string') return null;

  const match = ISO_DATE_RE.exec(isoDate.trim());
  if (!match) return null;

  const yearNum = parseInt(match[1], 10);
  const monthNum = parseInt(match[2], 10);
  const dayWasExplicit = match[3] !== undefined;
  const dayNum = dayWasExplicit ? parseInt(match[3], 10) : 1;

  if (monthNum < 1 || monthNum > 12) return null;
  if (dayWasExplicit && (dayNum < 1 || dayNum > daysInMonth(yearNum, monthNum))) return null;

  return {
    year: match[1],
    month: monthNum.toString().padStart(2, '0'),
    day: dayNum.toString().padStart(2, '0'),
    dayWasExplicit,
    yearNum,
    monthNum,
    dayNum
  };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return lengths[month - 1] ?? 31;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// Standard ISO-8601 week algorithm: shift to the Thursday of the same week
// (whose calendar year defines the ISO year), then count whole weeks from
// the Monday of week 1 (the week containing Jan 4th, which is always in
// week 1 by definition).
function getIsoWeek(year: number, month: number, day: number): { isoYear: number; isoWeek: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const isoYear = date.getUTCFullYear();

  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);

  const diffDays = Math.round((date.getTime() - week1Monday.getTime()) / 86400000);
  const isoWeek = Math.floor(diffDays / 7) + 1;
  return { isoYear, isoWeek };
}

// ============================================================
// Date-group (separate month / day / year sub-elements)
// ============================================================

function isDateFieldGroup(field: HTMLInputElement | DateFieldGroup): field is DateFieldGroup {
  return 'type' in field && (field as DateFieldGroup).type === 'date-group';
}

function fillDateGroupSync(group: DateFieldGroup, parsed: ParsedDate): boolean {
  const monthName = MONTH_NAMES[parsed.monthNum - 1] ?? '';
  const mOk = fillDateSubElementSync(group.monthEl, parsed.month, [parsed.monthNum.toString(), monthName, monthName.slice(0, 3)]);
  const dOk = fillDateSubElementSync(group.dayEl, parsed.day, [parsed.dayNum.toString(), ordinal(parsed.dayNum)]);
  const yOk = fillDateSubElementSync(group.yearEl, parsed.year, [parsed.yearNum.toString().slice(-2)]);
  return mOk && dOk && yOk;
}

async function fillDateGroupAsync(group: DateFieldGroup, parsed: ParsedDate): Promise<boolean> {
  const monthName = MONTH_NAMES[parsed.monthNum - 1] ?? '';
  const mOk = await fillDateSubElementAsync(group.monthEl, parsed.month, [parsed.monthNum.toString(), monthName, monthName.slice(0, 3)]);
  const dOk = await fillDateSubElementAsync(group.dayEl, parsed.day, [parsed.dayNum.toString(), ordinal(parsed.dayNum)]);
  const yOk = await fillDateSubElementAsync(group.yearEl, parsed.year, [parsed.yearNum.toString().slice(-2)]);
  return mOk && dOk && yOk;
}

function fillDateSubElementSync(el: HTMLElement, primaryValue: string, altValues: string[]): boolean {
  if (el.tagName === 'SELECT') {
    return fillSelectWithCandidates(el as HTMLSelectElement, [primaryValue, ...altValues]);
  }
  if (el.tagName === 'INPUT') {
    return commitTextValue(el as HTMLInputElement, primaryValue);
  }
  return false;
}

async function fillDateSubElementAsync(el: HTMLElement, primaryValue: string, altValues: string[]): Promise<boolean> {
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') {
    return fillDateSubElementSync(el, primaryValue, altValues);
  }
  // Custom-styled (non-native) dropdown standing in for a <select>.
  for (const candidate of [primaryValue, ...altValues]) {
    if (!candidate) continue;
    if (await fillCombobox(el, candidate)) return true;
  }
  return false;
}

function fillSelectWithCandidates(select: HTMLSelectElement, candidates: string[]): boolean {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (fillSelect(select, candidate)) return true;
  }
  return false;
}

// ============================================================
// Single <input> field
// ============================================================

function fillDateInput(input: HTMLInputElement, parsed: ParsedDate): boolean {
  const inputType = (input.type || 'text').toLowerCase();

  if (inputType === 'date') {
    return commitTextValue(input, `${parsed.year}-${parsed.month}-${parsed.day}`);
  }
  if (inputType === 'month') {
    return commitTextValue(input, `${parsed.year}-${parsed.month}`);
  }
  if (inputType === 'week') {
    const { isoYear, isoWeek } = getIsoWeek(parsed.yearNum, parsed.monthNum, parsed.dayNum);
    return commitTextValue(input, `${isoYear}-W${isoWeek.toString().padStart(2, '0')}`);
  }

  const format = detectDateFormat(getFormatHintText(input));
  if (format) {
    const monthName = MONTH_NAMES[parsed.monthNum - 1] ?? '';
    const valueByKind: Record<FormatTokenKind, string> = {
      day: parsed.day,
      month: parsed.month,
      monthName: monthName ? monthName.slice(0, 3) : parsed.month,
      year: parsed.year,
      yearShort: parsed.yearNum.toString().slice(-2).padStart(2, '0')
    };
    const value = format.order.map(kind => valueByKind[kind]).join(format.divider);
    return commitTextValue(input, value);
  }

  return commitTextValue(input, `${parsed.year}-${parsed.month}-${parsed.day}`);
}

// ============================================================
// Format-hint detection (placeholder / aria-describedby / aria-label / title)
// ============================================================

type FormatTokenKind = 'day' | 'month' | 'monthName' | 'year' | 'yearShort';

interface DetectedFormat {
  order: FormatTokenKind[];
  divider: string;
}

const DAY_TOKENS = ['dd', 'tt', 'jj', 'gg'];   // generic/EN, DE "Tag", FR "jour", IT "giorno"
const MONTH_TOKENS = ['mm'];
const MONTH_NAME_TOKENS = ['mmm', 'mon'];      // literal 3-letter month slot, e.g. "DD-MON-YYYY"
const YEAR_TOKENS = ['yyyy', 'jjjj', 'aaaa'];  // EN, DE "Jahr", FR/ES/IT "année/año/anno"
const YEAR_SHORT_TOKENS = ['yy'];

function getFormatHintText(input: HTMLInputElement): string {
  const parts: string[] = [];

  const placeholder = input.getAttribute('placeholder');
  if (placeholder) parts.push(placeholder);

  const describedBy = input.getAttribute('aria-describedby');
  if (describedBy) {
    for (const id of describedBy.split(/\s+/)) {
      const el = document.getElementById(id);
      if (el?.textContent) parts.push(el.textContent);
    }
  }

  const ariaLabel = input.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);

  if (input.title) parts.push(input.title);

  return parts.join(' ');
}

function detectDateFormat(hintText: string): DetectedFormat | null {
  if (!hintText) return null;
  return detectDividedFormat(hintText) ?? detectConcatenatedFormat(hintText);
}

// Primary strategy: tokens separated by a divider (or free-standing words in
// a sentence, e.g. an aria-label). \b-bounded, so "tt" in "little" can never
// match — a real token is never a substring of a longer run of letters.
function detectDividedFormat(hintText: string): DetectedFormat | null {
  const found: Array<{ kind: FormatTokenKind; position: number; length: number }> = [];

  const findFirst = (tokens: string[], kind: FormatTokenKind): boolean => {
    for (const token of tokens) {
      const match = new RegExp(`\\b${token}\\b`, 'i').exec(hintText);
      if (match) {
        found.push({ kind, position: match.index, length: match[0].length });
        return true;
      }
    }
    return false;
  };

  const gotYear = findFirst(YEAR_TOKENS, 'year');
  if (!gotYear) {
    findFirst(YEAR_SHORT_TOKENS, 'yearShort');
  }

  findFirst(DAY_TOKENS, 'day');

  const gotMonthName = findFirst(MONTH_NAME_TOKENS, 'monthName');
  if (!gotMonthName) {
    findFirst(MONTH_TOKENS, 'month');
  }

  if (found.length < 2) return null;

  found.sort((a, b) => a.position - b.position);
  const order = found.map(f => f.kind);

  const first = found[0];
  const afterFirst = hintText.charAt(first.position + first.length);
  const divider = !afterFirst ? '/' : /[a-z]/i.test(afterFirst) ? '' : afterFirst;

  return { order, divider };
}

// Fallback strategy: tokens with NO divider at all, e.g. "MMDDYYYY". \b
// matching can't see inside that (the whole run is one contiguous "word"),
// so instead greedily chain recognized tokens back-to-back with zero gap
// between them, and only accept the chain if it's isolated from any
// surrounding letters — that isolation check is what still keeps "little"
// safe, since "tt" there is never immediately followed by another token.
const ALL_TOKEN_DEFS: Array<{ token: string; kind: FormatTokenKind }> = [
  ...YEAR_TOKENS.map(token => ({ token, kind: 'year' as const })),
  ...MONTH_NAME_TOKENS.map(token => ({ token, kind: 'monthName' as const })),
  ...DAY_TOKENS.map(token => ({ token, kind: 'day' as const })),
  ...MONTH_TOKENS.map(token => ({ token, kind: 'month' as const })),
  ...YEAR_SHORT_TOKENS.map(token => ({ token, kind: 'yearShort' as const }))
].sort((a, b) => b.token.length - a.token.length);

function detectConcatenatedFormat(hintText: string): DetectedFormat | null {
  const lower = hintText.toLowerCase();

  for (let start = 0; start < lower.length; start++) {
    if (/[a-z]/.test(lower[start - 1] ?? '')) continue; // only start at a letter-boundary

    let pos = start;
    const chain: FormatTokenKind[] = [];
    for (;;) {
      const def = ALL_TOKEN_DEFS.find(d => lower.startsWith(d.token, pos));
      if (!def) break;
      chain.push(def.kind);
      pos += def.token.length;
    }

    if (chain.length >= 2 && !/[a-z]/.test(lower[pos] ?? '')) {
      return { order: chain, divider: '' };
    }
  }

  return null;
}

// ============================================================
// Text-value commit, with a masked-input-aware retry
// ============================================================

function commitTextValue(input: HTMLInputElement, value: string): boolean {
  setNativeValue(input, value);
  if (valuesEffectivelyMatch(input.value, value)) return true;

  // Some masked-input libraries (react-input-mask, imask.js, Cleave.js, ...)
  // don't accept a single bulk assignment and only build up their internal
  // formatting state from real sequential keystrokes. Retry that way.
  typeCharactersSync(input, value);
  return valuesEffectivelyMatch(input.value, value);
}

function valuesEffectivelyMatch(actual: string, intended: string): boolean {
  const digitsOnly = (s: string) => s.replace(/\D/g, '');
  const intendedDigits = digitsOnly(intended);
  if (!intendedDigits) return actual.trim() === intended.trim();
  const actualDigits = digitsOnly(actual);
  return actualDigits === intendedDigits || actualDigits.includes(intendedDigits);
}

function typeCharactersSync(input: HTMLInputElement, value: string): void {
  setNativeValueRaw(input, '');
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));

  let current = '';
  for (const char of value) {
    dispatchKeyEvent(input, 'keydown', char);
    dispatchKeyEvent(input, 'keypress', char);
    current += char;
    setNativeValueRaw(input, current);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
    dispatchKeyEvent(input, 'keyup', char);
  }

  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeValueRaw(el: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const nativeSetter = descriptor?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
}

function dispatchKeyEvent(el: HTMLElement, eventName: string, key: string): void {
  const specialCodes: Record<string, number> = { Backspace: 8, Enter: 13, Tab: 9 };
  let code: string;
  let keyCode: number;

  if (key in specialCodes) {
    code = key;
    keyCode = specialCodes[key];
  } else if (/^[a-zA-Z]$/.test(key)) {
    code = `Key${key.toUpperCase()}`;
    keyCode = key.toUpperCase().charCodeAt(0);
  } else if (/^[0-9]$/.test(key)) {
    code = `Digit${key}`;
    keyCode = key.charCodeAt(0);
  } else {
    code = key.length === 1 ? `Key${key}` : key;
    keyCode = key.codePointAt(0) ?? 0;
  }

  el.dispatchEvent(new KeyboardEvent(eventName, {
    key, code, keyCode, which: keyCode, bubbles: true, cancelable: true
  }));
}

export class DateFiller implements FieldFiller {
  supports(el: any, key: string, val: any): boolean {
    return !!(el && typeof el === 'object' && el.type === 'date-group');
  }

  async fill(el: any, val: any, context: FillContext): Promise<boolean> {
    return await fillDateAsync(el, context.stringifyValue(val));
  }
}