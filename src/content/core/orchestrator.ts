import { getProfile, getFileBlob } from '../../shared/storage/storage-client.js';
import { scanForFields } from '../dom/field-scanner.js';
import { detectRepeatedBlocks } from '../dom/repeated-block.js';
import { extractSignals } from '../dom/signal-extractor.js';
import { resolveAllFields } from '../matching/scorer.js';
import { compileRule, FieldRule } from '../../shared/dictionary/rules.js';
import { setNativeValue } from '../fill/native-setter.js';
import { fillSelect } from '../fill/select-filler.js';
import { fillChoiceGroup } from '../fill/radio-checkbox-filler.js';
import { fillDate } from '../fill/date-filler.js';
import { fillFileInput } from '../fill/file-filler.js';
import { fillCombobox } from '../fill/combobox-adapter.js';
import { tagField } from '../ui/review-highlighter.js';
import { watch } from '../dom/mutation-watcher.js';
import { FieldSignals, FillResult, ScoredField, ScannedFieldDetail } from '../../shared/types/index.js';
import { getValueByPath } from './value-path.js';
import { GreenhouseAdapter } from '../adapters/greenhouse.js';
import { LeverAdapter } from '../adapters/lever.js';
import { WorkdayAdapter } from '../adapters/workday.js';
import { GenericAdapter } from '../adapters/generic.js';
import { IPlatformAdapter } from '../adapters/adapter.interface.js';

/**
 * Content-script orchestrator — hardened against the failure modes most
 * likely to look like "it just didn't recognize the field":
 *
 *  1. A single field throwing mid-batch used to silently abort EVERY
 *     remaining field in the form. See the date-group crash fixed in
 *     fillSingleField below — any form with a month/year picker was
 *     hitting this on every single fill. Every field is now isolated in
 *     its own try/catch, so one bad field can no longer take the rest
 *     of the form down with it.
 *  2. Fields that don't exist yet at scan time — either because the
 *     page is still hydrating, or because filling one field reveals
 *     another one further down the form. Handled by waitForDomSettle(),
 *     a bounded re-scan loop in fillWithRescans(), and by activating
 *     the mutation watcher before the fill starts instead of after.
 *  3. A slow/hung async filler (a combobox waiting on a dropdown that
 *     never opens, say) blocking every field queued behind it — each
 *     field now gets a bounded timeout via withTimeout().
 *  4. Values that can't be safely turned into form input — undefined,
 *     whitespace-only strings, or a stray object/array — used to get
 *     stringified as-is (e.g. into the literal text "[object Object]")
 *     and silently written into the page. isFillableValue()/
 *     stringifyValue() guard against this.
 *
 * A WeakSet (handledElements) is shared across the initial scan, the
 * re-scan passes, and the watcher so the same field is never scored or
 * filled twice within one fill session.
 *
 * Everything here works within the existing module boundaries — field
 * detection itself (field-scanner.ts, signal-extractor.ts) and the
 * matching engine (scorer.ts) aren't included, so recognition quality
 * for a field that's genuinely never reaching this file at all won't
 * change. See the accompanying message for what that implies.
 */

/* ===================================================================
   Tunables
   =================================================================== */

/** How long to wait for the page to stop mutating before the first scan. */
const SETTLE_QUIET_MS = 250;
/** Hard cap on the wait above, so a perpetually-animating page can't block filling forever. */
const SETTLE_MAX_MS = 1500;
/** Extra full re-scans after the main pass, to catch anything the first scan missed. */
const RESCAN_PASSES = 2;
/** Delay between each re-scan pass. */
const RESCAN_DELAY_MS = 400;
/** How long a single field is given to fill before we give up on it and move to the next. */
const FIELD_FILL_TIMEOUT_MS = 4000;
/** How long the watcher waits for a burst of DOM changes to settle before processing them as one batch. */
const WATCHER_DEBOUNCE_MS = 350;

/** Input types that are never data-entry targets, regardless of what upstream scanning returns. */
const NON_FILLABLE_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

/** Confidence ranking used to pick one representative gate for a whole radio/checkbox group. */
const GATE_PRIORITY: Record<string, number> = {
  confident: 3,
  review: 2,
  'needs-confirm': 1,
  unmapped: 0,
};

function getActiveAdapter(): IPlatformAdapter {
  const adapters: IPlatformAdapter[] = [
    new GreenhouseAdapter(),
    new LeverAdapter(),
    new WorkdayAdapter(),
    new GenericAdapter()
  ];
  return adapters
    .filter(a => a.matches())
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0] ?? new GenericAdapter();
}

/* ===================================================================
   Small generic utilities
   =================================================================== */

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Races a promise against a timeout so one hung filler can't block the whole queue. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`FormFilla: operation timed out after ${ms}ms`));
    }, ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

/* ===================================================================
   Value validation / formatting — precision guard against writing
   "undefined", "[object Object]", or whitespace into a form field.
   =================================================================== */

function isPrimitiveFillable(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return !Number.isNaN(v);
  if (typeof v === 'boolean') return true;
  return false;
}

function isFillableValue(val: any): boolean {
  if (val instanceof Date) return !isNaN(val.getTime());
  if (Array.isArray(val)) return val.some(isPrimitiveFillable);
  return isPrimitiveFillable(val);
}

function stringifyValue(val: any): string {
  if (val instanceof Date) return val.toLocaleDateString();
  if (Array.isArray(val)) {
    return val.filter(isPrimitiveFillable).map(String).join(', ');
  }
  return String(val);
}

/* ===================================================================
   Dedup — shared by the initial scan, the re-scan passes, and the
   mutation watcher so the same field is never scored or filled twice
   within one fill session. Keyed off the underlying DOM node rather
   than the raw field object, since date-group fields are re-wrapped in
   a fresh descriptor object on every scanForFields() call even though
   the underlying elements are unchanged.
   =================================================================== */

let handledElements = new WeakSet<Element>();

function getDedupKey(field: any): Element | null {
  if (!field) return null;
  if (field instanceof Element) return field;
  if (typeof field === 'object') {
    if (field.container instanceof Element) return field.container;
    if (field.monthEl instanceof Element) return field.monthEl;
  }
  return null;
}

function isAlreadyHandled(field: any): boolean {
  const key = getDedupKey(field);
  return key !== null && handledElements.has(key);
}

function markHandled(field: any): void {
  const key = getDedupKey(field);
  if (key) handledElements.add(key);
}

/* ===================================================================
   Choice-group gate aggregation. Individual radio/checkbox inputs in
   the same logical group can each score slightly differently (e.g. the
   "Yes" option's own label text vs. the "No" option's), so blindly
   using scored[0]'s gate could report a whole confidently-matched group
   as unmapped just because of which option happened to be first in the
   DOM. Use the best gate found anywhere in the group instead.
   =================================================================== */

function bestGate(scored: ScoredField[]): string {
  let best = 'unmapped';
  let bestRank = GATE_PRIORITY.unmapped;
  for (const sf of scored) {
    const rank = GATE_PRIORITY[sf.gate] ?? GATE_PRIORITY.unmapped;
    if (rank > bestRank) {
      bestRank = rank;
      best = sf.gate;
    }
  }
  return best;
}

/* ===================================================================
   Field-type helpers
   =================================================================== */

function isComboboxLike(el: Element): boolean {
  return (
    el.getAttribute('role') === 'combobox' ||
    el.getAttribute('aria-haspopup') === 'listbox' ||
    el.classList.contains('select2') ||
    el.classList.contains('combobox')
  );
}

/**
 * Best-effort fill for rich-text / contenteditable widgets (cover-letter
 * boxes built on Quill, ProseMirror, etc.) — a field type the original
 * dispatch never handled at all, so it silently fell through to
 * "unmapped" every time. execCommand still drives the real browser
 * text-insertion pipeline, which is what most of these editors actually
 * listen to; direct textContent assignment is only the fallback.
 */
function fillContentEditable(el: HTMLElement, value: string): boolean {
  try {
    el.focus();
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (document.execCommand('insertText', false, value)) {
      return true;
    }
  } catch {
    // execCommand unsupported/blocked here — fall through to the manual path.
  }

  el.textContent = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/* ===================================================================
   Per-field fill dispatch
   =================================================================== */

async function fillSingleField(sf: ScoredField, val: any, profile: any): Promise<boolean> {
  if (!isFillableValue(val)) return false;

  const el: any = sf.element;

  // Date-group fields are synthetic descriptor objects built in
  // processFields() below — NOT real DOM elements. This check must run
  // before anything touches `.tagName`, which date-groups don't have.
  // (The original version read el.tagName unconditionally before this
  // check ever ran, which threw on every date-group field and silently
  // killed the rest of the batch along with it — see the top comment.)
  if (el && typeof el === 'object' && el.type === 'date-group') {
    return await fillDate(el, stringifyValue(val));
  }

  if (!(el instanceof Element)) {
    return false;
  }

  const tagName = el.tagName.toUpperCase();

  if (tagName === 'INPUT' && NON_FILLABLE_INPUT_TYPES.has((el as HTMLInputElement).type)) {
    return false;
  }

  if (tagName === 'SELECT') {
    return fillSelect(el as HTMLSelectElement, stringifyValue(val));
  }

  if (isComboboxLike(el)) {
    return await fillCombobox(el, stringifyValue(val));
  }

  if (tagName === 'INPUT' && (el as HTMLInputElement).type === 'file') {
    let docMetadata = val as { name?: string; type?: string } | undefined;
    let targetKey = sf.key;

    if (!docMetadata || !docMetadata.name) {
      if (sf.key === 'documents.cv') {
        targetKey = 'documents.resume';
        docMetadata = getValueByPath(profile, targetKey);
      } else if (sf.key === 'documents.resume') {
        targetKey = 'documents.cv';
        docMetadata = getValueByPath(profile, targetKey);
      }
    }

    if (docMetadata && docMetadata.name) {
      try {
        const fileBytes = await getFileBlob(targetKey);
        if (fileBytes) {
          return await fillFileInput(el as HTMLInputElement, fileBytes, docMetadata.name, docMetadata.type ?? 'application/octet-stream');
        }
      } catch (e) {
        console.warn(`FormFilla: could not load binary bytes for "${targetKey}" from storage`, e);
      }
    }
    return false;
  }

  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    setNativeValue(el as HTMLInputElement | HTMLTextAreaElement, stringifyValue(val));
    return true;
  }

  if ((el as HTMLElement).isContentEditable) {
    return fillContentEditable(el as HTMLElement, stringifyValue(val));
  }

  return false;
}

/* ===================================================================
   Core batch processor — scores, gates, and fills whatever batch of
   fields it's given. Every field is isolated in its own try/catch so
   one bad field can no longer take the rest of the form down with it.
   Counting (confident/review/unmapped/needsConfirm) always reflects
   match confidence, exactly as before — it happens unconditionally,
   before the fallible fill/tag work, so a fill failure downgrades what
   gets *tagged* on the page without ever double-counting or silently
   dropping a field from the totals.
   =================================================================== */

export async function processFields(
  fields: any[],
  profile: any,
  activeAdapter?: IPlatformAdapter
): Promise<FillResult> {
  const scanOptions = {
    customSelectors: activeAdapter?.getCustomFieldSelectors?.(),
    shouldExclude: (el: Element) => activeAdapter?.shouldExcludeElement?.(el) ?? false
  };
  const blocks = detectRepeatedBlocks(document.body, scanOptions);

  const fieldsWithSignals: { element: any; signals: FieldSignals }[] = [];
  for (const f of fields) {
    try {
      if (f && typeof f === 'object' && 'type' in f && f.type === 'date-group') {
        const monthSignals = extractSignals(f.monthEl, blocks);
        let groupSignals: FieldSignals = {
          id: f.container.id || f.monthEl.id || undefined,
          name: f.container.getAttribute('name') || f.monthEl.getAttribute('name') || undefined,
          placeholder: f.monthEl.getAttribute('placeholder') || undefined,
          type: 'date',
          tagName: 'INPUT',
          label: monthSignals.label || undefined,
          legend: monthSignals.legend || undefined,
          blockIndex: monthSignals.blockIndex,
          blockType: monthSignals.blockType
        };
        if (activeAdapter?.enrichSignals) {
          groupSignals = activeAdapter.enrichSignals(f.monthEl, groupSignals);
        }
        fieldsWithSignals.push({ element: f, signals: groupSignals });
      } else {
        let signals = extractSignals(f as Element, blocks);
        if (activeAdapter?.enrichSignals) {
          signals = activeAdapter.enrichSignals(f as Element, signals);
        }
        fieldsWithSignals.push({ element: f as Element, signals });
      }
    } catch (err) {
      console.error('FormFilla: failed to extract signals for a field — skipping just that field', err);
    }
  }

  // Load and compile custom learned rules from storage + community rules from Firebase
  let compiledCustomRules: Record<string, FieldRule> | undefined = undefined;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      compiledCustomRules = {};

      const result = await chrome.storage.local.get('learnedRules');
      if (result.learnedRules) {
        for (const [key, raw] of Object.entries(result.learnedRules)) {
          const rule = compileRule(key, raw);
          if (rule) {
            compiledCustomRules[key] = rule;
          }
        }
      }

      // Fetch and compile remote community rules from Firebase
      if (chrome.runtime && chrome.runtime.sendMessage) {
        const response: any = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'FETCH_COMMUNITY_RULES' }, (res) => {
            const err = chrome.runtime.lastError;
            resolve(res);
          });
        });
        if (response && response.success && response.rules) {
          for (const [key, raw] of Object.entries(response.rules)) {
            if (!compiledCustomRules[key]) {
              const rule = compileRule(key, raw);
              if (rule) {
                compiledCustomRules[key] = rule;
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('FormFilla: failed to load or compile custom rules', err);
  }

  let scoredFields: ScoredField[];
  try {
    scoredFields = resolveAllFields(fieldsWithSignals, profile, activeAdapter, compiledCustomRules);
  } catch (err) {
    console.error('FormFilla: field resolution/scoring failed for this batch', err);
    return { confident: 0, review: 0, unmapped: fieldsWithSignals.length, needsConfirm: 0 };
  }

  if (activeAdapter?.afterScan) {
    try {
      activeAdapter.afterScan(scoredFields);
    } catch (err) {
      console.warn('FormFilla: activeAdapter afterScan failed', err);
    }
  }

  let confident = 0;
  let review = 0;
  let unmapped = 0;
  let needsConfirm = 0;
  const details: ScannedFieldDetail[] = [];

  const choiceGroups: Record<string, { elements: HTMLInputElement[]; scored: ScoredField[] }> = {};
  const singleFields: ScoredField[] = [];

  for (const sf of scoredFields) {
    try {
      const el = sf.element;
      const isChoice = el instanceof Element &&
        el.tagName.toUpperCase() === 'INPUT' &&
        ((el as HTMLInputElement).type === 'radio' || (el as HTMLInputElement).type === 'checkbox');

      if (isChoice) {
        if (!choiceGroups[sf.key]) {
          choiceGroups[sf.key] = { elements: [], scored: [] };
        }
        choiceGroups[sf.key].elements.push(el as HTMLInputElement);
        choiceGroups[sf.key].scored.push(sf);
      } else {
        singleFields.push(sf);
      }
    } catch (err) {
      console.error('FormFilla: failed to classify a scored field — skipping it', err);
    }
  }

  for (const sf of singleFields) {
    if (sf.gate === 'confident') confident++;
    else if (sf.gate === 'review') review++;
    else if (sf.gate === 'needs-confirm') needsConfirm++;
    else unmapped++;

    try {
      const labels = (sf.element as any).labels;
      const labelText = labels && labels[0] ? labels[0].textContent?.trim() : sf.element.getAttribute('aria-label') || sf.element.getAttribute('placeholder') || sf.element.getAttribute('name') || sf.element.id || 'Field';
      details.push({
        label: labelText || 'Field',
        name: sf.element.getAttribute('name') || '',
        id: sf.element.id || '',
        type: sf.element.tagName,
        key: sf.key,
        gate: sf.gate
      });
    } catch (err) {
      console.warn('FormFilla: failed to record field details', err);
    }

    try {
      const value = getValueByPath(profile, sf.key);

      if (sf.gate === 'needs-confirm') {
        tagField(sf.element, sf.gate, async () => {
          try {
            await withTimeout(fillSingleField(sf, value, profile), FIELD_FILL_TIMEOUT_MS);
          } catch (err) {
            console.error(`FormFilla: manual confirm fill failed for key "${sf.key}"`, err);
          }
        });
      } else if (sf.gate === 'confident' || sf.gate === 'review') {
        let ok = false;
        try {
          ok = await withTimeout(fillSingleField(sf, value, profile), FIELD_FILL_TIMEOUT_MS);
        } catch (err) {
          console.warn(`FormFilla: fill failed for key "${sf.key}"`, err);
        }
        tagField(sf.element, ok ? sf.gate : 'unmapped');
      } else {
        tagField(sf.element, 'unmapped');
      }
    } catch (err) {
      console.error(`FormFilla: error processing field for key "${sf.key ?? '(unknown)'}"`, err);
      try { tagField(sf.element, 'unmapped'); } catch { /* best-effort tagging only */ }
    }

    await new Promise(requestAnimationFrame);
  }

  for (const [key, group] of Object.entries(choiceGroups)) {
    const primaryGate = bestGate(group.scored);

    if (primaryGate === 'confident') confident++;
    else if (primaryGate === 'review') review++;
    else if (primaryGate === 'needs-confirm') needsConfirm++;
    else unmapped++;

    try {
      const firstEl = group.elements[0];
      const labels = (firstEl as any).labels;
      const labelText = labels && labels[0] ? labels[0].textContent?.trim() : firstEl.getAttribute('aria-label') || firstEl.getAttribute('name') || firstEl.id || 'Choice Group';
      details.push({
        label: labelText || 'Choice Group',
        name: firstEl.getAttribute('name') || '',
        id: firstEl.id || '',
        type: firstEl.tagName,
        key,
        gate: primaryGate
      });
    } catch (err) {
      console.warn('FormFilla: failed to record choice group details', err);
    }

    try {
      const value = getValueByPath(profile, key);

      if (primaryGate === 'needs-confirm') {
        group.elements.forEach(el => {
          tagField(el, primaryGate, () => {
            try {
              if (isFillableValue(value)) {
                fillChoiceGroup(group.elements, stringifyValue(value));
              }
            } catch (err) {
              console.error(`FormFilla: manual confirm fill failed for choice group "${key}"`, err);
            }
          });
        });
      } else if (primaryGate === 'confident' || primaryGate === 'review') {
        const ok = isFillableValue(value) && fillChoiceGroup(group.elements, stringifyValue(value));
        group.elements.forEach(el => tagField(el, ok ? primaryGate : 'unmapped'));
      } else {
        group.elements.forEach(el => tagField(el, 'unmapped'));
      }
    } catch (err) {
      console.error(`FormFilla: error processing choice group "${key}"`, err);
      group.elements.forEach(el => {
        try { tagField(el, 'unmapped'); } catch { /* best-effort tagging only */ }
      });
    }

    await new Promise(requestAnimationFrame);
  }

  return { confident, review, unmapped, needsConfirm, details };
}

/* ===================================================================
   Initial-scan settle wait + re-scan safety net
   =================================================================== */

function waitForDomSettle(root: Element, quietMs: number = SETTLE_QUIET_MS, maxMs: number = SETTLE_MAX_MS): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (quietTimer) clearTimeout(quietTimer);
      clearTimeout(hardCap);
      observer.disconnect();
      resolve();
    };

    const hardCap = setTimeout(finish, maxMs);
    const observer = new MutationObserver(() => {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    });

    quietTimer = setTimeout(finish, quietMs);
    observer.observe(root, { childList: true, subtree: true });
  });
}

/**
 * Runs the full workflow for one explicit START_FILL request: wait for
 * the page to stop actively re-rendering, scan and fill, then re-scan a
 * couple more times a short beat apart to pick up anything the first
 * scan missed or that only appeared afterward. This is a safety net
 * alongside the mutation watcher below, not a replacement for it — the
 * watcher keeps running after this function returns.
 */
async function fillWithRescans(profile: any): Promise<FillResult> {
  const totals: FillResult = { confident: 0, review: 0, unmapped: 0, needsConfirm: 0 };
  const activeAdapter = getActiveAdapter();

  if (activeAdapter.waitUntilReady) {
    try {
      await activeAdapter.waitUntilReady();
    } catch (err) {
      console.warn('FormFilla: activeAdapter waitUntilReady timed out/failed', err);
    }
  }

  await waitForDomSettle(document.body);

  const scanOptions = {
    customSelectors: activeAdapter.getCustomFieldSelectors?.(),
    shouldExclude: (el: Element) => activeAdapter.shouldExcludeElement?.(el) ?? false
  };

  for (let pass = 0; pass <= RESCAN_PASSES; pass++) {
    if (activeAdapter.beforeScan) {
      try {
        await activeAdapter.beforeScan();
      } catch (err) {
        console.warn('FormFilla: activeAdapter beforeScan failed', err);
      }
    }

    let allFields: any[];
    try {
      allFields = scanForFields(document.body, scanOptions);

      if (activeAdapter.getExtraScanRoots) {
        const extraRoots = activeAdapter.getExtraScanRoots();
        for (const root of extraRoots) {
          try {
            const extraFields = scanForFields(root, scanOptions);
            allFields.push(...extraFields);
          } catch (err) {
            console.warn('FormFilla: failed to scan extra scan root', err);
          }
        }
      }

      // Deduplicate the combined field list by elements.
      const seenElements = new Set<Element>();
      const dedupedFields: any[] = [];
      for (const f of allFields) {
        const el = getDedupKey(f);
        if (el) {
          if (seenElements.has(el)) continue;
          seenElements.add(el);
        }
        dedupedFields.push(f);
      }
      allFields = dedupedFields;

    } catch (err) {
      console.error('FormFilla: scanForFields failed', err);
      allFields = [];
    }

    const freshFields = allFields.filter(f => !isAlreadyHandled(f));

    if (freshFields.length > 0) {
      freshFields.forEach(markHandled);
      const result = await processFields(freshFields, profile, activeAdapter);
      totals.confident += result.confident;
      totals.review += result.review;
      totals.unmapped += result.unmapped;
      totals.needsConfirm += result.needsConfirm;
      if (result.details) {
        if (!totals.details) totals.details = [];
        totals.details.push(...result.details);
      }
    } else if (pass > 0) {
      break; // nothing new since the previous pass — stop early
    }

    if (pass < RESCAN_PASSES) {
      await delay(RESCAN_DELAY_MS);
    }
  }

  return totals;
}

/* ===================================================================
   Mutation watcher — keeps filling fields that appear after the initial
   pass, including ones revealed as a side effect of the fill itself.
   =================================================================== */

let mutationWatcherCleanup: (() => void) | null = null;
let watcherActivated = false;
let watcherPendingFields: any[] = [];
let watcherDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Returns true once the extension's own context is gone — e.g. the
 * extension was reloaded/updated while this tab was already open.
 * Long-lived SPAs (WhatsApp Web, Gmail, Notion, etc.) never navigate,
 * so a content script injected before an update/reload just keeps
 * running with a dead connection to the extension.
 *
 * chrome.runtime.id is the reliable signal: it throws synchronously
 * the moment the context is invalidated. Other chrome.* calls (like
 * chrome.storage.local.get, used inside getProfile()) fail in less
 * consistent ways across Chrome versions — sometimes a rejected
 * promise, sometimes a synchronous throw, with wording that has
 * changed between releases — so they aren't safe to string-match on.
 * Checking chrome.runtime.id directly, at each point we care about,
 * is what actually catches every case.
 */
function isExtensionContextInvalidated(): boolean {
  try {
    return !chrome?.runtime?.id;
  } catch {
    return true;
  }
}

function stopWatcher(): void {
  if (watcherDebounceTimer) {
    clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = null;
  }
  watcherPendingFields = [];
  if (mutationWatcherCleanup) {
    mutationWatcherCleanup();
    mutationWatcherCleanup = null;
  }
}

async function flushWatcherQueue(): Promise<void> {
  watcherDebounceTimer = null;
  const batch = watcherPendingFields;
  watcherPendingFields = [];
  if (batch.length === 0) return;

  // Check #1: bail before touching any chrome.* API at all.
  if (isExtensionContextInvalidated()) {
    console.log('FormFilla: extension context invalidated, stopping dynamic fill watcher.');
    stopWatcher();
    return;
  }

  try {
    const profile = await getProfile();

    // Check #2: getProfile() awaits a chrome.storage call, so the
    // context can go invalid in the gap between check #1 and here.
    if (isExtensionContextInvalidated()) {
      console.log('FormFilla: extension context invalidated, stopping dynamic fill watcher.');
      stopWatcher();
      return;
    }

    if (!profile?.personal?.email) return;

    const freshFields = batch.filter(f => !isAlreadyHandled(f));
    if (freshFields.length === 0) return;
    freshFields.forEach(markHandled);

    const activeAdapter = getActiveAdapter();
    await processFields(freshFields, profile, activeAdapter);
  } catch (err) {
    // Check #3: if the context is confirmed dead, this error is
    // expected — stop the watcher instead of retrying on every
    // subsequent DOM mutation (WhatsApp Web mutates constantly, so
    // without this the same failure would otherwise repeat forever).
    if (isExtensionContextInvalidated()) {
      stopWatcher();
      return;
    }
    // Context is still alive, so this is a real, unexpected failure.
    console.error('FormFilla: dynamic fill failed', err);
  }
}

/**
 * Activate the mutation watcher so dynamically-added fields keep
 * getting filled after the initial pass — including fields that appear
 * as a *side effect* of this very fill (e.g. answering one question
 * reveals a follow-up field further down the form). Still gated behind
 * the first user-initiated START_FILL message (see startOrchestrator)
 * so the observer never runs on pages the user never asked FormFilla to
 * touch (WhatsApp, Gmail, etc.) — only *when* it's kicked off within
 * that fill has changed, not *whether*. Incoming mutations are buffered
 * and debounced so a burst of DOM changes — including ones caused by
 * our own fills — collapses into a single batched pass instead of one
 * processFields() call per mutation.
 */
function activateWatcher(): void {
  if (watcherActivated) return;
  watcherActivated = true;

  const activeAdapter = getActiveAdapter();
  const scanOptions = {
    customSelectors: activeAdapter.getCustomFieldSelectors?.(),
    shouldExclude: (el: Element) => activeAdapter.shouldExcludeElement?.(el) ?? false
  };

  mutationWatcherCleanup = watch(document.body, (newFields) => {
    if (isExtensionContextInvalidated()) {
      console.log('FormFilla: extension context invalidated, stopping dynamic fill watcher.');
      stopWatcher();
      return;
    }
    watcherPendingFields.push(...newFields);
    if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = setTimeout(flushWatcherQueue, WATCHER_DEBOUNCE_MS);
  }, undefined, scanOptions);
}

/* ===================================================================
   Entry point
   =================================================================== */

export function startOrchestrator() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_FILL') {
      (async () => {
        try {
          // Fresh session: forget what a previous fill already handled,
          // so this run gives every field on the page a full attempt
          // (e.g. the user may have just updated their profile).
          handledElements = new WeakSet<Element>();

          // Start watching for DOM changes before we even scan, so
          // fields revealed as a side effect of this fill aren't missed.
          activateWatcher();

          const profile = await getProfile();
          const results = await fillWithRescans(profile);

          sendResponse({ type: 'FILL_RESULT', result: results });
        } catch (err) {
          console.error('Error during form fill execution:', err);
          sendResponse({
            type: 'FILL_RESULT',
            result: { confident: 0, review: 0, unmapped: 0, needsConfirm: 0 }
          });
        }
      })();
      return true;
    }

    if (message.type === 'START_INTERACTIVE_MAP') {
      (async () => {
        try {
          const { startInteractiveMapping } = await import('../ui/target-mapper.js');
          startInteractiveMapping();
          sendResponse({ type: 'MAPPER_STARTED' });
        } catch (err) {
          console.error('FormFilla: failed to start target mapper', err);
          sendResponse({ type: 'MAPPER_FAILED' });
        }
      })();
      return true;
    }
  });

  // No mutation watcher until the user triggers a fill — this avoids
  // running DOM observers on irrelevant pages (WhatsApp, email, etc.).

  console.log('FormFilla content script active. Use the popup to fill forms.');
}

export { getValueByPath };