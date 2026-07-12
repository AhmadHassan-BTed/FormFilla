/**
 * Sets a form control's value the way real user input does — bypassing
 * React's (and similar frameworks') internal "value tracker", which
 * intercepts a plain `el.value = x` assignment and silently marks it as
 * already-seen, so the framework's onChange never fires and the UI never
 * updates even though the DOM's raw value technically changed.
 *
 * The fix: call the value setter defined on the element's PROTOTYPE
 * directly (via Function.prototype.call), rather than through whatever
 * accessor is currently installed on the specific DOM node instance.
 * Frameworks install their tracking wrapper on the instance, not the
 * prototype, so this reaches the real, underlying setter and leaves no
 * trace for the tracker to compare against — exactly what a genuine,
 * externally-driven change looks like.
 *
 * Handles <input>, <textarea>, and <select> uniformly. (Previously each
 * caller that needed the <select> case reimplemented its own copy of this
 * same logic; this is the one shared version.)
 *
 * Defense in depth: if the current page has somehow replaced the relevant
 * prototype's own value descriptor (rare — an aggressive polyfill or
 * anti-automation script), the direct prototype lookup fails silently and
 * falls back to a plain `el.value =` assignment — precisely the bug this
 * function exists to avoid. To cover that case too, there's a second
 * fallback: a hidden, same-origin `about:blank` iframe's own, untouched
 * copy of the same built-in prototype. Blank iframes get a fully
 * independent set of global constructors, synchronously available as soon
 * as they're attached — a standard, well-established technique for
 * recovering an unpatched native reference.
 */

export interface SetNativeValueOptions {
  /**
   * Which events to dispatch after the value is set. Default: both —
   * matching a real, completed field edit (`input` per keystroke/commit,
   * `change` on blur/commit). Pass `['input']` or `[]` for intermediate
   * steps, e.g. simulating individual keystrokes, where firing `change`
   * on every character would be wrong (real typing never does that).
   */
  events?: Array<'input' | 'change'>;
  /**
   * The `inputType` reported on the dispatched `input` event, for any
   * framework or masked-input library that branches on it. Default
   * 'insertReplacementText' — the standard value for "this field's
   * content was replaced as a single operation," which is what this
   * function actually does (as opposed to, say, 'insertFromPaste', which
   * would misrepresent it as a clipboard paste to anything that cares).
   */
  inputType?: string;
}

type Settable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const DEFAULT_EVENTS: Array<'input' | 'change'> = ['input', 'change'];

/**
 * Sets `value` on an <input>, <textarea>, or <select> using the native
 * setter bypass, then dispatches the requested notification events.
 * Returns whether the value actually stuck (`el.value === value`
 * afterward) — for a <select>, that's a meaningful signal too, since
 * setting a value with no matching <option> generally leaves the
 * select's value unchanged rather than throwing.
 */
export function setNativeValue(el: Settable, value: string, options?: SetNativeValueOptions): boolean {
  const events = options?.events ?? DEFAULT_EVENTS;

  const setter = resolveNativeSetter(el);
  if (setter) {
    setter(value);
  } else {
    el.value = value;
  }

  for (const eventName of events) {
    el.dispatchEvent(
      eventName === 'input'
        ? buildInputEvent(options?.inputType)
        : new Event('change', { bubbles: true, composed: true })
    );
  }

  return el.value === value;
}

/**
 * `setNativeValue(el, value, { events: [] })` — sets the value with the
 * same bypass, but dispatches nothing, for callers (like a
 * keystroke-by-keystroke typing simulation) that will dispatch their own,
 * more detailed events per character instead.
 */
export function setNativeValueSilently(el: Settable, value: string): boolean {
  return setNativeValue(el, value, { events: [] });
}

// ============================================================
// Native setter resolution, with a pristine-iframe fallback
// ============================================================

function resolveNativeSetter(el: Settable): ((value: string) => void) | null {
  const ownSetter = lookupSetter(el, safeWindow());
  if (ownSetter) return ownSetter;

  const pristine = getPristineWindow();
  if (pristine) {
    const pristineSetter = lookupSetter(el, pristine);
    if (pristineSetter) return pristineSetter;
  }

  return null;
}

function lookupSetter(el: Settable, ownerWindow: Window | null): ((value: string) => void) | null {
  const proto = ownerWindow && getPrototypeFor(el, ownerWindow);
  const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : undefined;
  return setter ? (value: string) => setter.call(el, value) : null;
}

function getPrototypeFor(el: Element, ownerWindow: Window): object | null {
  try {
    const tagName = el.tagName.toUpperCase();
    const win = ownerWindow as any;
    if (tagName === 'TEXTAREA') return win.HTMLTextAreaElement.prototype;
    if (tagName === 'SELECT') return win.HTMLSelectElement.prototype;
    return win.HTMLInputElement.prototype;
  } catch {
    return null;
  }
}

function safeWindow(): Window | null {
  try {
    return window;
  } catch {
    return null;
  }
}

let cachedPristineWindow: Window | null | undefined;

function getPristineWindow(): Window | null {
  if (cachedPristineWindow !== undefined) return cachedPristineWindow;

  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    (document.body ?? document.documentElement).appendChild(iframe);
    cachedPristineWindow = iframe.contentWindow;
  } catch {
    cachedPristineWindow = null;
  }

  return cachedPristineWindow;
}

// ============================================================
// Event construction
// ============================================================

function buildInputEvent(inputType?: string): Event {
  try {
    return new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: inputType ?? 'insertReplacementText',
      data: null
    });
  } catch {
    return new Event('input', { bubbles: true, composed: true });
  }
}