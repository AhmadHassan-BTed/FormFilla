import { bestMatch } from '../matching/fuzzy.js';
import { setNativeValue } from './native-setter.js';
import { FieldFiller, FillContext } from './filler.interface.js';

/**
 * Fills any combobox / autocomplete / searchable-select widget, then selects
 * the best-matching option.
 *
 * Strategy, in order:
 *  1. Native <input list="..."> datalist -> handled directly, no DOM options exist to click.
 *  2. Open the dropdown (skip if already open, so we don't toggle it shut).
 *  3. Resolve the real proxy input to type into — it may not be nested inside
 *     the trigger at all (React-select/MUI/Radix/Ant Design/Headless UI all
 *     portal their popover to <body>), so this checks focus movement first.
 *  4. Type using the native property setter (bypasses React's controlled-input
 *     tracking, which a plain `el.value = x` silently fails to update).
 *  5. Scope the option search to the dropdown's own aria-controls/aria-owns
 *     container when possible, so a second, closed-but-not-removed combobox
 *     elsewhere on the page can't be mistaken for this one; falls back to a
 *     document-wide search if that scope turns out to be empty or absent.
 *  6. Wait for options via MutationObserver (fast, no fixed poll interval),
 *     with a short settle window for async/debounced result batches.
 *  7. Fuzzy-match and click using a full pointer/mouse event sequence, since
 *     several libraries bind selection to mousedown rather than click.
 */
export interface FillComboboxOptions {
  extraOptionSelectors?: string[];
  matchThreshold?: number;
  optionsTimeoutMs?: number;
  openTimeoutMs?: number;
  keystrokeDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<FillComboboxOptions> = {
  extraOptionSelectors: [],
  matchThreshold: 0.6,
  optionsTimeoutMs: 2000,
  openTimeoutMs: 800,
  keystrokeDelayMs: 12
};

const LIBRARY_OPTION_SELECTORS = [
  '.select2-results__option',
  '.choices__list--dropdown .choices__item',
  '.choices__item--choice',
  '.chosen-drop li.active-result',
  '.ui-menu-item-wrapper',
  '.tt-menu .tt-suggestion',
  '.tt-dataset .tt-suggestion',
  '.el-select-dropdown__item',
  '.p-dropdown-item',
  '.p-autocomplete-item',
  '.p-select-option',
  '.n-base-select-option',
  '.MuiAutocomplete-option',
  '.ant-select-item-option',
  '.autocomplete-suggestion',
  '.autocomplete-option',
  '.autocomplete-item',
  'li[data-option]',
  '[data-option]'
];

const MENU_CONTAINER_SELECTORS = [
  '[role="listbox"]',
  '[role="menu"]',
  '.select2-results',
  '.chosen-results',
  'ul[class*="dropdown"]'
];

const SPECIAL_KEY_CODES: Record<string, number> = {
  Escape: 27,
  Enter: 13,
  Tab: 9,
  ArrowDown: 40,
  ArrowUp: 38,
  Backspace: 8,
  ' ': 32
};

export async function fillCombobox(
  triggerEl: Element,
  value: string,
  options?: FillComboboxOptions
): Promise<boolean> {
  const opts: Required<FillComboboxOptions> = { ...DEFAULT_OPTIONS, ...options };
  const htmlTrigger = triggerEl as HTMLElement;

  try {
    if (!value || value.trim() === '') return false;
    if (isDisabledOrReadonly(htmlTrigger)) return false;

    const datalist = getNativeDatalist(htmlTrigger);
    if (datalist) {
      return fillNativeDatalistInput(htmlTrigger as HTMLInputElement, datalist, value, opts.matchThreshold);
    }

    const previousActive = document.activeElement;
    await openDropdown(htmlTrigger, opts.openTimeoutMs);

    const proxyInput = resolveProxyInput(htmlTrigger, previousActive);
    await typeIntoProxy(proxyInput, value, opts.keystrokeDelayMs);

    const listboxScope = findExplicitListbox(htmlTrigger, proxyInput);
    let candidates = await waitForOptions(
      () => queryOptionElements(listboxScope ?? document, opts.extraOptionSelectors),
      opts.optionsTimeoutMs
    );

    if (candidates.length === 0 && listboxScope) {
      candidates = await waitForOptions(
        () => queryOptionElements(document, opts.extraOptionSelectors),
        Math.min(500, opts.optionsTimeoutMs)
      );
    }

    if (candidates.length > 0) {
      const optionTexts = candidates.map(getOptionLabel);
      const matchRes = bestMatch(optionTexts, value);

      if (matchRes.score > opts.matchThreshold) {
        const target = candidates[matchRes.index] as HTMLElement;
        simulateRealClick(target);
        await raf();
        return true;
      }
    }

    closeDropdown(proxyInput);
    return false;
  } catch (err) {
    console.error('Failed to fill combobox:', err);
    return false;
  }
}

async function openDropdown(triggerEl: HTMLElement, timeoutMs: number): Promise<void> {
  if (isDropdownLikelyOpen(triggerEl)) return;

  simulateRealClick(triggerEl);
  await raf();

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isDropdownLikelyOpen(triggerEl)) return;
    await sleep(30);
  }

  triggerEl.focus?.();
  await sleep(20);
  if (isDropdownLikelyOpen(triggerEl)) return;

  dispatchKeyEvent(triggerEl, 'keydown', 'ArrowDown');
  dispatchKeyEvent(triggerEl, 'keyup', 'ArrowDown');
  await sleep(60);
}

function isDropdownLikelyOpen(triggerEl: HTMLElement): boolean {
  if (triggerEl.getAttribute('aria-expanded') === 'true') return true;
  const active = document.activeElement;
  if (active && active !== document.body && active !== triggerEl) return true;
  return queryOptionElements(document, []).some(isElementVisible);
}

function closeDropdown(proxyInput: HTMLElement): void {
  dispatchKeyEvent(proxyInput, 'keydown', 'Escape');
  dispatchKeyEvent(proxyInput, 'keyup', 'Escape');
}

function resolveProxyInput(triggerEl: HTMLElement, previousActive: Element | null): HTMLElement {
  if (triggerEl instanceof HTMLInputElement || isContentEditable(triggerEl)) {
    return triggerEl;
  }

  const active = document.activeElement;
  const activeChanged = active !== null && active !== previousActive && active !== document.body;
  if (activeChanged && isTypableElement(active)) {
    return active;
  }

  const nested = findTypableDescendant(triggerEl);
  if (nested) return nested;

  if (isTypableElement(active) && active !== document.body) {
    return active;
  }

  const linked = findExplicitListbox(triggerEl);
  if (linked) {
    const linkedInput = findTypableDescendant(linked);
    if (linkedInput) return linkedInput;
  }

  return triggerEl;
}

async function typeIntoProxy(proxy: HTMLElement, value: string, keystrokeDelayMs: number): Promise<void> {
  const isInput = proxy instanceof HTMLInputElement;
  const editable = !isInput && isContentEditable(proxy);

  if (isInput) {
    setNativeValueQuiet(proxy, '');
  } else if (editable) {
    proxy.textContent = '';
  }

  let current = '';
  for (const char of value) {
    dispatchKeyEvent(proxy, 'keydown', char);
    dispatchKeyEvent(proxy, 'keypress', char);

    current += char;
    if (isInput) {
      setNativeValueQuiet(proxy, current);
    } else if (editable) {
      proxy.textContent = current;
      placeCaretAtEnd(proxy);
    }
    proxy.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));

    dispatchKeyEvent(proxy, 'keyup', char);
    await sleep(keystrokeDelayMs);
  }

  if (isInput) {
    setNativeValue(proxy, value);
  }
}

function setNativeValueQuiet(el: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const nativeSetter = descriptor?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
}

function placeCaretAtEnd(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function getNativeDatalist(input: HTMLElement): HTMLDataListElement | null {
  if (!(input instanceof HTMLInputElement)) return null;
  const listId = input.getAttribute('list');
  if (!listId) return null;
  const list = document.getElementById(listId);
  return list instanceof HTMLDataListElement ? list : null;
}

function fillNativeDatalistInput(
  input: HTMLInputElement,
  datalist: HTMLDataListElement,
  value: string,
  threshold: number
): boolean {
  const opts = Array.from(datalist.options);

  if (opts.length > 0) {
    const texts = opts.map(o => (o.textContent || '').trim() || o.label || o.value);
    const matchRes = bestMatch(texts, value);
    if (matchRes.score > threshold) {
      setNativeValue(input, opts[matchRes.index].value);
      return true;
    }
  }

  setNativeValue(input, value);
  return true;
}

function findExplicitListbox(...elements: (Element | null)[]): Element | null {
  for (const el of elements) {
    if (!el) continue;
    for (const attr of ['aria-controls', 'aria-owns']) {
      const id = el.getAttribute(attr);
      if (id) {
        const target = document.getElementById(id);
        if (target) return target;
      }
    }
  }

  for (const el of elements) {
    if (!el) continue;
    const activeId = el.getAttribute('aria-activedescendant');
    if (activeId) {
      const activeEl = document.getElementById(activeId);
      const container = activeEl?.closest('[role="listbox"], [role="menu"], ul, ol');
      if (container) return container;
    }
  }

  return null;
}

function queryOptionElements(scope: ParentNode, extraSelectors: string[]): Element[] {
  const found = new Set<Element>();

  scope.querySelectorAll('[role="option"]').forEach(el => found.add(el));

  if (found.size === 0) {
    for (const sel of [...LIBRARY_OPTION_SELECTORS, ...extraSelectors]) {
      try {
        scope.querySelectorAll(sel).forEach(el => found.add(el));
      } catch {
        // caller-supplied selector was invalid, ignore and keep going
      }
    }
  }

  if (found.size === 0) {
    scope.querySelectorAll(MENU_CONTAINER_SELECTORS.join(', ')).forEach(container => {
      Array.from(container.children).forEach(child => found.add(child));
    });
  }

  return Array.from(found);
}

async function waitForOptions(getCandidates: () => Element[], timeoutMs: number): Promise<Element[]> {
  const initial = getCandidates().filter(isElementVisible);
  if (initial.length > 0) {
    await sleep(80);
    return getCandidates().filter(isElementVisible);
  }

  return new Promise(resolve => {
    let settled = false;

    const finishWith = (candidates: Element[]) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(candidates.filter(isElementVisible));
    };

    const observer = new MutationObserver(() => {
      if (settled) return;
      if (getCandidates().filter(isElementVisible).length > 0) {
        observer.disconnect();
        clearTimeout(timer);
        sleep(80).then(() => finishWith(getCandidates()));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden', 'hidden']
    });

    const timer = setTimeout(() => finishWith(getCandidates()), timeoutMs);
  });
}

function getOptionLabel(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

function isElementVisible(el: Element): boolean {
  if (el.hasAttribute('disabled')) return false;

  const ownStyle = window.getComputedStyle(el);
  if (ownStyle.visibility === 'hidden') return false;

  // display:none and opacity:0 on an ANCESTOR hide the whole subtree without
  // that being reflected in a descendant's own computed style. `visibility`
  // doesn't need this walk (getComputedStyle already resolves inheritance
  // and overrides for it correctly), but display and opacity do.
  let node: Element | null = el;
  while (node && node !== document.body) {
    if (node.getAttribute('aria-hidden') === 'true') return false;
    const style = node === el ? ownStyle : window.getComputedStyle(node);
    if (style.display === 'none' || parseFloat(style.opacity) === 0) return false;
    node = node.parentElement;
  }

  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function isDisabledOrReadonly(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if ((el as HTMLInputElement).readOnly) return true;
  return false;
}

function isContentEditable(el: HTMLElement): boolean {
  return el.isContentEditable || el.getAttribute('contenteditable') === 'true';
}

function isTypableElement(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return true;
  return el instanceof HTMLElement && isContentEditable(el);
}

function findTypableDescendant(root: Element): HTMLElement | null {
  const matches = Array.from(root.querySelectorAll('input, [contenteditable="true"]')) as HTMLElement[];
  return matches.find(isElementVisible) ?? matches[0] ?? null;
}

function simulateRealClick(el: HTMLElement): void {
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  const rect = el.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const pointerInit: PointerEventInit = { bubbles: true, cancelable: true, clientX, clientY, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  const mouseInit: MouseEventInit = { bubbles: true, cancelable: true, clientX, clientY, button: 0 };

  el.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
  el.dispatchEvent(new MouseEvent('mousedown', mouseInit));
  el.dispatchEvent(new PointerEvent('pointerup', pointerInit));
  el.dispatchEvent(new MouseEvent('mouseup', mouseInit));
  el.dispatchEvent(new MouseEvent('click', mouseInit));
}

function dispatchKeyEvent(el: HTMLElement, eventName: string, key: string): void {
  let code: string;
  let keyCode: number;

  if (key in SPECIAL_KEY_CODES) {
    code = key === ' ' ? 'Space' : key;
    keyCode = SPECIAL_KEY_CODES[key];
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

  const ev = new KeyboardEvent(eventName, {
    key,
    code,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true
  });
  el.dispatchEvent(ev);
}

function raf(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isComboboxLike(el: Element): boolean {
  return (
    el.getAttribute('role') === 'combobox' ||
    el.getAttribute('aria-haspopup') === 'listbox' ||
    el.classList.contains('select2') ||
    el.classList.contains('combobox')
  );
}

export class ComboboxFiller implements FieldFiller {
  supports(el: any, key: string, val: any): boolean {
    return el instanceof Element && isComboboxLike(el);
  }

  async fill(el: any, val: any, context: FillContext): Promise<boolean> {
    return await fillCombobox(el, context.stringifyValue(val));
  }
}