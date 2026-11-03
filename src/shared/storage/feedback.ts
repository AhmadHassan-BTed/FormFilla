export type FeedbackKind = 'bug' | 'feature';

export interface FeedbackDraft {
  kind: FeedbackKind;
  title: string;
  description: string;
  product: string;
  country?: string;
}

const ISSUE_TRACKER_REPO = 'AhmadHassan-BTed/FormFilla';

/**
 * Returns a URL that opens the GitHub "new issue" page on the private issue tracker repo,
 * with prefilled title/description.
 */
export function buildNewIssueUrl(draft: FeedbackDraft): string {
  const repo = ISSUE_TRACKER_REPO;

  const labels = draft.kind === 'bug' ? 'bug' : 'enhancement';

  const titlePrefix = draft.kind === 'bug' ? '[Bug]: ' : '[Feature]: ';
  const title = `${titlePrefix}${(draft.title || '').trim()}`;

  const bodyLines: string[] = [];
  bodyLines.push(`### Product`);
  bodyLines.push(`${draft.product || 'Unknown'}`);

  if (draft.country && draft.country.trim()) {
    bodyLines.push('');
    bodyLines.push('### Country');
    bodyLines.push(`${draft.country.trim()}`);
  }

  bodyLines.push('');
  bodyLines.push('### Description');
  bodyLines.push(draft.description || '');

  // Helpful link
  bodyLines.push('');
  bodyLines.push('---');
  bodyLines.push('Reported from FormFilla extension.');

  const body = bodyLines.join('\n');

  const params = new URLSearchParams({
    labels,
    title,
    body,
  });

  // /issues/new?prefill supports arbitrary query params (best-effort; GitHub will prefill where applicable).
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

/**
 * Helper to expose activation state in feedback page.
 * FormFilla is fully unlocked.
 */
export async function getActivationFlagForFeedback(): Promise<{ activated: boolean }> {
  return { activated: true };
}

