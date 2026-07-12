import { IPlatformAdapter, PlatformCapabilities, ScanRoot } from './adapter.interface.js';

/**
 * Adapter for Workday Recruiting ({tenant}.myworkdayjobs.com, including the
 * numbered-pod subdomains like {tenant}.wd5.myworkdayjobs.com).
 *
 * Workday is a genuinely different shape of problem than Greenhouse or
 * Lever, and this file is deliberately NOT a copy of those two with the
 * selectors swapped. Four current, confirmed things drive its design:
 *
 * 1. Workday's UI is a heavily componentized, proprietary SPA, not a
 *    server-rendered form — plain <select>/<input> selectors miss most of
 *    it. The one reliable, near-universal signal is the `data-automation-id`
 *    attribute Workday tags almost everything with (confirmed both broadly
 *    across other Workday products and specifically for the candidate
 *    application flow by a current, real autofill reference
 *    implementation). Because it's applied to buttons and containers just
 *    as much as fields, this file treats it as a deliberately wide net in
 *    getCustomFieldSelectors() and narrows back down in
 *    shouldExcludeElement() rather than trying to guess which exact
 *    automation-id *strings* mean "field" — I don't have confirmed evidence
 *    for those, and that same reference project's own README says
 *    plainly: "Workday selectors drift over time, so treat the selectors
 *    as a starting point you may need to adjust." I'm taking that
 *    seriously rather than overclaiming precision I don't have.
 *
 * 2. Workday's candidate flow is a genuine multi-step wizard — confirmed
 *    step names, in order: account (sign in / create account), My
 *    Information, My Experience (resume upload + work history + education,
 *    largely auto-populated from resume parsing), Application Questions,
 *    Voluntary Disclosures / Self-Identify, Review. This is the first
 *    adapter where capabilities.isMultiStep actually matters — only the
 *    current step's fields exist in the DOM at a time, so "missing" fields
 *    on later steps is often not a detection bug at all, just a step that
 *    hasn't been reached yet. getCurrentStep() below is a best-effort way
 *    to know which step you're looking at.
 *
 * 3. Workday's account step is not a false-positive login prompt to ignore
 *    — candidates genuinely need an account (and password) per company's
 *    Workday tenant to apply at all ("one company, one account," confirmed
 *    across multiple current sources on this exact pain point). This file
 *    still excludes password fields by default, consistent with leaving
 *    credentials to the browser's own manager, but that default is worth
 *    deliberately revisiting for Workday specifically, since here the field
 *    is functionally required, not incidental.
 *
 * 4. Some companies replace Workday's native candidate UI entirely with a
 *    third-party overlay (e.g. JobSync) that syncs into the same Workday
 *    backend but ships its own completely custom markup with no
 *    data-automation-id fingerprint at all. On a page like that, matches()
 *    correctly returns false and GenericAdapter correctly takes over — same
 *    outcome as a fully custom Greenhouse/Lever integration, for the same
 *    reason: there's no Workday DOM signature left to detect.
 *
 * Unlike greenhouse.ts, I found no evidence Workday's application form is
 * commonly embedded as a cross-origin iframe on a company's own domain the
 * way Greenhouse's is — Workday's own account/session model is heavy
 * enough that companies wanting a different look integrate via the overlay
 * pattern in point 4 instead of iframing Workday's actual UI. So this file
 * doesn't implement the iframe-reachability diagnostic greenhouse.ts and
 * lever.ts both have; including it here would be pattern-matching those
 * files rather than reasoning about this one.
 */
export class WorkdayAdapter implements IPlatformAdapter {
  readonly id = 'workday';
  readonly priority = 10;

  readonly capabilities: PlatformCapabilities = {
    isMultiStep: true,
    isAsyncRendered: true,
  };

  private static readonly CUSTOM_FIELD_SELECTORS: readonly string[] = [
    // Deliberately wide — see the class doc comment. Narrowed back down in
    // shouldExcludeElement() rather than guessed down here.
    '[data-automation-id]',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[role="spinbutton"]',
    '[contenteditable="true"]',
  ];

  matches(): boolean {
    return (
      window.location.hostname.includes('workday') ||
      document.querySelector('[data-automation-id="workdayLogo"]') !== null ||
      document.querySelector('[data-metadata-id]') !== null
    );
  }

  /**
   * Polls the count of field-like elements until it holds steady for two
   * consecutive checks. Workday's SPA hydration and per-step re-rendering
   * make this more important here than on the other adapters — a scan that
   * fires the instant a step's container appears will catch it half-built.
   */
  async waitUntilReady(timeoutMs = 5000): Promise<void> {
    const pollIntervalMs = 200;
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

  beforeScan(): void {
    console.log('WorkdayAdapter matched and preparing layout...');
    document.querySelectorAll('details:not([open])').forEach((details) => {
      (details as HTMLDetailsElement).open = true;
    });
  }

  /**
   * Shadow-DOM-only (no iframe branch — see class doc comment point 4).
   * Included defensively: Workday's component framework is proprietary, so
   * shadow DOM usage somewhere in it is plausible even without direct
   * confirmation. Costs nothing if it never finds one.
   */
  getExtraScanRoots(): ScanRoot[] {
    const roots: ScanRoot[] = [];
    try {
      this.collectShadowRoots(document, roots, new Set<ScanRoot>());
    } catch (error) {
      console.warn('[FormFilla] WorkdayAdapter: shadow DOM discovery failed', error);
    }
    return roots;
  }

  private collectShadowRoots(root: ScanRoot, out: ScanRoot[], seen: Set<ScanRoot>): void {
    if (seen.has(root)) return;
    seen.add(root);

    const elements: Element[] =
      root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from(root.querySelectorAll('*'));

    for (const el of elements) {
      if (el.shadowRoot) {
        out.push(el.shadowRoot);
        this.collectShadowRoots(el.shadowRoot, out, seen);
      }
    }
  }

  getCustomFieldSelectors(): string[] {
    return [...WorkdayAdapter.CUSTOM_FIELD_SELECTORS];
  }

  shouldExcludeElement(element: Element): boolean {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (type === 'hidden') return true;
    if (type === 'password') return true; // see class doc comment point 3 — deliberate default, not an oversight

    if (element.getAttribute('aria-disabled') === 'true') return true;
    const tag = element.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
      const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;
      if (control.disabled) return true;
    }

    // [data-automation-id] alone (see getCustomFieldSelectors) sweeps up
    // navigation/action controls too, not just fields. Only excluding the
    // unambiguous cases here — a div/span with data-automation-id and no
    // recognized role is left in rather than guessed out, since a false
    // exclusion silently drops a real field and a false inclusion just
    // gives the scorer one more low-confidence candidate to reject.
    const role = element.getAttribute('role');
    if (tag === 'BUTTON' || tag === 'A' || role === 'button' || role === 'link') return true;

    return false;
  }

  /**
   * Best-effort classification, checking both data-automation-id and
   * aria-label substrings. Confidence here is lower than
   * GreenhouseAdapter/LeverAdapter's classifiers — I have solid evidence
   * for Workday's overall architecture and step structure, but not for
   * exact automation-id strings on individual fields (see class doc
   * comment point 1). Treat this as a reasonable starting point, not a
   * verified mapping — the same caveat the reference autofill project
   * gives its own selectors.
   */
  classifyField(element: Element): WorkdayFieldKind | null {
    const automationId = (element.getAttribute('data-automation-id') || '').toLowerCase();
    const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
    const key = `${automationId} ${ariaLabel}`;

    if (key.includes('firstname')) return 'first-name';
    if (key.includes('lastname')) return 'last-name';
    if (key.includes('preferredname') || key.includes('preferred name')) return 'preferred-name';
    if (key.includes('email')) return 'email';
    if (key.includes('phone')) return 'phone';
    if (key.includes('address') || /(^|[^a-z])city([^a-z]|$)/.test(key) || key.includes('postalcode') || key.includes('postal code'))
      return 'address';
    if (
      key.includes('previousworker') ||
      key.includes('previous worker') ||
      key.includes('worked here before') ||
      key.includes('former employee')
    )
      return 'previous-worker-status';
    if (/(^|[^a-z])source([^a-z]|$)/.test(key) || key.includes('how did you hear')) return 'source-tracking';
    if (/(^|[^a-z])gender([^a-z]|$)/.test(key)) return 'eeo-gender';
    if (/(^|[^a-z])(race|ethnicity)([^a-z]|$)/.test(key)) return 'eeo-race-ethnicity';
    if (key.includes('veteran')) return 'eeo-veteran-status';
    if (key.includes('disability')) return 'eeo-disability-status';
    if (key.includes('workexperience') || key.includes('work experience') || key.includes('employer') || key.includes('jobtitle'))
      return 'work-experience-block-field';
    if (key.includes('education') || key.includes('school') || key.includes('degree')) return 'education-block-field';
    if (key.includes('resume') || key.includes('cv')) return 'resume-upload';

    return null;
  }

  /**
   * Best-effort current-step detection, based on Workday's own
   * user-visible step headings rather than internal automation-id strings
   * — the visible names are the more stable signal, since changing them is
   * a user-facing UX decision rather than an internal refactor. Useful
   * context for a scorer (e.g. "we're on Voluntary Disclosures, expect
   * EEO-shaped fields") given capabilities.isMultiStep.
   */
  getCurrentStep(): WorkdayApplicationStep | null {
    const heading = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
      .map((h) => h.textContent?.trim() || '')
      .filter(Boolean)
      .join(' | ');
    if (!heading) return null;

    if (/create account|sign in|log ?in/i.test(heading)) return 'account';
    if (/my experience/i.test(heading)) return 'my-experience';
    if (/my information/i.test(heading)) return 'my-information';
    if (/application questions/i.test(heading)) return 'application-questions';
    if (/self.?identif/i.test(heading)) return 'self-identify';
    if (/voluntary disclosures?/i.test(heading)) return 'voluntary-disclosures';
    if (/review/i.test(heading)) return 'review';
    return null;
  }

  /**
   * Heuristic, lower-confidence than GreenhouseAdapter's equivalent —
   * groups likely Work Experience / Education entries by walking up to the
   * nearest plausible card/group ancestor. Workday's confirmed
   * resume-driven auto-population of these sections means entries often
   * exist before a candidate types anything, so this matters even on a
   * first pass.
   */
  getRepeatedBlockContainers(): Element[] {
    const containers = new Set<Element>();
    document
      .querySelectorAll('[data-automation-id*="experience" i], [data-automation-id*="education" i]')
      .forEach((el) => {
        const card = el.closest('[data-automation-id*="panelSet" i], [role="group"], fieldset, li');
        if (card) containers.add(card);
      });
    return [...containers];
  }
}

export type WorkdayFieldKind =
  | 'first-name'
  | 'last-name'
  | 'preferred-name'
  | 'email'
  | 'phone'
  | 'address'
  | 'previous-worker-status'
  | 'source-tracking'
  | 'eeo-gender'
  | 'eeo-race-ethnicity'
  | 'eeo-veteran-status'
  | 'eeo-disability-status'
  | 'work-experience-block-field'
  | 'education-block-field'
  | 'resume-upload';

export type WorkdayApplicationStep =
  | 'account'
  | 'my-information'
  | 'my-experience'
  | 'application-questions'
  | 'voluntary-disclosures'
  | 'self-identify'
  | 'review';