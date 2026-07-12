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
 *  - `fillFileInput(el, files)` — new: an array of `FileDescriptor`, for
 *    `<input multiple>` fields. If the input isn't `multiple`, only the
 *    first file is used (browsers don't reliably enforce that constraint
 *    on a programmatic `.files` assignment, so this does it explicitly
 *    rather than leaving it to chance).
 *
 * Strategy:
 *  1. Validate the target is actually an enabled `<input type="file">`.
 *  2. Diagnose (warn, don't block) obvious problems: a file that doesn't
 *     match the field's `accept` attribute, a 0-byte file, more files than
 *     a non-multiple input can take.
 *  3. Build real File/DataTransfer objects and assign `.files` directly —
 *     the standard, spec-sanctioned way to set this programmatically —
 *     then dispatch `input`/`change` so React/Vue/Angular and plain
 *     listeners all see it.
 *  4. Only if that didn't fully take (file count mismatch after a tick):
 *     fall back to a realistic drag-and-drop event sequence dispatched on
 *     the best-guess visual drop zone, since some upload widgets hide the
 *     native input entirely and only listen for `drop`, never `change`.
 *
 * Honesty over optimism: after the fallback, there's no reliable way to
 * confirm a drop-driven widget actually accepted the file (its internal
 * state is opaque to us), so success is still judged by whether `.files`
 * ended up populated — the same, conservative signal used for the primary
 * path, rather than assuming the drop "probably worked."
 */

import { FieldFiller, FillContext } from './filler.interface.js';

export interface FileDescriptor {
  bytes: ArrayBuffer;
  name: string;
  mimeType: string;
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
  try {
    const requested: FileDescriptor[] = Array.isArray(arg2)
      ? arg2
      : [{ bytes: arg2, name: fileName ?? 'file', mimeType: mimeType ?? 'application/octet-stream' }];

    if (requested.length === 0) {
      console.error('fillFileInput: no files provided');
      return false;
    }
    if (!(el instanceof HTMLInputElement) || el.type !== 'file') {
      console.error('fillFileInput: target element is not a file input');
      return false;
    }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      console.error('fillFileInput: target file input is disabled');
      return false;
    }
    if (!el.isConnected) {
      console.warn('fillFileInput: target element is not attached to the document');
    }

    const allowsMultiple = el.hasAttribute('multiple');
    const toUse = allowsMultiple ? requested : requested.slice(0, 1);
    if (!allowsMultiple && requested.length > 1) {
      console.warn(
        `fillFileInput: input has no "multiple" attribute; using only the first of ${requested.length} files given`
      );
    }

    const accept = el.getAttribute('accept');
    for (const f of toUse) {
      if (f.bytes.byteLength === 0) {
        console.warn(`fillFileInput: "${f.name}" is 0 bytes`);
      }
      if (accept && !matchesAccept(f.name, f.mimeType, accept)) {
        console.warn(
          `fillFileInput: "${f.name}" (${f.mimeType}) doesn't look like it matches accept="${accept}" — attempting anyway`
        );
      }
    }

    const files = toUse.map(f => new File([f.bytes], f.name, { type: f.mimeType }));
    const dt = new DataTransfer();
    for (const file of files) {
      dt.items.add(file);
    }
    dt.effectAllowed = 'all';

    el.files = dt.files;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    await raf();

    const directSucceeded = el.files !== null && el.files.length === toUse.length;

    if (!directSucceeded) {
      const dropZone = findBestDropZone(el);
      if (dropZone) {
        dispatchDragSequence(dropZone, dt);
        await raf();
      }
    }

    return el.files !== null && el.files.length > 0;
  } catch (err) {
    console.error('Failed to fill file input:', err);
    return false;
  }
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
// Drop-zone fallback
// ============================================================

const MAX_ANCESTOR_DEPTH = 8;

function findBestDropZone(el: HTMLInputElement): HTMLElement | null {
  // Most reliable signal there is: an explicit <label for="..."> anywhere
  // in the document, regardless of DOM nesting relative to the input.
  if (el.id) {
    const explicit = document.querySelector(`label[for="${escapeForSelector(el.id)}"]`);
    if (explicit) return explicit as HTMLElement;
  }

  // Walk up the ancestor chain. A wrapping <label> is automatically a valid
  // target (implicit label association needs no naming convention at all).
  // Other ancestors — and their OTHER children, since many upload widgets
  // place the visual drop zone as a SIBLING of a (often visually hidden)
  // input under a shared wrapper, rather than nesting the input inside the
  // zone — need an actual drop-zone-like marker.
  let node: HTMLElement | null = el.parentElement;
  let depth = 0;
  while (node && depth < MAX_ANCESTOR_DEPTH) {
    if (node.tagName === 'LABEL') return node;
    if (looksLikeDropZoneMarker(node)) return node;

    for (const child of Array.from(node.children)) {
      if (child === el || child.contains(el)) continue;
      if (looksLikeDropZoneMarker(child as HTMLElement)) return child as HTMLElement;
    }

    node = node.parentElement;
    depth++;
  }

  return null;
}

function looksLikeDropZoneMarker(el: HTMLElement): boolean {
  if (el.getAttribute('role') === 'button') return true;

  const text = [
    Array.from(el.classList).join(' '),
    el.id,
    el.getAttribute('data-testid') || ''
  ].join(' ').toLowerCase();

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

  for (const type of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
      clientX,
      clientY
    }));
  }
}

function raf(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export class FileFiller implements FieldFiller {
  supports(el: any, key: string, val: any): boolean {
    return el instanceof Element && el.tagName.toUpperCase() === 'INPUT' && (el as HTMLInputElement).type === 'file';
  }

  async fill(el: any, val: any, context: FillContext): Promise<boolean> {
    let docMetadata = val as { name?: string; type?: string } | undefined;
    let targetKey = context.key;

    if (!docMetadata || !docMetadata.name) {
      if (context.key === 'documents.cv') {
        targetKey = 'documents.resume';
        docMetadata = context.getValueByPath(context.profile, targetKey);
      } else if (context.key === 'documents.resume') {
        targetKey = 'documents.cv';
        docMetadata = context.getValueByPath(context.profile, targetKey);
      }
    }

    if (docMetadata && docMetadata.name) {
      try {
        const fileBytes = await context.getFileBlob(targetKey);
        if (fileBytes) {
          return await fillFileInput(
            el as HTMLInputElement,
            fileBytes,
            docMetadata.name,
            docMetadata.type ?? 'application/octet-stream'
          );
        }
      } catch (e) {
        console.warn(`FormFilla: could not load binary bytes for "${targetKey}" from storage`, e);
      }
    }
    return false;
  }
}