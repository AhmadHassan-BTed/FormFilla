import { DEBOUNCE_MS } from '../../shared/constants/constants.js';
import { scanForFields, ScanOptions } from './field-scanner.js';
import { DateFieldGroup } from '../../shared/types/index.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Attributes that can flip an element between fillable and non-fillable
 * without any node being added or removed (mirrors the signals field-scanner
 * itself keys off of: display/visibility, hidden/disabled state, ARIA
 * hidden/disabled, contenteditable, role upgrades, native `type` changes,
 * and <details open>). Scoped narrowly on purpose - unfiltered `attributes:
 * true` on a busy page would fire on every unrelated class/style churn.
 */
const WATCHED_ATTRIBUTES = [
  'style',
  'class',
  'hidden',
  'disabled',
  'aria-hidden',
  'aria-disabled',
  'contenteditable',
  'role',
  'inert',
  'type',
  'open'
];

const OBSERVE_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: WATCHED_ATTRIBUTES
};

/**
 * Trailing debounce coalesces bursty mutations into one scan, but a
 * trailing-only debounce can starve indefinitely if mutations never stop
 * arriving (animations, virtualized lists, chatty frameworks) - each new
 * mutation would keep pushing the flush further away forever. Capping the
 * wait at a bounded multiple of DEBOUNCE_MS guarantees a flush eventually
 * fires even under continuous mutation pressure, while still being large
 * enough to let several debounce cycles' worth of activity coalesce.
 */
const MAX_WAIT_MULTIPLIER = 6;
const MAX_WAIT_MS = DEBOUNCE_MS * MAX_WAIT_MULTIPLIER;

// =============================================================================
// Tree discovery
// =============================================================================

interface ObservationTargets {
  shadowRoots: ShadowRoot[];
  iframes: HTMLIFrameElement[];
}

/**
 * Finds every shadow host and <iframe> in `node`'s own tree (checking `node`
 * itself too, not just its descendants, so a shadow host or iframe passed
 * in directly - e.g. as a freshly added node - is never missed). Does not
 * recurse into what it finds; the caller decides whether/how to descend
 * further, since watch() needs to register observers as it goes rather than
 * eagerly walk everything up front.
 */
function discoverObservationTargets(node: Node): ObservationTargets {
  const shadowRoots: ShadowRoot[] = [];
  const iframes: HTMLIFrameElement[] = [];

  const visit = (el: Element) => {
    if (el.shadowRoot) shadowRoots.push(el.shadowRoot);
    if (el.tagName === 'IFRAME') iframes.push(el as HTMLIFrameElement);
  };

  if (node.nodeType === Node.ELEMENT_NODE) {
    visit(node as Element);
  }

  const doc = node.nodeType === Node.DOCUMENT_NODE ? (node as Document) : node.ownerDocument;
  if (doc) {
    const walker = doc.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let current = walker.nextNode() as Element | null;
    while (current) {
      visit(current);
      current = walker.nextNode() as Element | null;
    }
  }

  return { shadowRoots, iframes };
}

// =============================================================================
// Minimal-roots reduction
// =============================================================================

/**
 * Reduces a batch of "changed" elements down to the minimal set of roots
 * that still covers everything - dropping any element that's a descendant
 * of another element already in the batch, since scanning the ancestor
 * already covers it. Frameworks routinely deliver a container-insertion and
 * several of its children as separate mutation records in the very same
 * batch; scanning every one of them independently would re-walk the same
 * subtree repeatedly and (worse, before dedup) report the same field
 * more than once.
 *
 * A batch can legitimately mix elements from unrelated trees (the main
 * document plus one or more shadow roots / iframe documents, all mutating
 * inside the same debounce window), and DOM ordering/`contains()` are only
 * meaningful *within* a single tree - so elements are first bucketed by
 * their root node (`getRootNode()`, which correctly respects shadow
 * boundaries), then reduced independently within each bucket.
 *
 * Within one tree, document order (a preorder walk) gives every subtree a
 * contiguous interval, and two such intervals are always either nested or
 * fully disjoint, never partially overlapping. That means once a node is
 * confirmed to fall *outside* the most recently kept root's interval, it is
 * provably outside every earlier kept root's interval too (each already
 * closed off before the next one began) - so a single sorted pass, checking
 * only the last kept root, is sufficient. That turns an apparent O(n^2)
 * containment problem into an O(n log n) sort plus one O(n) pass.
 */
function reduceToMinimalRoots(elements: Element[]): Element[] {
  if (elements.length <= 1) return elements;

  const buckets = new Map<Node, Element[]>();
  for (const el of elements) {
    const key = el.getRootNode();
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(el);
    } else {
      buckets.set(key, [el]);
    }
  }

  const result: Element[] = [];
  for (const bucket of buckets.values()) {
    result.push(...reduceWithinOneTree(bucket));
  }
  return result;
}

function reduceWithinOneTree(elements: Element[]): Element[] {
  if (elements.length <= 1) return elements;

  const sorted = [...elements].sort((a, b) => {
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  const roots: Element[] = [];
  for (const el of sorted) {
    const lastRoot = roots[roots.length - 1];
    if (!lastRoot || !lastRoot.contains(el)) {
      roots.push(el);
    }
  }
  return roots;
}

// =============================================================================
// Reported-field identity
// =============================================================================

/**
 * The individual elements that make up a reported item, used both to
 * deduplicate against previously-reported fields and to detect removal.
 * A date-group's identity is its three constituent controls, not the
 * (freshly-allocated-per-scan) DateFieldGroup wrapper object itself, which
 * would never compare equal across two separate scanForFields() calls even
 * when it describes the exact same fields.
 */
function getIdentityElements(item: Element | DateFieldGroup): Element[] {
  if ('type' in item && item.type === 'date-group') {
    return [item.monthEl, item.dayEl, item.yearEl];
  }
  return [item as Element];
}

function isExtensionContextInvalidated(): boolean {
  try {
    return !chrome?.runtime?.id;
  } catch {
    return true;
  }
}

// =============================================================================
// Public API
// =============================================================================

export function watch(
  root: Node,
  onNewFields: (newFields: (Element | DateFieldGroup)[]) => void,
  onRemovedFields?: (removedFields: Element[]) => void,
  options?: ScanOptions
): () => void {
  const pending = new Set<Element>();
  const reportedFields = new Set<Element>();
  const observedRoots = new WeakSet<Node>();
  const iframeLoadHandlers = new Map<HTMLIFrameElement, () => void>();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let firstPendingAt: number | null = null;

  const cleanup = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    observer.disconnect();
    for (const [iframe, handler] of iframeLoadHandlers) {
      iframe.removeEventListener('load', handler);
    }
    iframeLoadHandlers.clear();
  };

  function observeTarget(target: Node): boolean {
    if (observedRoots.has(target)) return false;
    observedRoots.add(target);
    try {
      observer.observe(target, OBSERVE_OPTIONS);
    } catch {
      // Target became invalid between discovery and registration; nothing
      // useful to do beyond skipping it.
      return false;
    }
    return true;
  }

  // Recursively finds shadow roots / iframes under `node` and starts
  // observing each newly-found one - including whatever is nested *inside*
  // them, arbitrarily deep, since MutationObserver's `subtree: true` does
  // not itself cross shadow boundaries (each shadow root needs its own
  // explicit observe() call).
  function discoverAndRegister(node: Node): void {
    const { shadowRoots, iframes } = discoverObservationTargets(node);

    for (const shadowRoot of shadowRoots) {
      if (observeTarget(shadowRoot)) {
        discoverAndRegister(shadowRoot);
      }
    }

    iframes.forEach(registerIframe);
  }

  // Same-origin iframes need their own handling because their content can
  // be inaccessible or not-yet-navigated at the moment the <iframe> element
  // itself appears: contentDocument may briefly be an empty placeholder
  // document that gets entirely replaced once real navigation completes. A
  // `load` listener re-establishes observation on whatever document is
  // current and schedules a scan of it, so content that wasn't there yet at
  // discovery time is still picked up once it actually renders.
  function registerIframe(iframe: HTMLIFrameElement): void {
    if (iframeLoadHandlers.has(iframe)) return;

    const tryObserveCurrentDocument = (): Document | null => {
      let doc: Document | null = null;
      try {
        doc = iframe.contentDocument;
      } catch {
        doc = null;
      }
      if (doc) {
        observeTarget(doc);
        discoverAndRegister(doc);
      }
      return doc;
    };

    const handler = () => {
      const doc = tryObserveCurrentDocument();
      if (doc?.documentElement) {
        pending.add(doc.documentElement);
        scheduleFlush();
      }
    };

    iframeLoadHandlers.set(iframe, handler);
    iframe.addEventListener('load', handler);

    // Cover the case where the iframe is already loaded right now (e.g. it
    // existed before watch() started, or navigation finished before this
    // element was even discovered) without waiting on a load event that may
    // never fire again.
    tryObserveCurrentDocument();
  }

  function scheduleFlush(): void {
    const now = Date.now();
    if (firstPendingAt === null) {
      firstPendingAt = now;
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    const elapsedSinceFirstPending = now - firstPendingAt;
    const delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - elapsedSinceFirstPending));
    timeoutId = setTimeout(flush, delay);
  }

  function flush(): void {
    if (isExtensionContextInvalidated()) {
      cleanup();
      return;
    }

    timeoutId = null;
    firstPendingAt = null;

    const rootsToScan = reduceToMinimalRoots(Array.from(pending).filter(el => el.isConnected));
    pending.clear();

    const discovered: (Element | DateFieldGroup)[] = [];
    for (const scanRoot of rootsToScan) {
      discovered.push(...scanForFields(scanRoot, options));
    }

    const newFields: (Element | DateFieldGroup)[] = [];
    for (const item of discovered) {
      const identityEls = getIdentityElements(item);
      // Only treat it as fully-known (and skip it) once *every* constituent
      // element has already been reported. A date-group whose year field
      // just finished rendering, when month/day were already reported
      // standalone moments earlier, is genuinely new information - the
      // grouping itself - even though 2 of its 3 elements aren't new.
      if (identityEls.every(el => reportedFields.has(el))) continue;

      identityEls.forEach(el => reportedFields.add(el));
      newFields.push(item);
    }

    if (newFields.length > 0) {
      onNewFields(newFields);
    }

    // Sweep every previously-reported field for disconnection on every
    // flush (not only when onRemovedFields is supplied) so the registry
    // can't grow without bound over a long, churn-heavy session even when
    // the caller doesn't care about removals.
    if (reportedFields.size > 0) {
      const disconnected: Element[] = [];
      for (const el of reportedFields) {
        if (!el.isConnected) disconnected.push(el);
      }
      if (disconnected.length > 0) {
        disconnected.forEach(el => reportedFields.delete(el));
        onRemovedFields?.(disconnected);
      }
    }
  }

  const observer = new MutationObserver(records => {
    if (isExtensionContextInvalidated()) {
      cleanup();
      return;
    }

    let needsFlush = false;

    for (const record of records) {
      if (record.target.nodeType === Node.ELEMENT_NODE) {
        const targetEl = record.target as Element;
        if (targetEl.tagName === 'SELECT' && record.type === 'childList') {
          reportedFields.delete(targetEl);
          onRemovedFields?.([targetEl]);
        }
      }

      for (const node of Array.from(record.addedNodes)) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          pending.add(el);
          discoverAndRegister(el);
          needsFlush = true;
        }
      }

      if (record.removedNodes.length > 0) {
        needsFlush = true;
      }

      if (record.type === 'attributes' && record.target.nodeType === Node.ELEMENT_NODE) {
        pending.add(record.target as Element);
        needsFlush = true;
      }
    }

    if (needsFlush) {
      scheduleFlush();
    }
  });

  // Register observation for whatever shadow roots / iframes already exist
  // in `root` at watch()-start, so their *future* changes are caught, then
  // start observing `root` itself. This deliberately does not scan/report
  // root's pre-existing content - callers are expected to have already
  // scanned it (scanForFields already recurses into same-origin iframes and
  // open shadow roots on its own), so watch() only ever reports genuinely
  // new activity from this point forward.
  discoverAndRegister(root);
  observeTarget(root);

  return cleanup;
}