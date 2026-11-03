import { RepeatedBlock, ArrayBlockType } from '../../shared/types/index.js';
import { scanForFields, ScanOptions } from './field-scanner.js';
import { DateFieldGroup } from '../../shared/types/index.js';
import { arrayShapeSignatures } from '../../shared/dictionary/rules.js';
import { tokenize } from '../matching/normalizer.js';

// =============================================================================
// Configuration
// =============================================================================

/** How many ancestor levels above a field to consider as a possible
 *  repeated-block container. Bounded purely for performance on very large
 *  or deeply-wrapped forms - correctness against coincidental matches at
 *  the wrong level is handled by scoring + conflict resolution below, not
 *  by this bound, so it can stay generous. */
const MAX_CONTAINER_SEARCH_DEPTH = 8;

const MIN_FIELDS_PER_RECORD = 2;
const MIN_REPEATED_INSTANCES = 2;

/** Signal richness from repeated template instances plateaus fast - the
 *  6th "Company Name" label reads the same as the 1st. Capping how many
 *  siblings get sampled for classification keeps cost bounded on very long
 *  repeated lists without losing meaningful signal. */
const MAX_SIBLINGS_FOR_CLASSIFICATION = 5;

// Confidence weights for corroborating a candidate group beyond the bare
// field-shape match (see scoreGroupConfidence). Relative size matters more
// than the absolute numbers: an array-index naming pattern is close to a
// smoking gun, a shared non-generic class is strong, a remove affordance is
// a mild bonus.
const INDEX_PATTERN_WEIGHT = 10;
const CLASS_MATCH_WEIGHT = 5;
const REMOVE_BUTTON_WEIGHT = 3;

/**
 * A candidate group needs at least this much corroborating evidence beyond
 * the bare field-shape match to be accepted at all - not just to win a
 * conflict. Two entirely unrelated sections that coincidentally have the
 * same field-type sequence and share nothing but a page-wide layout class
 * (e.g. both use "row") would otherwise still register as a "repeated
 * block" even when they never conflict with anything else. A single
 * meaningfully-rare shared class (freq within ~5x the group size) or any
 * array-index naming hit clears this easily; a class used by dozens of
 * unrelated elements does not.
 */
const MIN_ACCEPTABLE_SCORE = 0;

// Classification-signal weights: how much a token from each source
// contributes, before IDF discounting. Labels and headings are
// human-authored and reliable; raw `id` attributes are often
// auto-generated/abbreviated and least trustworthy.
const SIGNAL_WEIGHT = {
  indexPrefixHint: 4,
  containerHeading: 4,
  label: 3,
  legend: 2,
  nameLike: 2,
  dataAttribute: 1,
  id: 1
} as const;

const REMOVE_AFFORDANCE_RE = /\b(remove|delete|clear)\b/i;

/** Explicit, named fallback instead of letting whichever category happens
 *  to be first in arrayShapeSignatures' key order win by accident. */
const DEFAULT_BLOCK_TYPE: ArrayBlockType = 'education';

// =============================================================================
// Field-scan caching
// =============================================================================

/**
 * Repeated-block detection inevitably re-examines the same elements from
 * multiple candidate container levels (a container and its children both
 * get scanned when checking neighboring candidates). Memoizing
 * scanForFields per element - now a meaningfully more expensive call, given
 * field-scanner's shadow-DOM/iframe traversal and visibility computation -
 * turns what would be quadratic-ish re-scanning into each element being
 * scanned exactly once.
 */
interface FieldScanCache {
  map: Map<Document | Element, (Element | DateFieldGroup)[]>;
  options?: ScanOptions;
}

function createFieldScanCache(options?: ScanOptions): FieldScanCache {
  return {
    map: new Map(),
    options
  };
}

function getScannedFields(cache: FieldScanCache, el: Document | Element): (Element | DateFieldGroup)[] {
  let result = cache.map.get(el);
  if (!result) {
    result = scanForFields(el, cache.options);
    cache.map.set(el, result);
  }
  return result;
}

function flattenFields(fields: (Element | DateFieldGroup)[]): Element[] {
  const result: Element[] = [];
  for (const f of fields) {
    if ('type' in f && f.type === 'date-group') {
      result.push(f.monthEl, f.dayEl, f.yearEl);
    } else {
      result.push(f as Element);
    }
  }
  return result;
}

// =============================================================================
// Fingerprinting
// =============================================================================

/**
 * A shape signature for a sibling's fields: tag + type, or tag + ARIA role
 * when present (distinguishing e.g. a role=combobox div from a role=switch
 * div, which field-scanner can now both surface but which the old
 * tag-only fingerprint couldn't tell apart), or "date-group" for a detected
 * month/day/year group. Order-preserving, since a genuine repeated block's
 * instances lay their fields out in the same order.
 */
function buildFieldFingerprint(fields: (Element | DateFieldGroup)[]): string {
  return fields
    .map(f => {
      if ('type' in f && f.type === 'date-group') return 'date-group';
      const el = f as Element;
      const role = el.getAttribute('role');
      if (role) return `${el.tagName}[role=${role}]`;
      const type = (el as HTMLInputElement).type || '';
      return `${el.tagName}:${type || 'text'}`;
    })
    .join('|');
}

// =============================================================================
// String pattern utilities
// =============================================================================

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  let prefix = strings[0] ?? '';
  for (let i = 1; i < strings.length; i++) {
    const s = strings[i] ?? '';
    while (prefix.length > 0 && !s.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
    if (prefix === '') return '';
  }
  return prefix;
}

function longestCommonSuffix(strings: string[]): string {
  if (strings.length === 0) return '';
  let suffix = strings[0] ?? '';
  for (let i = 1; i < strings.length; i++) {
    const s = strings[i] ?? '';
    while (suffix.length > 0 && !s.endsWith(suffix)) {
      suffix = suffix.slice(1);
    }
    if (suffix === '') return '';
  }
  return suffix;
}

interface IndexPattern {
  prefix: string;
  suffix: string;
}

/**
 * Detects the "prefix[N]suffix" naming convention array-backed forms almost
 * always use for repeated fields (work[0][title], education_1_school,
 * references.2.email...). Finds the longest common prefix and suffix across
 * the given names, then requires what's left in the middle to be non-empty,
 * distinct per name, and purely numeric - e.g. ["work_0_title",
 * "work_1_title"] -> prefix "work_", suffix "_title", middles ["0","1"].
 * This is about as close to a smoking gun as DOM heuristics get for "these
 * elements are genuinely parallel array entries", so it both raises
 * confidence in the grouping and (via the prefix) feeds classification.
 */
function detectArrayIndexPattern(names: string[]): IndexPattern | null {
  if (names.length < MIN_REPEATED_INSTANCES) return null;
  if (names.some(n => !n)) return null;

  const prefix = longestCommonPrefix(names);
  const withoutPrefix = names.map(n => n.slice(prefix.length));
  const suffix = longestCommonSuffix(withoutPrefix);

  const middles = withoutPrefix.map(s => s.slice(0, s.length - suffix.length));
  if (middles.some(m => m.length === 0)) return null;
  if (new Set(middles).size !== middles.length) return null;
  if (!middles.every(m => /^\d+$/.test(m))) return null;

  return { prefix, suffix };
}

// =============================================================================
// Class-name rarity census
// =============================================================================

/**
 * Counts how many elements (in root's own tree, recursing into open shadow
 * roots) carry each CSS class. A class shared by only a handful of elements
 * is almost certainly template-specific ("experience-entry"); a class
 * shared by hundreds is almost certainly a layout/utility class ("row",
 * "flex", a Tailwind/Bootstrap primitive) that says nothing about whether
 * two elements are genuinely parallel array entries. Used to weight shared
 * classes by rarity rather than treating every shared class as equal
 * evidence - the same "don't let a coincidental generic-layout match masquerade
 * as a semantic one" idea IDF applies to keywords, applied to classes.
 */
function buildClassFrequencyMap(root: Document | Element): Map<string, number> {
  const freq = new Map<string, number>();

  function visit(node: Document | Element | ShadowRoot) {
    const doc = node.nodeType === Node.DOCUMENT_NODE ? (node as Document) : node.ownerDocument;
    if (!doc) return;

    const walker = doc.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let current = walker.nextNode() as Element | null;
    while (current) {
      for (const cls of Array.from(current.classList)) {
        freq.set(cls, (freq.get(cls) || 0) + 1);
      }
      if (current.shadowRoot) {
        visit(current.shadowRoot);
      }
      current = walker.nextNode() as Element | null;
    }
  }

  visit(root);
  return freq;
}

// =============================================================================
// Structural corroboration signals
// =============================================================================

function hasRemoveAffordance(container: Element): boolean {
  const candidates = container.querySelectorAll('button, a, [role="button"]');
  for (const el of Array.from(candidates)) {
    const text = (el.textContent || '').trim();
    const ariaLabel = el.getAttribute('aria-label') || '';
    const title = el.getAttribute('title') || '';
    if (
      REMOVE_AFFORDANCE_RE.test(text) ||
      REMOVE_AFFORDANCE_RE.test(ariaLabel) ||
      REMOVE_AFFORDANCE_RE.test(title)
    ) {
      return true;
    }
  }
  return false;
}

// =============================================================================
// Candidate container discovery
// =============================================================================

/** A grouping parent can legitimately be a ShadowRoot, not just an Element -
 *  e.g. a component that renders its repeated array entries as direct
 *  children of its own shadow root. ShadowRoot implements ParentNode
 *  (`.children` works the same way), it just isn't an Element. */
type ContainerCandidate = Element | ShadowRoot;

/** Duck-typed, realm-safe "is this a ShadowRoot" check (`instanceof` is
 *  unreliable across document/iframe realms; property shape is not). */
function getShadowHost(node: Node): Element | null {
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in node) {
    return (node as ShadowRoot).host;
  }
  return null;
}

function getDepthFrom(node: ContainerCandidate, root: Document | Element): number {
  let depth = 0;
  let current: ContainerCandidate | null = node;
  while (current && current !== root) {
    depth++;
    current = current.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? getShadowHost(current) : (current as Element).parentElement;
  }
  return depth;
}

function collectContainerCandidates(elements: Element[], root: Document | Element): ContainerCandidate[] {
  const candidates = new Set<ContainerCandidate>();

  for (const el of elements) {
    let current: Element | null = el;
    let depth = 0;

    while (current && depth < MAX_CONTAINER_SEARCH_DEPTH) {
      const parentEl: Element | null = current.parentElement;

      if (parentEl) {
        if (parentEl === root) break;
        candidates.add(parentEl);
        current = parentEl;
      } else {
        // No further Element ancestor in this tree. If we're inside a
        // shadow root, its own .children is a legitimate repeated-block
        // parent in its own right (e.g. array entries rendered as direct
        // children of a component's shadow root) - add it, then keep
        // climbing from the shadow host to cover further outer ancestors.
        const shadowRoot = current.getRootNode();
        const host = getShadowHost(shadowRoot);
        if (host && shadowRoot !== root) {
          candidates.add(shadowRoot as ShadowRoot);
        }
        current = host;
      }

      depth++;
    }
  }

  return Array.from(candidates);
}

// =============================================================================
// Candidate group scoring
// =============================================================================

interface CandidateGroup {
  container: ContainerCandidate;
  siblings: Element[];
  score: number;
  indexPrefixHints: string[];
  totalFields: number;
}

function scoreGroupConfidence(
  siblings: Element[],
  flatFieldsBySibling: Map<Element, Element[]>,
  classFrequency: Map<string, number>
): { score: number; indexPrefixHints: string[] } {
  let score = 0;
  const indexPrefixHints: string[] = [];

  // --- Signal: classes shared by every sibling, weighted by rarity ---
  const classSets = siblings.map(s => new Set(Array.from(s.classList)));
  const commonClasses =
    classSets.length > 0
      ? classSets.reduce((acc, set) => new Set([...acc].filter(c => set.has(c))))
      : new Set<string>();

  for (const cls of commonClasses) {
    const freq = classFrequency.get(cls) ?? siblings.length;
    // freq is always >= siblings.length (these siblings themselves carry
    // it), so this ratio is naturally bounded in (0, 1]: 1 means the class
    // appears nowhere else on the page, close to 0 means it's a page-wide
    // utility class contributing almost nothing.
    score += CLASS_MATCH_WEIGHT * (siblings.length / freq);
  }

  // --- Signal: array-index-style naming, checked position by position ---
  const minLength = Math.min(...siblings.map(s => flatFieldsBySibling.get(s)?.length ?? 0));
  for (let pos = 0; pos < minLength; pos++) {
    const namesAtPosition = siblings.map(s => {
      const field = flatFieldsBySibling.get(s)?.[pos] as HTMLElement | undefined;
      return field?.getAttribute('name') || field?.id || '';
    });
    const pattern = detectArrayIndexPattern(namesAtPosition);
    if (pattern) {
      score += INDEX_PATTERN_WEIGHT;
      if (pattern.prefix) indexPrefixHints.push(pattern.prefix);
    }
  }

  // --- Signal: every sibling exposes a plausible "remove this entry" affordance ---
  if (siblings.length > 0 && siblings.every(hasRemoveAffordance)) {
    score += REMOVE_BUTTON_WEIGHT;
  }

  return { score, indexPrefixHints };
}

function collectAllCandidateGroups(
  containers: ContainerCandidate[],
  fieldCache: FieldScanCache,
  classFrequency: Map<string, number>
): CandidateGroup[] {
  const results: CandidateGroup[] = [];

  for (const container of containers) {
    const children = Array.from(container.children);
    if (children.length < MIN_REPEATED_INSTANCES) continue;

    const validChildren = children.filter(
      child => getScannedFields(fieldCache, child).length >= MIN_FIELDS_PER_RECORD
    );
    if (validChildren.length < MIN_REPEATED_INSTANCES) continue;

    const byFingerprint = new Map<string, Element[]>();
    for (const child of validChildren) {
      const fingerprint = buildFieldFingerprint(getScannedFields(fieldCache, child));
      const bucket = byFingerprint.get(fingerprint);
      if (bucket) bucket.push(child);
      else byFingerprint.set(fingerprint, [child]);
    }

    for (const siblings of byFingerprint.values()) {
      if (siblings.length < MIN_REPEATED_INSTANCES) continue;

      const flatFieldsBySibling = new Map(
        siblings.map(s => [s, flattenFields(getScannedFields(fieldCache, s))] as const)
      );
      const { score, indexPrefixHints } = scoreGroupConfidence(siblings, flatFieldsBySibling, classFrequency);
      const totalFields = siblings.reduce((sum, s) => sum + (flatFieldsBySibling.get(s)?.length ?? 0), 0);
      results.push({ container, siblings, score, indexPrefixHints, totalFields });
    }
  }

  return results;
}

// =============================================================================
// Conflict resolution
// =============================================================================

/**
 * Two groups "overlap" if any sibling from one is the same as, contains, or
 * is contained by any sibling from the other. Direct-equality alone isn't
 * enough: a coincidentally-matching container several levels up (e.g. two
 * *entirely different* array sections, "work" and "education", that happen
 * to reduce to the same number of same-shaped top-level wrapper elements)
 * doesn't share any exact element with the correct, tighter grouping found
 * at the right level - but its "siblings" are ancestors of the correct
 * siblings, describing the same DOM at a coarser, wrong granularity. Ancestor/
 * descendant containment catches that case too.
 */
function groupsOverlap(a: CandidateGroup, b: CandidateGroup): boolean {
  for (const elA of a.siblings) {
    for (const elB of b.siblings) {
      if (elA === elB || elA.contains(elB) || elB.contains(elA)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves every candidate group down to a maximal, mutually
 * non-overlapping set - a small-scale weighted independent-set problem.
 * General weighted independent-set is NP-hard, but greedily accepting
 * candidates in descending confidence order (skipping anything that
 * conflicts with an already-accepted, higher-confidence group) is the
 * standard, well-behaved heuristic for this shape of problem, and is exact
 * whenever conflicts don't chain unpredictably - which, given repeated-block
 * candidates only ever come from a bounded handful of ancestor levels around
 * the same fields, is the realistic case here. Ties fall back to preferring
 * the more specific (deeper) container, so two equally-uncorroborated
 * candidates don't resolve based on incidental Set/array iteration order.
 */
function resolveOverlappingGroups(candidates: CandidateGroup[], root: Document | Element): CandidateGroup[] {
  const eligible = candidates.filter(c => c.score >= MIN_ACCEPTABLE_SCORE);

  const sorted = [...eligible].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.totalFields !== a.totalFields) return b.totalFields - a.totalFields;
    return getDepthFrom(b.container, root) - getDepthFrom(a.container, root);
  });

  const accepted: CandidateGroup[] = [];
  for (const candidate of sorted) {
    if (!accepted.some(acc => groupsOverlap(acc, candidate))) {
      accepted.push(candidate);
    }
  }
  return accepted;
}

// =============================================================================
// Classification
// =============================================================================

function findLabelText(el: HTMLElement): string | null {
  const root = el.getRootNode() as Document | ShadowRoot;

  if (el.id && typeof CSS !== 'undefined' && CSS.escape) {
    const label = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label?.textContent) return label.textContent.trim();
  }

  let parent = el.parentElement;
  while (parent) {
    if (parent.tagName === 'LABEL') {
      return parent.textContent ? parent.textContent.trim() : null;
    }
    parent = parent.parentElement;
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy && root.getElementById) {
    const labelled = root.getElementById(ariaLabelledBy);
    if (labelled?.textContent) return labelled.textContent.trim();
  }

  return null;
}

/**
 * Walks up looking for a wrapping <fieldset>/<legend>, bridging shadow-DOM
 * boundaries via the shadow host so a <fieldset> in the light DOM around a
 * shadow-hosted field is still found. This is purely for gathering
 * classification context, not for reproducing native fieldset/legend
 * accessibility semantics (which genuinely don't cross the boundary).
 */
function findLegend(el: Element): string | null {
  let current: Element | null = el;
  while (current) {
    if (current.tagName === 'FIELDSET') {
      const legendEl = current.querySelector('legend');
      if (legendEl?.textContent) return legendEl.textContent.trim();
    }
    const parent: Element | null = current.parentElement;
    if (parent) {
      current = parent;
    } else {
      const rootNode = current.getRootNode();
      current = rootNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE && 'host' in rootNode
        ? (rootNode as ShadowRoot).host
        : null;
    }
  }
  return null;
}

/** A block's own title ("Work Experience #1") is one of the strongest
 *  classification signals available and the original implementation never
 *  looked for it at all. */
function findContainerHeading(container: Element): string | null {
  const heading = container.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"], legend');
  const text = heading?.textContent?.trim();
  return text || null;
}

function getContainerDataAttributeSignals(container: Element): string[] {
  const signals: string[] = [];
  for (const attr of Array.from(container.attributes)) {
    if (attr.name.startsWith('data-') && attr.value) {
      signals.push(attr.value);
    }
  }
  return signals;
}

interface WeightedSignal {
  text: string;
  weight: number;
}

function collectWeightedSignals(
  siblings: Element[],
  indexPrefixHints: string[],
  fieldCache: FieldScanCache
): WeightedSignal[] {
  const signals: WeightedSignal[] = [];

  // The developer's own array-variable name (extracted from a detected
  // "work[0][title]"-style naming pattern) is often the single most
  // reliable hint available, so it's weighted on par with a heading.
  for (const hint of indexPrefixHints) {
    const cleaned = hint.replace(/[^a-zA-Z]+$/, '');
    if (cleaned) signals.push({ text: cleaned, weight: SIGNAL_WEIGHT.indexPrefixHint });
  }

  for (const sibling of siblings.slice(0, MAX_SIBLINGS_FOR_CLASSIFICATION)) {
    const heading = findContainerHeading(sibling);
    if (heading) signals.push({ text: heading, weight: SIGNAL_WEIGHT.containerHeading });

    for (const value of getContainerDataAttributeSignals(sibling)) {
      signals.push({ text: value, weight: SIGNAL_WEIGHT.dataAttribute });
    }

    for (const field of getScannedFields(fieldCache, sibling)) {
      if ('type' in field && field.type === 'date-group') {
        const text = field.container.textContent;
        if (text) signals.push({ text, weight: SIGNAL_WEIGHT.label });
        continue;
      }

      const el = field as HTMLElement;

      const label = findLabelText(el);
      if (label) signals.push({ text: label, weight: SIGNAL_WEIGHT.label });

      const legend = findLegend(el);
      if (legend) signals.push({ text: legend, weight: SIGNAL_WEIGHT.legend });

      const nameLike = [el.getAttribute('name'), el.getAttribute('placeholder'), el.getAttribute('aria-label')]
        .filter(Boolean)
        .join(' ');
      if (nameLike) signals.push({ text: nameLike, weight: SIGNAL_WEIGHT.nameLike });

      if (el.id) signals.push({ text: el.id, weight: SIGNAL_WEIGHT.id });
    }
  }

  return signals;
}

/**
 * Inverted keyword -> categories index, built once at module load. Lets
 * classification look up "which categories does this token even belong to"
 * in O(1) instead of scanning every category's keyword list per token, and
 * doubles as the document-frequency count IDF weighting needs (a keyword
 * that lives in only one category's list is far more discriminative than
 * one shared by every category, e.g. "date").
 */
function buildInvertedIndex(signatures: Record<string, string[]>): Map<string, ArrayBlockType[]> {
  const index = new Map<string, ArrayBlockType[]>();
  for (const [category, keywords] of Object.entries(signatures)) {
    for (const keyword of keywords) {
      const bucket = index.get(keyword);
      if (bucket) bucket.push(category as ArrayBlockType);
      else index.set(keyword, [category as ArrayBlockType]);
    }
  }
  return index;
}

const KEYWORD_INDEX = buildInvertedIndex(arrayShapeSignatures);
// Sorted once so tie-breaking in classifyBlockType is alphabetical and
// independent of arrayShapeSignatures' own key order, rather than silently
// depending on whichever category happens to be declared first.
const CATEGORY_LIST = (Object.keys(arrayShapeSignatures) as ArrayBlockType[]).sort();
const TOTAL_CATEGORIES = CATEGORY_LIST.length;

/**
 * Inserts spaces at camelCase boundaries before handing text to the
 * imported tokenize(). Can't assume that external tokenizer splits
 * "workExperience" into ["work","experience"] - a lot of the highest-value
 * signal here (extracted array-name prefixes, id/name attributes) is
 * camelCase, so this is cheap, harmless if tokenize already handles it, and
 * fixes real misses if it doesn't.
 */
function splitCamelCase(text: string): string {
  return text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/**
 * Classifies a repeated block using every sibling's signals (not just the
 * first instance, which may be a sparse/blank template row), each token
 * weighted both by how reliable its source is (a <label> beats a raw `id`)
 * and by IDF across categories (a keyword unique to one category counts for
 * far more than one shared by all of them - the same principle applied to
 * classes in scoreGroupConfidence, applied here to keywords). Falls back to
 * an explicit default only when literally nothing scored above zero, rather
 * than an accidental object-key-order default.
 */
function classifyBlockType(
  siblings: Element[],
  indexPrefixHints: string[],
  fieldCache: FieldScanCache
): ArrayBlockType {
  const signals = collectWeightedSignals(siblings, indexPrefixHints, fieldCache);

  const scores = new Map<ArrayBlockType, number>();

  for (const signal of signals) {
    for (const token of tokenize(splitCamelCase(signal.text).toLowerCase())) {
      const matchingCategories = KEYWORD_INDEX.get(token);
      if (!matchingCategories || matchingCategories.length === 0) continue;

      const idf = TOTAL_CATEGORIES / matchingCategories.length;
      const contribution = signal.weight * idf;

      for (const category of matchingCategories) {
        scores.set(category, (scores.get(category) ?? 0) + contribution);
      }
    }
  }

  let bestCategory: ArrayBlockType | null = null;
  let bestScore = 0;
  for (const category of CATEGORY_LIST) {
    const score = scores.get(category) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory ?? DEFAULT_BLOCK_TYPE;
}

// =============================================================================
// Public API
// =============================================================================

export function detectRepeatedBlocks(root: Document | Element, options?: ScanOptions): RepeatedBlock[] {
  const blocks: RepeatedBlock[] = [];

  const fieldCache = createFieldScanCache(options);
  const classFrequency = buildClassFrequencyMap(root);

  const allFields = getScannedFields(fieldCache, root);
  const elements = allFields.map(f => ('type' in f && f.type === 'date-group' ? f.container : (f as Element)));

  const containers = collectContainerCandidates(elements, root);
  const candidateGroups = collectAllCandidateGroups(containers, fieldCache, classFrequency);
  const acceptedGroups = resolveOverlappingGroups(candidateGroups, root);

  for (const { siblings, indexPrefixHints } of acceptedGroups) {
    const sorted = [...siblings].sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    const arrayKey = classifyBlockType(sorted, indexPrefixHints, fieldCache);

    sorted.forEach((container, index) => {
      const fields = flattenFields(getScannedFields(fieldCache, container));
      blocks.push({ index, arrayKey, container, fields });
    });
  }

  return blocks;
}