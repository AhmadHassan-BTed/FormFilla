/**
 * Fills a native `<input type="file">`, and only that — this is not for
 * simulating a user picking a file through the OS dialog (impossible from
 * page JS for security reasons), it's for programmatically constructing a
 * File and attaching it the same way a real browser drag-and-drop or a
 * DevTools-level assignment would.
 *
 * Two call shapes:
 *  - `fillFileInput(el, bytes, name, mimeType)` — original signature,
 *    unchanged, single file.
 *  - `fillFileInput(el, files)` — an array of `FileDescriptor`, for
 *    `<input multiple>` fields. If the input isn't `multiple`, only the
 *    first file is used (browsers don't reliably enforce that constraint
 *    on a programmatic `.files` assignment, so this does it explicitly
 *    rather than leaving it to chance).
 *
 * Strategy, in order, stopping at the first success:
 *  1. RESOLVE the real target. The element handed in might be stale (the
 *     page re-rendered), disabled, or simply the wrong node (some upload
 *     widgets style a decorative `<div>` as the "field" and hide the real
 *     `<input type=file>` elsewhere). We wait briefly for it to become
 *     usable, then — only if that fails — try to re-find it by id/name,
 *     and only as a last resort search the whole document (including
 *     same-origin iframes and open shadow roots) for file inputs. If more
 *     than one plausible candidate turns up and nothing distinguishes
 *     them, we refuse to guess: silently attaching a résumé to a photo
 *     field is worse than failing loudly. This matters concretely — a
 *     form can have several required file fields at once. For example,
 *     the Airblue jobs application form linked in the request that
 *     prompted this rewrite requires a photo, a government-issued ID,
 *     AND a resume/CV/certificate as three separate required fields —
 *     guessing wrong on one doesn't fail safe, it silently corrupts a
 *     different field.
 *  2. DIRECT ASSIGNMENT — build a real File/DataTransfer and assign
 *     `.files` directly, the standard spec-sanctioned way to do this
 *     programmatically, then dispatch focus/input/change/blur (and a
 *     jQuery `.trigger('change')` too, if jQuery is on the page — common
 *     on older sites) so native listeners, jQuery plugins, and
 *     React/Vue/Angular all see it.
 *  3. DRAG-AND-DROP — if direct assignment didn't visibly register (some
 *     widgets hide the native input and only listen for `drop`), simulate
 *     a realistic hover + dragenter/dragover/drop sequence on the
 *     best-guess visual drop zone.
 *  4. PASTE — a few upload widgets accept files via a `paste` event
 *     instead of (or in addition to) drag-and-drop. Cheap to try, so we
 *     try it before giving up.
 *
 * Honesty over optimism: success is judged the same conservative way at
 * every step — whether `.files` actually ended up populated — never by
 * assuming a dispatched event "probably worked." Every attempt is logged
 * to the console and to `getLastFillDiagnostics()` so a failure is
 * debuggable instead of a silent `false`.
 *
 * A hard limit this file cannot code around: every event constructed here
 * is `isTrusted: false`, because it's built by page script rather than the
 * browser's own input pipeline, and `isTrusted` cannot be spoofed from
 * script — that's a deliberate browser security boundary, precisely
 * because file inputs are more sensitive than most form fields. The large
 * majority of upload widgets don't check it and only care that `.files` is
 * populated and *some* change/input/drop event fired, which is what all
 * three strategies above provide. But if a particular site's widget does
 * check `event.isTrusted` for its file field specifically, no page-level
 * script — this one included — can satisfy that; only real OS-level input
 * (a WebDriver's native file-upload command, or a browser extension using
 * the `chrome.debugger` protocol) can produce a trusted event. If every
 * strategy below fails and `collectNearbyValidationMessages` also comes up
 * empty, that's the most likely remaining explanation.
 */

import { FieldFiller, FillContext } from './filler.interface.js';

export interface FileDescriptor {
  bytes: ArrayBuffer;
  name: string;
  mimeType: string;
}

export interface FillDiagnostics {
  target: string;
  requestedFiles: string[];
  elementFound: boolean;
  elementConnected: boolean;
  strategiesTried: Array<{ name: string; attempted: boolean; succeeded: boolean; detail?: string }>;
  nearbyValidationMessages: string[];
  finalFileCount: number;
  success: boolean;
  log: string[];
}

let lastDiagnostics: FillDiagnostics | null = null;

/** Inspect exactly what happened on the most recent fillFileInput() call —
 *  handy from the devtools console when a fill silently "doesn't work". */
export function getLastFillDiagnostics(): FillDiagnostics | null {
  return lastDiagnostics;
}

export async function fillFileInput(
  el: HTMLInputElement,
  fileBytes: ArrayBuffer,
  fileName: string,
  mimeType: string
): Promise<boolean>;
export async function fillFileInput(el: HTMLInputElement, files: FileDescriptor[]): Promise<boolean>;
export async function fillFileInput(
  el: HTMLInputElement,
  arg2: ArrayBuffer | FileDescriptor[],
  fileName?: string,
  mimeType?: string
): Promise<boolean> {
  const requested: FileDescriptor[] = Array.isArray(arg2)
    ? arg2
    : [{ bytes: arg2, name: fileName ?? 'file', mimeType: mimeType ?? 'application/octet-stream' }];

  const diag: FillDiagnostics = {
    target: describeElement(el),
    requestedFiles: requested.map(f => `${f.name} (${f.mimeType}, ${f.bytes.byteLength}B)`),
    elementFound: false,
    elementConnected: false,
    strategiesTried: [],
    nearbyValidationMessages: [],
    finalFileCount: 0,
    success: false,
    log: [],
  };
  lastDiagnostics = diag;

  try {
    if (requested.length === 0) {
      log(diag, 'error', 'no files provided');
      return false;
    }

    if (!isUsable(el)) {
      await waitUntilUsable(el);
    }

    const target = resolveOrDiscoverInput(el, diag);
    if (!target) {
      log(
        diag,
        'error',
        'could not resolve a usable, unambiguous file input for this field; giving up rather than risk filling the wrong one'
      );
      return false;
    }
    diag.elementFound = true;
    diag.elementConnected = target.isConnected;
    diag.target = describeElement(target);

    const allowsMultiple = target.hasAttribute('multiple');
    const toUse = allowsMultiple ? requested : requested.slice(0, 1);
    if (!allowsMultiple && requested.length > 1) {
      log(
        diag,
        'warn',
        `input has no "multiple" attribute; using only the first of ${requested.length} files given`
      );
    }

    const accept = target.getAttribute('accept');
    for (const f of toUse) {
      if (f.bytes.byteLength === 0) {
        log(diag, 'warn', `"${f.name}" is 0 bytes`);
      }
      if (accept && !matchesAccept(f.name, f.mimeType, accept)) {
        log(
          diag,
          'warn',
          `"${f.name}" (${f.mimeType}) doesn't look like it matches accept="${accept}" — attempting anyway`
        );
      }
    }

    const files = toUse.map(f => new File([f.bytes], f.name, { type: f.mimeType }));
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(file);
    dt.effectAllowed = 'all';

    if (await tryDirectAssignment(target, dt, toUse.length, diag)) {
      return finish(diag, target, true);
    }

    const dropZone = findBestDropZone(target);
    if (dropZone) {
      if (await tryDragDropSequence(dropZone, target, dt, toUse.length, diag)) {
        return finish(diag, target, true);
      }
    } else {
      diag.strategiesTried.push({
        name: 'drag-and-drop',
        attempted: false,
        succeeded: false,
        detail: 'no plausible drop zone found near the input',
      });
    }

    if (await tryPasteEvent(target, dropZone, dt, toUse.length, diag)) {
      return finish(diag, target, true);
    }

    const succeeded = (target.files?.length ?? 0) > 0;
    if (!succeeded) {
      diag.nearbyValidationMessages = collectNearbyValidationMessages(target);
      log(
        diag,
        'error',
        `all strategies exhausted; input still has ${target.files?.length ?? 0} file(s).` +
          (diag.nearbyValidationMessages.length
            ? ` Nearby messages: ${diag.nearbyValidationMessages.join(' | ')}`
            : ' No nearby validation message text was found — see the header comment about isTrusted if this keeps happening on this specific site.')
      );
    }
    return finish(diag, target, succeeded);
  } catch (err) {
    log(diag, 'error', `unexpected exception: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function finish(diag: FillDiagnostics, target: HTMLInputElement, success: boolean): boolean {
  diag.finalFileCount = target.files?.length ?? 0;
  diag.success = success;
  return success;
}

// ============================================================
// accept="" matching (diagnostic only — never blocks the fill)
// ============================================================

function matchesAccept(fileName: string, mimeType: string, accept: string): boolean {
  const patterns = accept.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
  if (patterns.length === 0) return true;

  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  return patterns.some(pattern => {
    if (pattern === '*/*') return true;
    if (pattern.startsWith('.')) return lowerName.endsWith(pattern);
    if (pattern.endsWith('/*')) return lowerMime.startsWith(pattern.slice(0, -1));
    return lowerMime === pattern;
  });
}

// ============================================================
// Element resolution: stale references, wrong elements, and
// genuinely ambiguous pages (several required file fields at once)
// ============================================================

const MAX_ANCESTOR_DEPTH = 8;

function isUsable(el: Element | null): el is HTMLInputElement {
  if (!el) return false;
  if (!(el instanceof HTMLInputElement) || el.type !== 'file') return false;
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
  if (!el.isConnected) return false;
  return true;
}

function isEmpty(input: HTMLInputElement): boolean {
  return input.files === null || input.files.length === 0;
}

async function waitUntilUsable(el: Element, timeoutMs = 600, stepMs = 150): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!isUsable(el) && Date.now() < deadline) {
    await sleep(stepMs);
  }
  return isUsable(el);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Walks from a node to its parent, stepping from a ShadowRoot to its host
 *  so the search can cross shadow boundaries in either direction. */
function parentAcrossShadow(node: Node): HTMLElement | null {
  const parent = node.parentNode;
  if (parent instanceof HTMLElement) return parent;
  if (parent instanceof ShadowRoot) return parent.host as HTMLElement;
  return null;
}

function resolveOrDiscoverInput(el: Element, diag: FillDiagnostics): HTMLInputElement | null {
  if (isUsable(el)) return el;

  const reason = !(el instanceof HTMLInputElement)
    ? 'is not a file input'
    : !el.isConnected
      ? 'is detached from the document'
      : 'is disabled';
  diag.log.push(`given element ${describeElement(el)} ${reason}; attempting to re-resolve`);

  const elId = (el as HTMLElement).id;
  if (elId) {
    const byId = document.getElementById(elId);
    if (isUsable(byId)) {
      diag.strategiesTried.push({
        name: 're-resolve-by-id',
        attempted: true,
        succeeded: true,
        detail: describeElement(byId),
      });
      return byId;
    }
  }

  const name = el.getAttribute('name');
  if (name) {
    const candidates = Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[type="file"][name="${escapeForSelector(name)}"]`)
    );
    const usable = candidates.find(isUsable);
    if (usable) {
      diag.strategiesTried.push({
        name: 're-resolve-by-name',
        attempted: true,
        succeeded: true,
        detail: describeElement(usable),
      });
      return usable;
    }
  }

  const hint = extractSemanticHint(el);
  const allInputs = collectAllFileInputs();
  const eligible = allInputs.filter(c => isUsable(c) && isEmpty(c));

  diag.strategiesTried.push({
    name: 'document-wide-scan',
    attempted: true,
    succeeded: false,
    detail: `${allInputs.length} file input(s) total, ${eligible.length} empty & usable; hint="${hint ?? 'none'}"`,
  });

  if (eligible.length === 0) return null;

  if (eligible.length === 1) {
    diag.strategiesTried.push({
      name: 'unambiguous-single-candidate',
      attempted: true,
      succeeded: true,
      detail: describeElement(eligible[0]),
    });
    return eligible[0];
  }

  if (hint) {
    const scored = eligible
      .map(cand => ({ cand, score: semanticMatchScore(cand, hint) }))
      .sort((a, b) => b.score - a.score);
    if (scored[0].score > 0 && scored[0].score > (scored[1]?.score ?? -1)) {
      diag.strategiesTried.push({
        name: 'semantic-match',
        attempted: true,
        succeeded: true,
        detail: `matched ${describeElement(scored[0].cand)} (score ${scored[0].score}) among ${eligible.length} candidates`,
      });
      return scored[0].cand;
    }
  }

  diag.strategiesTried.push({
    name: 'ambiguous-multi-candidate',
    attempted: true,
    succeeded: false,
    detail: `${eligible.length} candidate file inputs and none scored a clear match — refusing to guess. ` +
      `This happens on forms with several required uploads at once (e.g. a photo, a government ID, ` +
      `and a resume as three separate fields); the caller needs to give this function the right element.`,
  });
  return null;
}

/** Collects every `<input type="file">` in the document, in open shadow
 *  roots, and in same-origin iframes. Closed shadow roots and cross-origin
 *  iframes are invisible to page JS by design — that's not fixable from
 *  here, only noted. */
function collectAllFileInputs(root: Document | ShadowRoot = document, depth = 0): HTMLInputElement[] {
  if (depth > 6) return [];
  const found: HTMLInputElement[] = Array.from(root.querySelectorAll('input[type="file"]')) as HTMLInputElement[];

  for (const node of Array.from(root.querySelectorAll('*'))) {
    const shadow = (node as HTMLElement).shadowRoot;
    if (shadow) {
      found.push(...collectAllFileInputs(shadow, depth + 1));
    }
  }

  for (const frame of Array.from(root.querySelectorAll('iframe'))) {
    try {
      const doc = (frame as HTMLIFrameElement).contentDocument;
      if (doc) {
        found.push(...collectAllFileInputs(doc, depth + 1));
      }
    } catch {
      // Cross-origin iframe — the browser blocks this on purpose.
    }
  }

  return found;
}

function getAssociatedLabelText(el: Element): string {
  const parts: string[] = [];
  const elId = (el as HTMLElement).id;
  if (elId) {
    const root = el.isConnected ? (el.getRootNode() as Document | ShadowRoot) : document;
    const explicit = root.querySelector(`label[for="${escapeForSelector(elId)}"]`);
    if (explicit?.textContent) parts.push(explicit.textContent);
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const node = document.getElementById(id);
      if (node?.textContent) parts.push(node.textContent);
    }
  }
  if (el instanceof HTMLInputElement && el.placeholder) parts.push(el.placeholder);

  let ancestor = parentAcrossShadow(el);
  let depth = 0;
  while (ancestor && depth < 4) {
    if (ancestor.tagName === 'LABEL' && ancestor.textContent) {
      parts.push(ancestor.textContent);
      break;
    }
    ancestor = parentAcrossShadow(ancestor);
    depth++;
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function extractSemanticHint(el: Element): string | null {
  const text = getAssociatedLabelText(el);
  const name = el.getAttribute('name') ?? '';
  const id = (el as HTMLElement).id ?? '';
  const testId = el.getAttribute('data-testid') ?? '';
  const combined = `${text} ${name} ${id} ${testId}`.trim();
  return combined.length > 0 ? combined : null;
}

/** Coarse document-type buckets. Extend this if a form needs more than
 *  photo / government ID / resume — those three cover the common
 *  "attach files" pattern on job-application forms. */
function classifyLabelText(text: string): 'photo' | 'governmentId' | 'resume' | 'unknown' {
  const t = text.toLowerCase();
  if (/\b(photo|picture|headshot|photograph)\b/.test(t)) return 'photo';
  if (/\b(government[\s-]?issued|national\s?id|passport|driver'?s?\s?licen[cs]e|\bcnic\b|\bid\b)\b/.test(t)) {
    return 'governmentId';
  }
  if (/\b(resume|r[eé]sum[eé]|\bcv\b|curriculum vitae|certificate|educational document)\b/.test(t)) return 'resume';
  return 'unknown';
}

function semanticMatchScore(candidate: HTMLInputElement, hint: string): number {
  const hintClass = classifyLabelText(hint);
  const candidateText = `${getAssociatedLabelText(candidate)} ${candidate.name} ${candidate.id}`;
  const candidateClass = classifyLabelText(candidateText);
  if (hintClass !== 'unknown' && hintClass === candidateClass) return 2;

  const hintWords = new Set(hint.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const candidateWords = candidateText.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  return candidateWords.some(w => hintWords.has(w)) ? 1 : 0;
}

// ============================================================
// Fill strategies
// ============================================================

function getJQuery(): ((sel: unknown) => { trigger: (evt: string) => void }) | null {
  // Deliberately `any` here: this is a small feature-detection shim for a
  // global that may or may not exist, not part of the typed data flow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (typeof w.jQuery === 'function') return w.jQuery;
  if (typeof w.$ === 'function' && w.$.fn && w.$.fn.jquery) return w.$;
  return null;
}

async function tryDirectAssignment(
  target: HTMLInputElement,
  dt: DataTransfer,
  expectedCount: number,
  diag: FillDiagnostics
): Promise<boolean> {
  target.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  target.files = dt.files;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));

  const jq = getJQuery();
  if (jq) {
    try {
      jq(target).trigger('change');
    } catch {
      // Best-effort legacy-jQuery-plugin compatibility shim only.
    }
  }

  target.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

  await raf();
  await raf(); // a second frame, since some frameworks batch state updates

  const ok = target.files !== null && target.files.length === expectedCount;
  diag.strategiesTried.push({
    name: 'direct-assignment',
    attempted: true,
    succeeded: ok,
    detail: `expected ${expectedCount} file(s), got ${target.files?.length ?? 0}${jq ? '; jQuery change also triggered' : ''}`,
  });
  return ok;
}

async function tryDragDropSequence(
  dropZone: HTMLElement,
  target: HTMLInputElement,
  dt: DataTransfer,
  expectedCount: number,
  diag: FillDiagnostics
): Promise<boolean> {
  dispatchDragSequence(dropZone, dt);
  await raf();
  await raf();

  const ok = target.files !== null && target.files.length === expectedCount;
  diag.strategiesTried.push({
    name: 'drag-and-drop',
    attempted: true,
    succeeded: ok,
    detail: `dropped on ${describeElement(dropZone)}; input now has ${target.files?.length ?? 0} file(s)`,
  });
  return ok;
}

async function tryPasteEvent(
  target: HTMLInputElement,
  dropZone: HTMLElement | null,
  dt: DataTransfer,
  expectedCount: number,
  diag: FillDiagnostics
): Promise<boolean> {
  const candidates = [target, dropZone].filter((x): x is HTMLElement => !!x);
  let dispatched = 0;
  for (const el of candidates) {
    try {
      const evt = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
      el.dispatchEvent(evt);
      dispatched++;
    } catch {
      // Some engines restrict constructing a populated ClipboardEvent; skip.
    }
  }

  await raf();
  const ok = target.files !== null && target.files.length === expectedCount;
  diag.strategiesTried.push({
    name: 'paste-event',
    attempted: dispatched > 0,
    succeeded: ok,
    detail: dispatched > 0
      ? `dispatched synthetic paste on ${dispatched} element(s); input now has ${target.files?.length ?? 0} file(s)`
      : 'ClipboardEvent with clipboardData could not be constructed in this browser',
  });
  return ok;
}

// ============================================================
// Drop-zone discovery
// ============================================================

function findBestDropZone(el: HTMLInputElement): HTMLElement | null {
  // Most reliable signal there is: an explicit <label for="..."> anywhere
  // in the same root (document or shadow root — ids are scoped per-root).
  if (el.id) {
    const root = el.isConnected ? (el.getRootNode() as Document | ShadowRoot) : document;
    const explicit = root.querySelector(`label[for="${escapeForSelector(el.id)}"]`);
    if (explicit) return explicit as HTMLElement;
  }

  // Walk up the ancestor chain (crossing shadow boundaries via the host,
  // so a drop zone in the light DOM around a shadow-hosted input, or vice
  // versa, is still reachable). A wrapping <label> is automatically a
  // valid target. Other ancestors — and their OTHER children, since many
  // upload widgets place the visual drop zone as a SIBLING of a (often
  // visually hidden) input under a shared wrapper, rather than nesting the
  // input inside the zone — need an actual drop-zone-like marker.
  let node: HTMLElement | null = parentAcrossShadow(el);
  let depth = 0;
  while (node && depth < MAX_ANCESTOR_DEPTH) {
    if (node.tagName === 'LABEL') return node;
    if (looksLikeDropZoneMarker(node)) return node;

    for (const child of Array.from(node.children)) {
      if (child === el || child.contains(el)) continue;
      if (looksLikeDropZoneMarker(child as HTMLElement)) return child as HTMLElement;
    }

    node = parentAcrossShadow(node);
    depth++;
  }

  return null;
}

function looksLikeDropZoneMarker(el: HTMLElement): boolean {
  if (el.getAttribute('role') === 'button') return true;

  const text = [Array.from(el.classList).join(' '), el.id, el.getAttribute('data-testid') || '']
    .join(' ')
    .toLowerCase();

  if (/drop-?down/.test(text)) return false; // exclude nav/select "dropdown" false-positives
  if (/drop-?zone|drag-?(and-?)?drop|file-?drop|upload-?(area|zone|box|target)|drag-?(area|target)/.test(text)) {
    return true;
  }
  return /\bdrop\b/.test(text) || /\bdrag\b/.test(text) || /\bupload\b/.test(text);
}

function escapeForSelector(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id);
  }
  return id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function dispatchDragSequence(target: HTMLElement, dt: DataTransfer): void {
  const rect = target.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;

  // A few widgets fake "dragging" visual state from plain mouse events
  // rather than the HTML5 DnD API; priming that costs nothing and can only
  // help the subsequent drop be accepted.
  target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX, clientY }));
  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX, clientY }));

  for (const type of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY })
    );
  }
}

// ============================================================
// Post-attempt diagnostics: why did the site reject the file?
// ============================================================

// .field-validation-error / .validation-summary-errors are the default
// classic-ASP / ASP.NET validator CSS classes — worth including because the
// Airblue form's "openings-app.asp" URL is a classic-ASP page.
const VALIDATION_SELECTOR = [
  '[role="alert"]',
  '.field-validation-error',
  '.validation-summary-errors',
  '.error',
  '.errors',
  '.error-message',
  '.invalid-feedback',
  '.help-block',
  '[aria-invalid="true"]',
].join(',');

function collectNearbyValidationMessages(target: HTMLInputElement): string[] {
  const messages = new Set<string>();
  let node = parentAcrossShadow(target);
  let depth = 0;
  while (node && depth < MAX_ANCESTOR_DEPTH) {
    for (const m of Array.from(node.querySelectorAll(VALIDATION_SELECTOR))) {
      const text = (m.textContent || '').trim();
      if (text) messages.add(text.slice(0, 200));
    }
    node = parentAcrossShadow(node);
    depth++;
  }
  return Array.from(messages).slice(0, 5);
}

function describeElement(el: Element | null): string {
  if (!el) return '(none)';
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
  const name = el.getAttribute?.('name');
  const nameAttr = name ? `[name="${name}"]` : '';
  const cls = el.classList.length ? `.${Array.from(el.classList).slice(0, 3).join('.')}` : '';
  return `<${el.tagName.toLowerCase()}${id}${nameAttr}${cls}>`;
}

function log(diag: FillDiagnostics, level: 'warn' | 'error' | 'info', message: string): void {
  const line = `[fillFileInput] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
  diag.log.push(`${level}: ${message}`);
}

function raf(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

// ============================================================
// FieldFiller integration
// ============================================================

/** Synonym buckets for the profile-metadata lookup. A page can require
 *  more than one file at once (e.g. Airblue's application form wants a
 *  photo, a government-issued ID, AND a resume/CV/certificate — three
 *  separate required fields) so this can no longer just swap between two
 *  keys. Adjust these strings to match your actual profile schema; these
 *  are reasonable guesses, not a contract your storage layer already
 *  follows. */
const DOCUMENT_KEY_SYNONYMS: Record<string, string[]> = {
  'documents.cv': ['documents.cv', 'documents.resume', 'documents.certificate'],
  'documents.resume': ['documents.resume', 'documents.cv', 'documents.certificate'],
  'documents.photo': ['documents.photo', 'documents.photograph', 'documents.picture', 'documents.headshot'],
  'documents.governmentId': [
    'documents.governmentId',
    'documents.nationalId',
    'documents.id',
    'documents.passport',
  ],
};

const BUCKET_KEYS: Record<'photo' | 'governmentId' | 'resume' | 'unknown', string[]> = {
  photo: ['documents.photo', 'documents.photograph', 'documents.picture'],
  governmentId: ['documents.governmentId', 'documents.nationalId', 'documents.id', 'documents.passport'],
  resume: ['documents.resume', 'documents.cv', 'documents.certificate'],
  unknown: [],
};

export class FileFiller implements FieldFiller {
  supports(el: unknown, key: string, val: unknown): boolean {
    return el instanceof Element && el.tagName.toUpperCase() === 'INPUT' && (el as HTMLInputElement).type === 'file';
  }

  async fill(el: unknown, val: unknown, context: FillContext): Promise<boolean> {
    let docMetadata = val as { name?: string; type?: string } | undefined;
    let targetKey = context.key;

    if (!docMetadata || !docMetadata.name) {
      const synonyms = DOCUMENT_KEY_SYNONYMS[context.key] ?? [context.key];
      for (const candidateKey of synonyms) {
        if (candidateKey === context.key) continue;
        const candidate = context.getValueByPath(context.profile, candidateKey);
        if (candidate?.name) {
          docMetadata = candidate;
          targetKey = candidateKey;
          break;
        }
      }
    }

    // Last resort: context.key didn't tell us which document this field
    // wants (or the profile has nothing under it) — ask the DOM. If the
    // field's own label says "photograph" or "government issued ID", try
    // that bucket even though context.key didn't say so explicitly.
    if ((!docMetadata || !docMetadata.name) && el instanceof HTMLInputElement) {
      const hint = extractSemanticHint(el);
      if (hint) {
        const bucket = classifyLabelText(hint);
        for (const candidateKey of BUCKET_KEYS[bucket]) {
          const candidate = context.getValueByPath(context.profile, candidateKey);
          if (candidate?.name) {
            docMetadata = candidate;
            targetKey = candidateKey;
            break;
          }
        }
      }
    }

    if (!docMetadata || !docMetadata.name) {
      console.warn(
        `FormFilla: no document metadata found for key "${context.key}" (tried synonyms and DOM-label hints); this field will be left empty`
      );
      return false;
    }

    try {
      const fileBytes = await context.getFileBlob(targetKey);
      if (!fileBytes) {
        console.warn(`FormFilla: getFileBlob("${targetKey}") returned no data even though metadata exists`);
        return false;
      }
      return await fillFileInput(
        el as HTMLInputElement,
        fileBytes,
        docMetadata.name,
        docMetadata.type ?? 'application/octet-stream'
      );
    } catch (e) {
      console.warn(`FormFilla: could not load binary bytes for "${targetKey}" from storage`, e);
      return false;
    }
  }
}