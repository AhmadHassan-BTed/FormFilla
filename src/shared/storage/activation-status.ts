/**
 * Display-friendly activation status for the Options UI badge and
 * "Deactivate" button.
 *
 * This module owns NO state of its own — it reads from
 * github-support.ts's GitHubSupportState, the single source of truth
 * for support/activation. That's deliberate: an earlier version of this
 * codebase had a second, parallel state store (a different chrome.storage
 * key, its own verification logic) that could silently drift from the
 * real gating state. Don't reintroduce that. If you need new display
 * fields, derive them from getSupportState() here rather than adding a
 * new storage key.
 */

import { getSupportState, deactivateSupport as deactivateSupportImpl } from './github-support.js';

export interface ActivationStatus {
  activated: boolean;
  label: string;
  detail: string;
  lastCheckDate: string | null;
  lastVerificationDate: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return 'N/A';
  }
}

/**
 * Get activation status for display in the Options UI.
 * `activated` mirrors GitHubSupportState.supportCompleted — i.e. it
 * reflects that verification (or a bypass) actually completed, not just
 * that a username was typed in.
 */
export async function getActivationStatus(): Promise<ActivationStatus> {
  const state = await getSupportState();

  if (state.supportCompleted) {
    return {
      activated: true,
      label: 'Activated',
      detail: `Last check: ${formatDate(state.lastVerificationDate)}`,
      lastCheckDate: state.lastVerificationDate,
      lastVerificationDate: state.lastVerificationDate,
    };
  }

  return {
    activated: false,
    label: 'Not activated',
    detail: 'Complete the support requirement to activate.',
    lastCheckDate: null,
    lastVerificationDate: null,
  };
}

/**
 * Reset activation state so the user is prompted to re-verify.
 * Thin re-export so callers only need to import from this module for
 * everything Options-UI-related; delegates to github-support.ts so
 * there's still only one place state actually changes.
 */
export async function deactivate(): Promise<void> {
  await deactivateSupportImpl();
}