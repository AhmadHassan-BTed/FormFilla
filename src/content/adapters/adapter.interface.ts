import { FieldSignals, ScoredField } from '../../shared/types/index.js';

/**
 * A node the scanner can search within for fields.
 * - Document: the top-level page, or a same-origin iframe's document.
 * - ShadowRoot: an open shadow root attached to a custom element.
 * - Element: an arbitrary subtree (e.g. a panel or modal an adapter wants
 *   scanned in isolation).
 */
export type ScanRoot = Document | ShadowRoot | Element;

/**
 * Declares what a platform's markup requires, so the orchestrator can prepare
 * the right strategy (pierce shadow DOM, wait for hydration, re-scan per
 * step) before it calls the rest of the adapter's hooks.
 */
export interface PlatformCapabilities {
  /** Fields live inside one or more open shadow roots. */
  usesShadowDom?: boolean;
  /** Fields live inside same-origin iframes. */
  usesIframes?: boolean;
  /** Multi-step / paginated wizard — only the current step's fields exist in the DOM at once. */
  isMultiStep?: boolean;
  /** Fields render asynchronously after initial load (client routing, lazy hydration, etc.). */
  isAsyncRendered?: boolean;
}

export interface IPlatformAdapter {
  /** Stable identifier for logging/telemetry/debugging (e.g. "workday", "greenhouse", "generic"). */
  readonly id?: string;

  /**
   * Selection priority when more than one adapter's matches() returns true.
   * Specific platform adapters should be > 0; GenericAdapter should be 0 so
   * it only wins when nothing more specific claims the page.
   */
  readonly priority?: number;

  /** What this platform's markup requires from the scanner. Omit anything that doesn't apply. */
  readonly capabilities?: PlatformCapabilities;

  /** Cheap, synchronous check: does this adapter apply to the current page? */
  matches(): boolean;

  /**
   * Resolves once the platform's DOM is stable and safe to scan — after SPA
   * hydration finishes, loading spinners clear, and the first fields exist.
   * The orchestrator should await this (bounded by timeoutMs) before
   * scanning. Omit if matches() returning true already means "ready."
   */
  waitUntilReady?(timeoutMs?: number): Promise<void>;

  /**
   * Runs immediately before each scan pass. Reserve this for safe,
   * non-destructive prep only (e.g. expanding a collapsed section) — never
   * for anything that submits, navigates, or deletes data.
   */
  beforeScan?(): void | Promise<void>;

  /** Runs after a scan pass completes, with the fields that were found and scored. */
  afterScan?(fields: ScoredField[]): void;

  /**
   * Extra root nodes — shadow roots, same-origin iframe documents, detached
   * panels — the scanner should search in addition to the main document.
   * This is the main lever for "the scanner didn't miss anything."
   */
  getExtraScanRoots?(): ScanRoot[];

  /**
   * Additional CSS selectors, evaluated against every scan root, for
   * elements that behave like fields but aren't a plain
   * <input>/<select>/<textarea> — custom comboboxes, rich-text editors,
   * platform-specific date pickers, etc. The scanner is expected to
   * de-duplicate against its own base query.
   */
  getCustomFieldSelectors?(): string[];

  /**
   * Return true to drop a candidate element before it's ever scored — e.g. a
   * honeypot trap, a password field better left to the browser's own
   * manager, or chrome (like a site search box) that only superficially
   * looks like a profile field. The scanner should call this right after
   * collecting candidates and before building signals for them.
   */
  shouldExcludeElement?(element: Element): boolean;

  /**
   * Lets a platform repair or extend the signals extracted for one field —
   * e.g. resolving a label that lives several DOM levels away in this
   * platform's component library. Return the (possibly modified) signals;
   * never mutate `baseSignals` in place.
   */
  enrichSignals?(element: Element, baseSignals: FieldSignals): FieldSignals;

  /**
   * Force a specific mapping for a field the generic scorer is known to get
   * wrong on this platform. Return null to defer to normal scoring — that
   * should be the answer for the overwhelming majority of fields, even on
   * platforms that implement this. Reserve overrides for confirmed, stable
   * quirks.
   */
  scoreOverride?(signals: FieldSignals): ScoredField | null;

  /**
   * Platform-specific containers for repeated sections (e.g. "Add another
   * position") for when the generic repeated-block detector's layout
   * heuristics don't match this platform's markup.
   */
  getRepeatedBlockContainers?(): Element[];
}