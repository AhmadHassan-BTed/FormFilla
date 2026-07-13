import { DateFieldGroup } from '../../shared/types/index.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * ARIA widget roles that behave like form fields even when they aren't built
 * from native <input>/<select>/<textarea> elements. This is what lets the
 * scanner see custom components from React Select, Radix, MUI, Ant Design,
 * Reach UI, and similar libraries, which render the real "field" as a
 * styled <div>/<button> rather than a native control.
 */
const ARIA_WIDGET_ROLES = [
  'combobox',
  'listbox',
  'textbox',
  'searchbox',
  'spinbutton',
  'slider',
  'switch',
  'checkbox',
  'radio',
  'menuitemcheckbox',
  'menuitemradio'
] as const;

/** Input types that can never carry user-entered data. */
const NON_FIELD_INPUT_TYPES = ['hidden', 'submit', 'button', 'reset', 'image'] as const;

/** As above, plus radio/checkbox: those are real fields on their own, but
 *  they can never be one of the three *parts* of a month/day/year group. */
const NON_DATE_PART_INPUT_TYPES = new Set<string>([...NON_FIELD_INPUT_TYPES, 'radio', 'checkbox']);

const inputExclusions = NON_FIELD_INPUT_TYPES.map(t => `:not([type=${t}])`).join('');
const datePartInputExclusions = `${inputExclusions}:not([type=radio]):not([type=checkbox])`;

/** Everything the scanner treats as a candidate field. */
const FIELD_SELECTOR = [
  `input${inputExclusions}`,
  'select',
  'textarea',
  '[contenteditable]',
  ...ARIA_WIDGET_ROLES.map(role => `[role=${role}]`)
].join(', ');

/** Narrower selector for testing whether a *wrapper* element contains a
 *  single date-part control (radio/checkbox never count as a date part). */
const DATE_PART_SELECTOR = [`input${datePartInputExclusions}`, 'select'].join(', ');

/**
 * How many ancestor levels above a date-part candidate to consider as a
 * possible grouping container. Component libraries commonly wrap each date
 * part in its own <div> for styling, so the true month/day/year container
 * usually sits 1-2 levels above the actual <select>/<input>, not as its
 * direct parent. Bounded so the search can't accidentally weld together
 * unrelated date fields that merely share a distant ancestor.
 */
const MAX_CONTAINER_ANCESTOR_DEPTH = 3;

const MONTH_TOKENS = new Set(['month', 'mon', 'mo', 'mm']);
const DAY_TOKENS = new Set(['day', 'dd', 'dom']);
const YEAR_TOKENS = new Set(['year', 'yr', 'yyyy', 'yy']);
const MONTH_NAME_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

// Confidence weights used by the date-part assignment search below. Naming
// signals (exact token matches) are unambiguous and score highest; <select>
// option-*shape* inference is a fallback, used only when a field has no
// naming signal at all, so it's scored lower.
const SCORE_EXACT_TOKEN = 100;
const SCORE_NATIVE_MONTH_INPUT = 95;
const SCORE_MONTH_NAME_OPTIONS = 95;
const SCORE_YEAR_RANGE_PROFILE = 70;
const SCORE_COUNT_PROFILE = 55;

// =============================================================================
// Visibility & fillability
// =============================================================================

function getOwnerDocument(node: Document | Element | ShadowRoot): Document {
  if (node.nodeType === Node.DOCUMENT_NODE) return node as Document;
  return (node as Element | ShadowRoot).ownerDocument as Document;
}

function getStyle(el: Element): CSSStyleDeclaration {
  const view = el.ownerDocument?.defaultView ?? window;
  return view.getComputedStyle(el);
}

/** Duck-typed, realm-safe "is this a ShadowRoot" check. `instanceof`
 *  breaks across document/iframe realms; property shape does not. */
function asShadowHost(rootNode: Node): Element | null {
  if (rootNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in rootNode) {
    return (rootNode as ShadowRoot).host;
  }
  return null;
}

function isSelfHidden(el: Element): boolean {
  const htmlEl = el as HTMLElement & { inert?: boolean };
  if (htmlEl.hidden) return true;
  if (htmlEl.inert) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;

  const style = getStyle(el);
  if (style.display === 'none') return true;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return true;

  return false;
}

/**
 * Whether `el` is currently rendered and reachable. Walks every ancestor -
 * bridging shadow-DOM boundaries via the shadow host - so a field buried
 * inside a collapsed step, an inactive tab panel, or content behind an
 * inert modal backdrop is never reported as live. Deliberately does NOT
 * exclude based on opacity or off-screen positioning: those techniques are
 * routinely used to visually hide a *functional* native control behind
 * custom-styled UI (custom checkboxes/radios, styled file pickers), and
 * excluding them would turn a real, fillable field into a missed one.
 * Per-element results are memoized in `cache` since sibling fields usually
 * share most of their ancestor chain.
 */
function isElementVisible(el: Element, cache: Map<Element, boolean>): boolean {
  if (!el.isConnected) return false;

  const isFileInput = el instanceof HTMLInputElement && el.type === 'file';
  if (!isFileInput) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
  }

  let current: Element | null = el;
  while (current) {
    let hidden = cache.get(current);
    if (hidden === undefined) {
      if (isFileInput && current === el) {
        const htmlEl = current as HTMLElement & { inert?: boolean };
        hidden = htmlEl.hidden || htmlEl.inert || current.getAttribute('aria-hidden') === 'true';
      } else {
        hidden = isSelfHidden(current);
      }
      cache.set(current, hidden);
    }
    if (hidden) return false;

    current = current.parentElement ?? asShadowHost(current.getRootNode());
  }

  return true;
}

function isDisabled(el: Element): boolean {
  if ((el as HTMLElement & { disabled?: boolean }).disabled) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  return false;
}

function isExplicitlyNonEditable(el: Element): boolean {
  if (!el.hasAttribute('contenteditable')) return false;

  // isContentEditable reflects the browser's fully-resolved determination
  // ("true" / "" / inherited states all correctly read as editable), so
  // prefer it. Fall back to the raw attribute only if the host environment
  // hasn't implemented the property (it's a boolean per spec, so anything
  // else means it's unsupported rather than a real "false").
  const resolved = (el as HTMLElement).isContentEditable;
  if (typeof resolved === 'boolean') return !resolved;
  return el.getAttribute('contenteditable') === 'false';
}

function isFillableCandidate(el: Element, cache: Map<Element, boolean>): boolean {
  if (isDisabled(el)) return false;
  if (isExplicitlyNonEditable(el)) return false;
  return isElementVisible(el, cache);
}

// =============================================================================
// Date-part signal detection
// =============================================================================

/**
 * Splits an identifier into lowercase tokens on any non-alphanumeric
 * separator *and* camelCase boundaries, e.g. "dob_mm" -> ["dob","mm"],
 * "birthMonth" -> ["birth","month"]. Using exact token equality instead of
 * bare substring regexes is what keeps "address" (contains "dd") and
 * "comment" / "recommend" (contain "mm") from being misread as day/month
 * fields - a real bug in naive substring matching.
 */
function getFieldNameTokens(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

interface SelectProfile {
  numericCount: number;
  monthNameCount: number;
  allNumericInRange: (min: number, max: number) => boolean;
}

function analyzeSelectOptions(select: HTMLSelectElement): SelectProfile {
  const numericValues: number[] = [];
  let monthNameCount = 0;

  for (const opt of Array.from(select.options)) {
    const raw = (opt.text || opt.value || '').trim();
    if (!raw) continue;

    if (MONTH_NAME_RE.test(raw)) {
      monthNameCount++;
      continue;
    }
    if (/^\d{1,4}$/.test(raw)) {
      numericValues.push(Number(raw));
    }
  }

  return {
    numericCount: numericValues.length,
    monthNameCount,
    allNumericInRange(min: number, max: number) {
      return numericValues.length > 0 && numericValues.every(v => v >= min && v <= max);
    }
  };
}

interface DatePartScore {
  month: number;
  day: number;
  year: number;
}

/**
 * Scores how strongly `el` reads as each date-group role. Name/id/
 * placeholder/aria-label tokens are the strongest, unambiguous signal.
 * <select> option *shape* (12 numbered options, a 1900-2100 numeric range,
 * etc.) is used only as a fallback when there's no naming signal at all,
 * and scored lower, since option-shape coincidences (e.g. a "team size"
 * 1-10 dropdown) are more plausible than a field being explicitly named
 * "month" / "dd" / "yyyy" by accident.
 */
function scoreDatePartSignal(el: HTMLSelectElement | HTMLInputElement): DatePartScore {
  const textSignal = [el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label')]
    .filter(Boolean)
    .join(' ');

  const tokens = getFieldNameTokens(textSignal);

  const score: DatePartScore = {
    month: tokens.some(t => MONTH_TOKENS.has(t)) ? SCORE_EXACT_TOKEN : 0,
    day: tokens.some(t => DAY_TOKENS.has(t)) ? SCORE_EXACT_TOKEN : 0,
    year: tokens.some(t => YEAR_TOKENS.has(t)) ? SCORE_EXACT_TOKEN : 0
  };

  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'month') {
    score.month = Math.max(score.month, SCORE_NATIVE_MONTH_INPUT);
  }

  if (el.tagName === 'SELECT') {
    const profile = analyzeSelectOptions(el as HTMLSelectElement);

    if (profile.monthNameCount >= 6) {
      score.month = Math.max(score.month, SCORE_MONTH_NAME_OPTIONS);
    }
    if (score.month === 0 && profile.numericCount === 12 && profile.allNumericInRange(1, 12)) {
      score.month = SCORE_COUNT_PROFILE;
    }
    if (
      score.day === 0 &&
      profile.numericCount >= 28 &&
      profile.numericCount <= 31 &&
      profile.allNumericInRange(1, 31)
    ) {
      score.day = SCORE_COUNT_PROFILE;
    }
    if (score.year === 0 && profile.numericCount >= 2 && profile.allNumericInRange(1900, 2100)) {
      score.year = SCORE_YEAR_RANGE_PROFILE;
    }
  }

  return score;
}

interface DatePartAssignment {
  monthEl: HTMLSelectElement | HTMLInputElement;
  dayEl: HTMLSelectElement | HTMLInputElement;
  yearEl: HTMLSelectElement | HTMLInputElement;
}

/**
 * Finds the highest-confidence way to assign three *distinct* elements from
 * `children` to the month/day/year roles. This is a small assignment
 * problem: brute-forcing every valid (month, day, year) triple and keeping
 * the one with the best combined score is exact, and for the handful of
 * candidates a date-group container ever has, effectively free - far more
 * robust than a first-match-wins scan when a field's name is ambiguous.
 */
function assignDateParts(
  children: (HTMLSelectElement | HTMLInputElement)[]
): DatePartAssignment | null {
  const scores = children.map(scoreDatePartSignal);

  let bestTotal = 0;
  let best: [number, number, number] | null = null;

  for (let m = 0; m < children.length; m++) {
    const monthScore = scores[m]!.month;
    if (monthScore <= 0) continue;

    for (let d = 0; d < children.length; d++) {
      if (d === m) continue;
      const dayScore = scores[d]!.day;
      if (dayScore <= 0) continue;

      for (let y = 0; y < children.length; y++) {
        if (y === m || y === d) continue;
        const yearScore = scores[y]!.year;
        if (yearScore <= 0) continue;

        const total = monthScore + dayScore + yearScore;
        if (total > bestTotal) {
          bestTotal = total;
          best = [m, d, y];
        }
      }
    }
  }

  if (!best) return null;
  const [m, d, y] = best;
  return { monthEl: children[m]!, dayEl: children[d]!, yearEl: children[y]! };
}

/**
 * Resolves a direct child of a candidate container down to the single
 * date-part control it contains, if any. Handles the field itself being the
 * child, and the very common case of each date part individually wrapped
 * for styling (<div><select/></div>), at any wrapping depth. A child that
 * contains more than one field is ambiguous and treated as "not a single
 * date part" rather than guessed at.
 */
function unwrapToDatePart(
  el: Element,
  isFillable: (el: Element) => boolean
): HTMLSelectElement | HTMLInputElement | null {
  if (el.tagName === 'SELECT') {
    return isFillable(el) ? (el as HTMLSelectElement) : null;
  }

  if (el.tagName === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    if (NON_DATE_PART_INPUT_TYPES.has(type)) return null;
    return isFillable(el) ? (el as HTMLInputElement) : null;
  }

  const inner = Array.from(el.querySelectorAll(DATE_PART_SELECTOR)).filter(isFillable);
  return inner.length === 1 ? (inner[0] as HTMLSelectElement | HTMLInputElement) : null;
}

function collectContainerCandidates(
  candidates: Element[],
  scopeRoot: Document | Element | ShadowRoot
): Element[] {
  const containers = new Set<Element>();

  for (const el of candidates) {
    let ancestor: Element | null = el.parentElement;
    let depth = 0;

    while (ancestor && depth < MAX_CONTAINER_ANCESTOR_DEPTH) {
      containers.add(ancestor);
      if (ancestor === scopeRoot) break;
      ancestor = ancestor.parentElement;
      depth++;
    }
  }

  return Array.from(containers);
}

// =============================================================================
// Public API
// =============================================================================

export interface ScanOptions {
  customSelectors?: string[];
  shouldExclude?: (el: Element) => boolean;
}

export function scanForFields(
  root: Document | Element | ShadowRoot,
  options: ScanOptions = {}
): (Element | DateFieldGroup)[] {
  const fields: (Element | DateFieldGroup)[] = [];
  const seen = new Set<Element>();
  const blockedOrigins = new Set<string>();
  const visibilityCache = new Map<Element, boolean>();

  const isFillable = (el: Element): boolean => isFillableCandidate(el, visibilityCache);

  const activeSelector = options.customSelectors && options.customSelectors.length > 0
    ? `${FIELD_SELECTOR}, ${options.customSelectors.join(', ')}`
    : FIELD_SELECTOR;

  function traverse(node: Document | Element | ShadowRoot) {
    // Single-pass collection: one tree walk gathers field candidates,
    // iframes, and shadow hosts together instead of three separate
    // full-subtree queries.
    const candidates: Element[] = [];
    const iframeEls: HTMLIFrameElement[] = [];
    const shadowHostEls: Element[] = [];

    const visit = (el: Element) => {
      if (el.matches(activeSelector) && isFillable(el)) {
        if (options.shouldExclude && options.shouldExclude(el)) {
          return;
        }
        candidates.push(el);
      }
      if (el.tagName === 'IFRAME') iframeEls.push(el as HTMLIFrameElement);
      if (el.shadowRoot) shadowHostEls.push(el);
    };

    if (node.nodeType === Node.ELEMENT_NODE) {
      visit(node as Element);
    }

    const doc = getOwnerDocument(node);
    const walker = doc.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let current = walker.nextNode() as Element | null;
    while (current) {
      visit(current);
      current = walker.nextNode() as Element | null;
    }

    // ---- Date-group detection --------------------------------------------
    const processedElements = new Set<Element>();
    const containers = collectContainerCandidates(candidates, node);

    for (const container of containers) {
      const effectiveChildren = Array.from(container.children)
        .map(child => unwrapToDatePart(child, isFillable))
        .filter((f): f is HTMLSelectElement | HTMLInputElement => f !== null);

      if (effectiveChildren.length < 3) continue;

      const assignment = assignDateParts(effectiveChildren);
      if (!assignment) continue;

      const { monthEl, dayEl, yearEl } = assignment;
      if (processedElements.has(monthEl) || processedElements.has(dayEl) || processedElements.has(yearEl)) {
        continue;
      }

      fields.push({ type: 'date-group', monthEl, dayEl, yearEl, container });
      processedElements.add(monthEl);
      processedElements.add(dayEl);
      processedElements.add(yearEl);
    }

    // ---- Remaining standalone fields ---------------------------------------
    for (const el of candidates) {
      if (processedElements.has(el) || seen.has(el)) continue;
      seen.add(el);
      fields.push(el);
    }

    // ---- Recurse into same-origin iframes ----------------------------------
    for (const iframe of iframeEls) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          traverse(iframeDoc);
        }
      } catch (err) {
        if (iframe.src) {
          try {
            const url = new URL(iframe.src);
            blockedOrigins.add(url.origin);
          } catch {
            // Ignored: malformed iframe src
          }
        }
      }
    }

    // ---- Recurse into open shadow roots ------------------------------------
    // Closed shadow roots are inaccessible by design; there is no
    // workaround available from a content script.
    for (const host of shadowHostEls) {
      if (host.shadowRoot) {
        traverse(host.shadowRoot);
      }
    }
  }

  traverse(root);

  if (blockedOrigins.size > 0 && typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime?.sendMessage) {
    blockedOrigins.forEach(origin => {
      try {
        chrome.runtime.sendMessage({
          type: 'PERMISSION_NEEDED',
          origin
        });
      } catch (err) {
        // Gracefully swallow context invalidation errors
      }
    });
  }

  return fields;
}