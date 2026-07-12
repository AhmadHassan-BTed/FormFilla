import { IPlatformAdapter, PlatformCapabilities, ScanRoot } from './adapter.interface.js';

/**
 * Adapter for Greenhouse Recruiting (boards.greenhouse.io, and the various
 * ways companies embed it on their own career pages).
 *
 * Two current, confirmed things drive most of this file's design:
 *
 * 1. Greenhouse offers several integration options, and multiple of them
 *    put the real application form inside a cross-origin <iframe> on the
 *    company's own domain (e.g. boards.greenhouse.io/embed/job_app loaded
 *    inside an iframe on careers.company.com — this is a real, current,
 *    and common setup, not an edge case). When that's what's happening,
 *    the fields simply don't exist in this frame's DOM — no amount of
 *    scanning logic can find them from the parent page; that's a browser
 *    security boundary, not a bug. The real fix is making sure the
 *    extension's content script also runs inside that iframe ("all_frames":
 *    true in manifest.json) — once it does, a second GreenhouseAdapter
 *    instance matches directly from inside the iframe via the hostname
 *    check below. This adapter detects the unreachable-embed situation and
 *    warns about it instead of just quietly finding zero fields.
 *
 * 2. Greenhouse's application forms follow a fairly consistent field
 *    vocabulary: first_name/last_name/email/phone, a newer optional
 *    "preferred first name" field, resume/cover-letter upload,
 *    educations[]/employments[] repeated blocks, demographic questions
 *    (gender/race/veteran_status/disability_status — each always including
 *    a "decline to answer" option), dynamically-numbered custom questions
 *    (question_12345), and data-compliance/GDPR consent checkboxes. The
 *    selectors below lean on that vocabulary, confirmed against
 *    Greenhouse's own developer/support docs while writing this file.
 *    Where a company runs a fully custom, API-driven form instead of
 *    Greenhouse's own embed, none of this DOM fingerprint will be present —
 *    matches() correctly returns false and GenericAdapter takes over
 *    instead, which is the right outcome, since at that point it really is
 *    just a bespoke form with no "Greenhouse" left in its markup.
 */
export class GreenhouseAdapter implements IPlatformAdapter {
  readonly id = 'greenhouse';
  readonly priority = 10;

  readonly capabilities: PlatformCapabilities = {
    usesIframes: true,
    isAsyncRendered: true,
  };

  private static readonly CUSTOM_FIELD_SELECTORS: readonly string[] = [
    // Rails "form_for @job_application" naming convention.
    '[id^="job_application_"]',
    '[name^="job_application"]',
    // Flat field names, as shown in Greenhouse's own developer-docs example form.
    'input[name="first_name"]',
    'input[name="last_name"]',
    'input[name="email"]',
    'input[name="phone"]',
    // Dynamically-numbered custom questions and the built-in demographic answers.
    '[id^="question_"]',
    '[name^="question_"]',
    '[name="gender"]',
    '[name="race"]',
    '[name="veteran_status"]',
    '[name="disability_status"]',
    // Repeated education/employment blocks (Rails nested-attributes naming).
    '[id*="education" i]',
    '[id*="employment" i]',
    '[name*="educations"]',
    '[name*="employments"]',
    // ARIA/custom widgets Greenhouse's newer form components render with.
    '[role="combobox"]',
    '[role="listbox"]',
    '[contenteditable="true"]',
  ];

  /** Guards the deferred embed-reachability check so it only ever schedules once per instance. */
  private hasScheduledEmbedCheck = false;

  matches(): boolean {
    const isActualGreenhouseForm =
      window.location.hostname.includes('greenhouse.io') ||
      document.getElementById('main-fields') !== null ||
      document.querySelector('form[action*="greenhouse"]') !== null ||
      document.querySelector('[id^="job_application_"], [name^="job_application"]') !== null;

    // matches() is the one method every adapter is guaranteed to have called
    // on it, win or lose — that makes it the only reliable place to hang a
    // "you embed Greenhouse but this frame can't reach it" diagnostic. The
    // actual check is deferred (see scheduleEmbedReachabilityCheck) so it
    // doesn't block this method staying cheap and synchronous.
    if (!isActualGreenhouseForm) {
      this.scheduleEmbedReachabilityCheck();
    }

    return isActualGreenhouseForm;
  }

  async waitUntilReady(timeoutMs = 3000): Promise<void> {
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
   * Attempts to reach inside an embedded Greenhouse iframe. This only
   * succeeds for same-origin setups, which the classic company-domain embed
   * essentially never is — see the class doc comment. Included anyway for
   * the rarer same-origin configurations, and because it shares logic with
   * the reachability check below.
   */
  getExtraScanRoots(): ScanRoot[] {
    const doc = this.getReachableIframeDocument();
    return doc ? [doc] : [];
  }

  getCustomFieldSelectors(): string[] {
    return [...GreenhouseAdapter.CUSTOM_FIELD_SELECTORS];
  }

  shouldExcludeElement(element: Element): boolean {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (type === 'hidden') return true; // CSRF tokens, job/post ids, tracking params — never user-facing fields

    if (element.getAttribute('aria-disabled') === 'true') return true;
    const tag = element.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
      const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;
      if (control.disabled) return true;
    }

    return false;
  }

  /**
   * Best-effort classification of a Greenhouse field into a semantic kind,
   * based on the naming vocabulary confirmed in Greenhouse's own developer
   * docs. Like GenericAdapter's resolveAccessibleLabel(), this is a
   * standalone helper — not part of IPlatformAdapter — meant to be called
   * from signal-extractor.ts or wired through enrichSignals() once you
   * share shared/types/index.ts, rather than one that fabricates a
   * FieldSignals-shaped object here without knowing its real shape.
   *
   * These patterns are inferred from Greenhouse's public API/support docs,
   * not verified against a live rendered application page — if you can
   * share the HTML of one real Greenhouse application (view-source is
   * enough), I can tighten these from pattern-matching to exact selectors.
   */
  classifyField(element: Element): GreenhouseFieldKind | null {
    const name = (element.getAttribute('name') || '').toLowerCase();
    const id = (element.getAttribute('id') || '').toLowerCase();
    const key = `${name} ${id}`;

    if (key.includes('preferred') && key.includes('first_name')) return 'preferred-first-name';
    if (key.includes('first_name')) return 'first-name';
    if (key.includes('last_name')) return 'last-name';
    if (key.includes('email')) return 'email';
    if (key.includes('phone')) return 'phone';
    if (/(^|[^a-z])gender([^a-z]|$)/.test(key)) return 'eeo-gender';
    if (/(^|[^a-z])race([^a-z]|$)/.test(key)) return 'eeo-race';
    if (key.includes('veteran')) return 'eeo-veteran-status';
    if (key.includes('disability')) return 'eeo-disability-status';
    if (/question[_-]?\d+/.test(key)) return 'custom-question';
    if (key.includes('education')) return 'education-block-field';
    if (key.includes('employment')) return 'employment-block-field';
    if (key.includes('data_compliance') || key.includes('gdpr')) return 'data-compliance-consent';
    if (key.includes('resume')) return 'resume-upload';
    if (key.includes('cover_letter')) return 'cover-letter';
    return null;
  }

  /**
   * Groups fields belonging to the same repeated education/employment
   * "card" so a multi-entry work/education history doesn't get scrambled
   * across entries. Heuristic — walks each education/employment-flavored
   * field up to the nearest container that looks like a repeated row.
   */
  getRepeatedBlockContainers(): Element[] {
    const containers = new Set<Element>();
    document
      .querySelectorAll('[id*="education" i], [id*="employment" i], [class*="education" i], [class*="employment" i]')
      .forEach((el) => {
        const card = el.closest('fieldset, li, [class*="row" i], [class*="card" i], [class*="section" i]');
        if (card) containers.add(card);
      });
    return [...containers];
  }

  private getGreenhouseIframe(): HTMLIFrameElement | null {
    return document.querySelector<HTMLIFrameElement>('iframe[src*="greenhouse.io"]');
  }

  private getReachableIframeDocument(): Document | null {
    const iframe = this.getGreenhouseIframe();
    if (!iframe) return null;
    try {
      const doc = iframe.contentDocument;
      return doc && doc.readyState !== 'loading' ? doc : null;
    } catch {
      return null; // cross-origin, as the classic company-domain embed almost always is
    }
  }

  private scheduleEmbedReachabilityCheck(): void {
    if (this.hasScheduledEmbedCheck) return;
    this.hasScheduledEmbedCheck = true;

    // Give the embed's own loader script (#grnhse_app -> injected iframe) a
    // moment to run before concluding anything — checking immediately would
    // catch it mid-load and warn incorrectly.
    setTimeout(() => {
      const iframe = this.getGreenhouseIframe();
      const embedContainer = document.getElementById('grnhse_app');
      if (!iframe && !embedContainer) return; // nothing Greenhouse-shaped here after all
      if (this.getReachableIframeDocument()) return; // reachable — nothing to warn about

      console.warn(
        `[FormFilla] GreenhouseAdapter: this page appears to embed a Greenhouse application ` +
          `(an iframe or #grnhse_app widget) that this frame can't reach directly. If fields ` +
          `aren't being found on a company's own careers page, enable "all_frames" for this ` +
          `extension in manifest.json so its content script also runs inside the embedded ` +
          `iframe, where it can match and scan directly.`
      );
    }, 1500);
  }
}

export type GreenhouseFieldKind =
  | 'first-name'
  | 'preferred-first-name'
  | 'last-name'
  | 'email'
  | 'phone'
  | 'eeo-gender'
  | 'eeo-race'
  | 'eeo-veteran-status'
  | 'eeo-disability-status'
  | 'custom-question'
  | 'education-block-field'
  | 'employment-block-field'
  | 'data-compliance-consent'
  | 'resume-upload'
  | 'cover-letter';