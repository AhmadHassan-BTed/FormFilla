/**
 * GitHub support tracking storage.
 * Tracks star/follow status with a gentle, non-blocking reminder system.
 */

const STORAGE_KEY = 'formfilla_github_support';

export interface GitHubSupportState {
  /** ISO timestamp of when the user first used the extension */
  firstUseDate: string | null;
  /** Whether the user has starred the repo */
  starred: boolean;
  /** Whether the user has followed the author */
  followed: boolean;
  /** Whether the user has dismissed the support prompt */
  dismissed: boolean;
  /** ISO timestamp of the last reminder shown */
  lastReminderDate: string | null;
  /** Number of times the reminder has been shown */
  reminderCount: number;
}

const DEFAULT_STATE: GitHubSupportState = {
  firstUseDate: null,
  starred: false,
  followed: false,
  dismissed: false,
  lastReminderDate: null,
  reminderCount: 0,
};

/**
 * Load the GitHub support state from chrome.storage.local.
 */
export async function getSupportState(): Promise<GitHubSupportState> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const saved = result[STORAGE_KEY] as Partial<GitHubSupportState> | undefined;
    return { ...DEFAULT_STATE, ...saved };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/**
 * Save the GitHub support state to chrome.storage.local.
 */
async function saveSupportState(state: GitHubSupportState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

/**
 * Initialize the support state on first use.
 */
export async function initSupportState(): Promise<GitHubSupportState> {
  const state = await getSupportState();
  if (!state.firstUseDate) {
    state.firstUseDate = new Date().toISOString();
    await saveSupportState(state);
  }
  return state;
}

/**
 * Mark the repo as starred.
 */
export async function markStarred(): Promise<void> {
  const state = await getSupportState();
  state.starred = true;
  await saveSupportState(state);
}

/**
 * Mark the author as followed.
 */
export async function markFollowed(): Promise<void> {
  const state = await getSupportState();
  state.followed = true;
  await saveSupportState(state);
}

/**
 * Dismiss the support prompt.
 */
export async function dismissSupport(): Promise<void> {
  const state = await getSupportState();
  state.dismissed = true;
  await saveSupportState(state);
}

/**
 * Record that a reminder was shown.
 */
export async function recordReminderShown(): Promise<void> {
  const state = await getSupportState();
  state.lastReminderDate = new Date().toISOString();
  state.reminderCount += 1;
  await saveSupportState(state);
}

/**
 * Determine if the support prompt should be shown.
 * Rules:
 * - Never show if already starred+followed or dismissed
 * - Show immediately on first use (gentle prompt)
 * - Show reminder after 3 days if not yet supported
 * - Show reminder after 7 days if still not supported (max 2 reminders)
 */
export async function shouldShowSupport(): Promise<boolean> {
  const state = await getSupportState();

  // Already fully supported or dismissed
  if (state.dismissed) return false;
  if (state.starred && state.followed) return false;

  const now = Date.now();

  // First use — show immediately
  if (!state.lastReminderDate) return true;

  const daysSinceLastReminder = (now - new Date(state.lastReminderDate).getTime()) / (1000 * 60 * 60 * 24);

  // Show reminder after 3 days, then again after 7 days (max 2 reminders)
  if (state.reminderCount === 0 && daysSinceLastReminder >= 3) return true;
  if (state.reminderCount === 1 && daysSinceLastReminder >= 7) return true;

  return false;
}