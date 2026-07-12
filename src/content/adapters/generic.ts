import { IPlatformAdapter, PlatformCapabilities, ScanRoot } from './adapter.interface.js';

/**
 * Fallback adapter used whenever no platform-specific adapter matches.
 * Because it's the last line of defense on unknown/custom career portals, it
 * carries the most generic-but-thorough field discovery logic:
 *  - pierces open shadow roots and same-origin iframes
 *  - recognizes ARIA-based custom widgets and contenteditable fields, not
 *    just native <input>/<select>/<textarea>
 *  - waits out SPA hydration before a scan is considered final
 *  - filters out candidates that would do more harm than good to fill:
 *    honeypots, disabled/readonly fields, credentials, and site chrome
 */
export class GenericAdapter implements IPlatformAdapter {
  readonly id = 'generic';

  /** Always the lowest priority — only wins when no platform-specific adapter claims the page. */
  readonly priority = 0;

  readonly capabilities: PlatformCapabilities = {
    usesShadowDom: true,
    usesIframes: true,
    isAsyncRendered: true,
  };

  private static readonly CUSTOM_FIELD_SELECTORS: readonly string[] = [
    '[role="textbox"]',
    '[role="searchbox"]',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="radio"]',
    '[role="radiogroup"]',
    '[role="checkbox"]',
    '[role="switch"]',
    '[role="spinbutton"]',
    '[role="slider"]',
    '[aria-pressed]',
    '[aria-haspopup="listbox"]',
    '[contenteditable="true"]',
    '[contenteditable=""]',
  ];

  /** Generic is the catch-all: it matches every page. */
  matches(): boolean {
    return true;
  }

  /**
   * Polls the count of field-like elements (native + custom) until it holds
   * steady for two consecutive checks, up to a hard ceiling of `timeoutMs`.
   * This is a framework-agnostic stand-in for "the SPA finished hydrating" —
   * it doesn't know anything about a specific stack, it just waits until
   * fields stop appearing.
   */
  async waitUntilReady(timeoutMs = 4000): Promise<void> {
    const pollIntervalMs = 150;
    const requiredQuietPolls = 2;
    const deadline = Date.now() + timeoutMs;
    const selector = ['input', 'select', 'textarea', ...this.getCustomFieldSelectors()].join(',');

    let lastCount = -1;
    let quietPolls = 0;

    while (Date.now() < deadline) {
      const count = document.querySelectorAll(selector).length;

      if (count === lastCount) {
        quietPolls += 1;
        if (quietPolls >= requiredQuietPolls) return;
      } else {
        quietPolls = 0;
        lastCount = count;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  /** Safe, non-destructive prep: opens native <details> sections so fields inside them aren't missed. */
  beforeScan(): void {
    document.querySelectorAll('details:not([open])').forEach((details) => {
      (details as HTMLDetailsElement).open = true;
    });
  }

  /**
   * Recursively discovers open shadow roots and same-origin iframe documents
   * so the scanner can search inside them too.
   *
   * Two limitations are inherent to the web platform and can't be worked
   * around from a content script — by FormFilla or anyone else: shadow roots
   * created with `{ mode: 'closed' }` are inaccessible by design, and
   * cross-origin iframes are blocked by the same-origin policy.
   */
  getExtraScanRoots(): ScanRoot[] {
    const roots: ScanRoot[] = [];
    try {
      this.collectRoots(document, roots, new Set<ScanRoot>());
    } catch (error) {
      console.warn('[FormFilla] GenericAdapter: shadow DOM / iframe discovery failed', error);
    }
    return roots;
  }

  private collectRoots(root: ScanRoot, out: ScanRoot[], seen: Set<ScanRoot>): void {
    if (seen.has(root)) return;
    seen.add(root);

    const descendants = Array.from(root.querySelectorAll('*'));
    const elements = root instanceof Element ? [root, ...descendants] : descendants;

    for (const el of elements) {
      if (el.shadowRoot) {
        out.push(el.shadowRoot);
        this.collectRoots(el.shadowRoot, out, seen);
      }

      if (el instanceof HTMLIFrameElement) {
        const doc = this.getSameOriginDocument(el);
        if (doc && doc.readyState !== 'loading') {
          out.push(doc);
          this.collectRoots(doc, out, seen);
        }
      }
    }
  }

  private getSameOriginDocument(frame: HTMLIFrameElement): Document | null {
    try {
      return frame.contentDocument;
    } catch {
      return null; // cross-origin — blocked by the browser's same-origin policy, not fixable client-side
    }
  }

  /**
   * Selectors for field-like elements a plain input/select/textarea query
   * would miss: ARIA-based custom widgets and rich-text (contenteditable)
   * fields, both extremely common in the component libraries custom/in-house
   * career portals tend to be built with.
   */
  getCustomFieldSelectors(): string[] {
    return [...GenericAdapter.CUSTOM_FIELD_SELECTORS];
  }

  /**
   * Filters out candidates that would be actively harmful or pointless to
   * fill: disabled/readonly fields, credentials and payment details (best
   * left to the browser's own secure managers), site-chrome search boxes,
   * and honeypot traps — invisible fields anti-bot scripts rely on being
   * filled blindly. Getting this wrong in the "include" direction is exactly
   * how an autofiller gets a real application auto-rejected as spam.
   */
  shouldExcludeElement(element: Element): boolean {
    return (
      this.isDisabledOrReadonly(element) ||
      this.isCredentialOrPaymentField(element) ||
      this.isSiteChrome(element) ||
      this.isHiddenFromUser(element)
    );
  }

  private isDisabledOrReadonly(element: Element): boolean {
    if (element.getAttribute('aria-disabled') === 'true') return true;

    const tag = element.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
      const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;
      if (control.disabled) return true;
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if ((element as HTMLInputElement | HTMLTextAreaElement).readOnly) return true;
    }
    return false;
  }

  private isCredentialOrPaymentField(element: Element): boolean {
    const type = (element.getAttribute('type') || '').toLowerCase();
    const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();
    return type === 'password' || autocomplete.startsWith('cc-') || autocomplete === 'one-time-code';
  }

  private isSiteChrome(element: Element): boolean {
    const type = (element.getAttribute('type') || '').toLowerCase();
    const role = (element.getAttribute('role') || '').toLowerCase();
    return type === 'search' || role === 'search' || element.closest('[role="search"]') !== null;
  }

  /**
   * True when a human couldn't currently see or reach this element — either
   * because it's conditionally hidden (an inactive wizard step, a collapsed
   * section) or because it's positioned off-screen the way honeypot fields
   * usually are. type=file/checkbox/radio are exempt: hiding the native
   * control behind a styled label or button is a completely normal,
   * legitimate pattern for those, not a sign of anything suspicious.
   *
   * Deliberately reads resolved *style values* (display/visibility/position/
   * offsets) rather than getBoundingClientRect(). A bounding rect depends on
   * layout having actually run, which can lag a field's appearance by a
   * frame or two on a busy SPA and would falsely flag a real field mid-scan;
   * style resolution doesn't have that race.
   */
  private isHiddenFromUser(element: Element): boolean {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (type === 'file' || type === 'checkbox' || type === 'radio') return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return true;

    const isPositioned = style.position === 'absolute' || style.position === 'fixed';
    if (!isPositioned) return false;

    // Two classic honeypot/"sr-only" signatures: pushed far outside the
    // viewport, or clipped down to a near-zero box.
    const isFarOffscreen = (raw: string): boolean => {
      const value = parseFloat(raw);
      return Number.isFinite(value) && Math.abs(value) > 2000;
    };
    if (
      isFarOffscreen(style.left) ||
      isFarOffscreen(style.top) ||
      isFarOffscreen(style.right) ||
      isFarOffscreen(style.bottom)
    ) {
      return true;
    }

    const isTinyDimension = (raw: string): boolean => {
      const value = parseFloat(raw);
      return Number.isFinite(value) && value <= 2;
    };
    return isTinyDimension(style.width) && isTinyDimension(style.height) && style.overflow === 'hidden';
  }

  /**
   * Best-effort accessible-name resolution, loosely following the browser's
   * own accessible-name algorithm: aria-labelledby, then aria-label, then an
   * associated <label for>, then a wrapping <label>, then aria-describedby,
   * then placeholder as a last resort. This is the single biggest lever for
   * not misidentifying a field, so it's exposed here as a standalone helper.
   *
   * It isn't wired into enrichSignals() yet because that requires knowing
   * the exact shape of FieldSignals from shared/types/index.ts, which
   * wasn't available when this file was written. Call it directly from
   * signal-extractor.ts, or share that file for a follow-up that wires it
   * through enrichSignals() properly.
   */
  resolveAccessibleLabel(element: Element): string | null {
    const fromIdRefs = (attr: string): string | null => {
      const value = element.getAttribute(attr);
      if (!value) return null;
      const text = value
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ');
      return text || null;
    };

    const labelledBy = fromIdRefs('aria-labelledby');
    if (labelledBy) return labelledBy;

    const ariaLabel = element.getAttribute('aria-label')?.trim();
    if (ariaLabel) return ariaLabel;

    const id = element.getAttribute('id');
    if (id) {
      const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      const text = forLabel?.textContent?.trim();
      if (text) return text;
    }

    const wrappingLabel = element.closest('label')?.textContent?.trim();
    if (wrappingLabel) return wrappingLabel;

    const describedBy = fromIdRefs('aria-describedby');
    if (describedBy) return describedBy;

    const placeholder = element.getAttribute('placeholder')?.trim();
    if (placeholder) return placeholder;

    return null;
  }
}