import { IPlatformAdapter, PlatformCapabilities, ScanRoot } from './adapter.interface.js';

/**
 * Adapter for Lever (jobs.lever.co, and the ways companies surface it on
 * their own career pages).
 *
 * Three current, confirmed things drive this file's design:
 *
 * 1. Unlike Greenhouse, Lever's own integration guidance (Help Center, Oct
 *    2025) steers companies building a custom career site toward
 *    *redirecting* to Lever's hosted application form rather than embedding
 *    it — "directing candidates to Lever's hosted application form is
 *    considered a best practice." Their documented iframe mode
 *    (api.lever.co/v0/postings/{account}?mode=iframe) is for the job
 *    *listing*, and third-party integrations (Indeed, ZipRecruiter) confirm
 *    candidates get redirected to the Lever-hosted site to apply rather than
 *    staying iframed. So the cross-origin-iframe problem that's almost
 *    certainly the dominant cause of missed fields on Greenhouse is a real
 *    possibility here too (nothing stops a company from iframing the apply
 *    URL specifically), just a less certain one. This file still detects
 *    and warns about it as a safety net, with that lower confidence made
 *    explicit in the warning text itself rather than copy-pasted verbatim
 *    from greenhouse.ts.
 *
 * 2. Lever's confirmed field vocabulary (their own Postings API, Ruby
 *    client, and application-form support docs) is flatter than
 *    Greenhouse's: one "name" field rather than split first/last, "org" for
 *    current company, a "Current Location" field (auto-filled from resume
 *    parsing) distinct from a "Preferred Location" field that only exists
 *    on multi-location postings, an optional "Pronouns" field, a dynamic
 *    "urls[Network]" bucket for LinkedIn/GitHub/portfolio-style Link
 *    Questions, "comments" as the free-text/cover-letter-equivalent field,
 *    and the same gender/race/veteran_status/disability_status EEO
 *    categories used across ATSes.
 *
 * 3. Two confirmed, current wrinkles worth knowing about even though
 *    neither is something this file can fully solve on its own:
 *      - On multi-location postings, Lever's EEO section can be
 *        *dynamically rendered after* the candidate picks a preferred
 *        location, rather than present at initial page load. A one-time
 *        scan can legitimately miss it — that's what
 *        capabilities.isAsyncRendered signals; make sure mutation-watcher.ts
 *        re-checks this adapter's selectors after that field changes, not
 *        just after initial load.
 *      - Lever's own docs state the Current Location field is gated behind
 *        an hCaptcha challenge "if the applicant is a suspicious user (a
 *        bot)." That's a real, current risk specifically for an automated
 *        filler. It isn't a detection problem, so it isn't something
 *        shouldExcludeElement() or getCustomFieldSelectors() can fix —
 *        interaction pacing belongs in the fill layer, not the adapter —
 *        but whoever wires up filling for this field should know it exists
 *        and consider the same manual-confirm treatment SSN fields already
 *        get, rather than a fast synthetic fill that risks tripping it.
 *
 * Unlike greenhouse.ts, this file doesn't implement
 * getRepeatedBlockContainers(): nothing in Lever's own docs shows repeatable
 * education/employment history *fields* the way Greenhouse's
 * educations[]/employments[] exist — Lever leans on resume parsing instead.
 * Fabricating detection for a structure with no confirmed evidence would be
 * guessing, not power.
 */
export class LeverAdapter implements IPlatformAdapter {
  readonly id = 'lever';
  readonly priority = 10;

  readonly capabilities: PlatformCapabilities = {
    usesIframes: true,
    isAsyncRendered: true,
  };

  private static readonly CUSTOM_FIELD_SELECTORS: readonly string[] = [
    // Confirmed field vocabulary from Lever's own Postings API / apply client.
    '[name="name"]',
    '[name="email"]',
    '[name="phone"]',
    '[name="org"]',
    '[name="comments"]',
    '[name^="urls"]',
    '[name="gender"]',
    '[name="race"]',
    '[name*="veteran"]',
    '[name*="disability"]',
    '[name*="pronoun"]',
    // ARIA/custom widgets — location autocomplete, resume dropzone, etc.
    '[role="combobox"]',
    '[role="listbox"]',
    '[contenteditable="true"]',
  ];

  private hasScheduledEmbedCheck = false;

  matches(): boolean {
    const isActualLeverForm =
      window.location.hostname.includes('lever.co') ||
      document.querySelector('.application-form') !== null ||
      document.getElementById('lever-application-form') !== null;

    if (!isActualLeverForm) {
      this.scheduleEmbedReachabilityCheck();
    }

    return isActualLeverForm;
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
   * Attempts to reach inside a Lever iframe. Only succeeds for same-origin
   * setups, which — per the class doc comment — are a real but less common
   * possibility for Lever than for Greenhouse.
   */
  getExtraScanRoots(): ScanRoot[] {
    const doc = this.getReachableIframeDocument();
    return doc ? [doc] : [];
  }

  getCustomFieldSelectors(): string[] {
    return [...LeverAdapter.CUSTOM_FIELD_SELECTORS];
  }

  shouldExcludeElement(element: Element): boolean {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (type === 'hidden') return true;

    if (element.getAttribute('aria-disabled') === 'true') return true;
    const tag = element.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
      const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;
      if (control.disabled) return true;
    }

    return false;
  }

  /**
   * Best-effort classification, based on the field vocabulary confirmed in
   * Lever's own Postings API docs, Ruby client, and application-form
   * support articles. Not part of IPlatformAdapter — like
   * GreenhouseAdapter.classifyField(), meant to be called from
   * signal-extractor.ts once you share shared/types/index.ts.
   *
   * Note the single 'full-name' kind: Lever collects one name field, not
   * separate first/last like Greenhouse — if your profile schema stores
   * them separately, this is the field that needs them joined back
   * together. Note also that 'location' covers both "Current Location" and
   * "Preferred Location" — I don't have confirmed evidence of distinct
   * name/id attributes for the two, so the label text (once resolved) is
   * the more reliable way to tell them apart than the attributes alone.
   */
  classifyField(element: Element): LeverFieldKind | null {
    const name = (element.getAttribute('name') || '').toLowerCase().trim();
    const id = (element.getAttribute('id') || '').toLowerCase().trim();
    const combined = `${name} ${id}`;

    // Exact matches for the fields Lever's own API docs confirm literally —
    // "name" alone is too common a word to pattern-match as a substring
    // (it would wrongly catch "company_name", "school_name", etc.)
    if (name === 'name' || id === 'name') return 'full-name';
    if (name === 'org') return 'current-company';
    if (name === 'comments') return 'cover-letter-comments';
    if (name.startsWith('urls')) return 'professional-url';

    if (combined.includes('email')) return 'email';
    if (combined.includes('phone')) return 'phone';
    if (combined.includes('resume')) return 'resume-upload';
    if (combined.includes('pronoun')) return 'pronouns';
    if (/(^|[^a-z])gender([^a-z]|$)/.test(combined)) return 'eeo-gender';
    if (/(^|[^a-z])race([^a-z]|$)/.test(combined)) return 'eeo-race';
    if (combined.includes('veteran')) return 'eeo-veteran-status';
    if (combined.includes('disability')) return 'eeo-disability-status';
    if (combined.includes('location')) return 'location';
    if (combined.includes('url')) return 'professional-url';

    return null;
  }

  private getLeverIframe(): HTMLIFrameElement | null {
    return document.querySelector<HTMLIFrameElement>('iframe[src*="lever.co"]');
  }

  private getReachableIframeDocument(): Document | null {
    const iframe = this.getLeverIframe();
    if (!iframe) return null;
    try {
      const doc = iframe.contentDocument;
      return doc && doc.readyState !== 'loading' ? doc : null;
    } catch {
      return null; // cross-origin
    }
  }

  private scheduleEmbedReachabilityCheck(): void {
    if (this.hasScheduledEmbedCheck) return;
    this.hasScheduledEmbedCheck = true;

    setTimeout(() => {
      const iframe = this.getLeverIframe();
      if (!iframe) return; // no Lever iframe on this page at all
      if (this.getReachableIframeDocument()) return; // reachable — nothing to warn about

      console.warn(
        `[FormFilla] LeverAdapter: this page embeds a Lever iframe (api.lever.co/.../postings ` +
          `or a jobs.lever.co apply URL) that this frame can't reach directly. Lever's own ` +
          `guidance favors redirecting to their hosted form over iframing the apply step, so ` +
          `this is less common than the equivalent Greenhouse case — but if fields aren't being ` +
          `found here, enable "all_frames" for this extension in manifest.json so its content ` +
          `script also runs inside the iframe.`
      );
    }, 1500);
  }
}

export type LeverFieldKind =
  | 'full-name'
  | 'email'
  | 'phone'
  | 'current-company'
  | 'professional-url'
  | 'resume-upload'
  | 'cover-letter-comments'
  | 'pronouns'
  | 'eeo-gender'
  | 'eeo-race'
  | 'eeo-veteran-status'
  | 'eeo-disability-status'
  | 'location';