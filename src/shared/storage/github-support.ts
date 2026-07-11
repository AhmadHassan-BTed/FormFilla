/**
 * GitHub support verification system — the single source of truth for
 * support/activation state. This module DOES gate a real feature: after
 * 3 form fills, the fill button is hidden behind a required-verification
 * panel (see popup.ts) until this module reports `completed: true`.
 *
 * Requirement: the user must star ALL public repos of AhmadHassan-BTed
 * and Fractal-Compute-Orchestrations, and follow both accounts. Daily
 * re-verification ensures newly-created repos are also starred.
 *
 * Verification uses the GitHub public API:
 *  - GET /users/{username}/starred  → paginated list of repos the user has starred
 *  - GET /users/{username}/following/{target} → 204 if following, 404 if not
 *
 * ── Bypasses (both real, both skip live GitHub calls) ─────────────────
 * 1. Author bypass: if the entered username case-insensitively matches
 *    GITHUB_USER, verification is skipped — the author doesn't need to
 *    star/follow themself. Trusts whatever string is typed; low stakes
 *    only because this whole system is a soft nag rather than a paid
 *    feature gate.
 * 2. Dev/testing bypass: entering the literal string '090078601' in the
 *    username field (see popup.ts) causes the UI to call this module
 *    with the placeholder username 'dev-bypass', which also skips
 *    verification. This string lives in shipped, unpacked source and is
 *    trivially discoverable — treat it as a public password, not a
 *    secret. Anyone who reads it gets a permanent skip of the fill-gate.
 *
 * This is the ONLY module that owns support/activation state
 * (STORAGE_KEY below). activation-status.ts reads from this module's
 * state rather than keeping its own copy, to avoid the two silently
 * disagreeing.
 */

const STORAGE_KEY = 'formfilla_github_support';

export interface GitHubSupportState {
  /** ISO timestamp of when the user first used the extension */
  firstUseDate: string | null;
  /** Number of forms filled */
  formsFilled: number;
  /** Whether the user has completed the support requirement */
  supportCompleted: boolean;
  /** ISO timestamp of last support verification */
  lastVerificationDate: string | null;
  /** Whether the user has dismissed the support prompt */
  dismissed: boolean;
  /** ISO timestamp of the last reminder shown */
  lastReminderDate: string | null;
  /** Number of times the reminder has been shown */
  reminderCount: number;
  /** The user's GitHub username (saved after first verification) */
  githubUsername: string | null;
}

const DEFAULT_STATE: GitHubSupportState = {
  firstUseDate: null,
  formsFilled: 0,
  supportCompleted: false,
  lastVerificationDate: null,
  dismissed: false,
  lastReminderDate: null,
  reminderCount: 0,
  githubUsername: null,
};

const GITHUB_USER = 'AhmadHassan-BTed';
const GITHUB_ORG = 'Fractal-Compute-Orchestrations';

/** Placeholder username the popup stores when the dev bypass is used. */
const DEV_BYPASS_USERNAME = 'dev-bypass';

// ─── State Management ────────────────────────────────────────────────

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
 * Increment the form fill counter.
 */
export async function incrementFormFill(): Promise<number> {
  const state = await getSupportState();
  state.formsFilled += 1;
  await saveSupportState(state);
  return state.formsFilled;
}

/**
 * Save the user's GitHub username.
 */
export async function saveGithubUsername(username: string): Promise<void> {
  const state = await getSupportState();
  state.githubUsername = username.trim().replace(/^@/, '');
  await saveSupportState(state);
}

/**
 * Get the saved GitHub username (or null).
 */
export async function getGithubUsername(): Promise<string | null> {
  const state = await getSupportState();
  return state.githubUsername;
}

// ─── GitHub API Helpers ──────────────────────────────────────────────

/**
 * Get all public repos for a GitHub user/org.
 * Paginates through all pages to get the complete list.
 */
async function fetchPublicRepos(owner: string): Promise<string[]> {
  const repos: string[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `https://api.github.com/users/${owner}/repos?per_page=100&page=${page}&type=public`,
      { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'FormFilla-Extension' } }
    );

    if (!response.ok) {
      console.warn(`GitHub API error for ${owner}: ${response.status}`);
      return repos;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      hasMore = false;
    } else {
      for (const repo of data) {
        if (!repo.fork && !repo.private) {
          repos.push(repo.full_name);
        }
      }
      page++;
    }
  }

  return repos;
}

/**
 * Fetch ALL repos a user has starred (paginated).
 * Returns a Set of full_name strings for fast lookup.
 */
async function fetchUserStarredRepos(username: string): Promise<Set<string>> {
  const starred = new Set<string>();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `https://api.github.com/users/${username}/starred?per_page=100&page=${page}`,
      { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'FormFilla-Extension' } }
    );

    if (!response.ok) {
      // 404 = user not found, 403 = rate limited
      console.warn(`Failed to fetch starred repos for ${username}: ${response.status}`);
      return starred;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      hasMore = false;
    } else {
      for (const repo of data) {
        if (repo.full_name) {
          starred.add(repo.full_name.toLowerCase());
        }
      }
      page++;
    }
  }

  return starred;
}

/**
 * Check if a GitHub user is following another user/org.
 * GET /users/{username}/following/{target} returns 204 if following, 404 if not.
 */
async function isUserFollowing(username: string, target: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/users/${username}/following/${target}`,
      { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'FormFilla-Extension' } }
    );
    return response.status === 204;
  } catch {
    return false;
  }
}

/**
 * Validate that a GitHub username exists.
 * Author (AhmadHassan-BTed) bypasses validation as they own the repos.
 */
export async function validateGithubUsername(username: string): Promise<boolean> {
  // Author bypasses GitHub API validation - they don't need to star/follow themselves
  if (username.toLowerCase() === GITHUB_USER.toLowerCase()) {
    return true;
  }
  try {
    const response = await fetch(
      `https://api.github.com/users/${username}`,
      { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'FormFilla-Extension' } }
    );
    // Accept 200 OK or handle 403 (rate limiting) gracefully
    if (response.status === 403) {
      console.warn('GitHub API rate limited. Please try again later.');
      return false;
    }
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Verification ────────────────────────────────────────────────────

/**
 * Verify that the user has completed all support requirements.
 * Checks via the GitHub API that the user has:
 *  1. Starred ALL public repos of AhmadHassan-BTed
 *  2. Starred ALL public repos of Fractal-Compute-Orchestrations
 *  3. Followed AhmadHassan-BTed
 *  4. Followed Fractal-Compute-Orchestrations
 *
 * See the module header for the two bypasses this function honors.
 */
export async function verifySupportCompletion(usernameOverride?: string): Promise<{
  completed: boolean;
  missingRepos: string[];
  missingFollows: string[];
  error?: string;
}> {
  const result: {
    completed: boolean;
    missingRepos: string[];
    missingFollows: string[];
    error?: string;
  } = {
    completed: false,
    missingRepos: [],
    missingFollows: [],
  };

  // Determine username
  const username = usernameOverride || (await getGithubUsername());
  if (!username) {
    result.error = 'No GitHub username provided. Please enter your username first.';
    return result;
  }

  // Dev/testing bypass (placeholder username set by popup when the
  // hardcoded bypass code is entered). See module header.
  if (username === DEV_BYPASS_USERNAME) {
    return {
      completed: true,
      missingRepos: [],
      missingFollows: [],
    };
  }

  // Author bypass - they don't need to star/follow themselves
  if (username.toLowerCase() === GITHUB_USER.toLowerCase()) {
    return {
      completed: true,
      missingRepos: [],
      missingFollows: [],
    };
  }

  try {
    // Step 1: Fetch all required repos (dynamic — catches new repos)
    const [userRepos, orgRepos] = await Promise.all([
      fetchPublicRepos(GITHUB_USER),
      fetchPublicRepos(GITHUB_ORG),
    ]);
    const allRequiredRepos = [...userRepos, ...orgRepos];

    // Step 2: Fetch all repos the user has starred
    const userStarred = await fetchUserStarredRepos(username);

    // Step 3: Find which required repos are NOT starred
    for (const repo of allRequiredRepos) {
      if (!userStarred.has(repo.toLowerCase())) {
        result.missingRepos.push(repo);
      }
    }

    // Step 4: Check following status
    const [followsUser, followsOrg] = await Promise.all([
      isUserFollowing(username, GITHUB_USER),
      isUserFollowing(username, GITHUB_ORG),
    ]);

    if (!followsUser) result.missingFollows.push(GITHUB_USER);
    if (!followsOrg) result.missingFollows.push(GITHUB_ORG);

    // Complete only if nothing is missing
    result.completed = result.missingRepos.length === 0 && result.missingFollows.length === 0;
  } catch (err) {
    console.warn('GitHub verification failed:', err);
    result.error = 'Could not reach GitHub. Check your connection and try again.';
  }

  return result;
}

// ─── State Transitions ───────────────────────────────────────────────

/**
 * Mark support as completed.
 */
export async function markSupportCompleted(): Promise<void> {
  const state = await getSupportState();
  state.supportCompleted = true;
  state.lastVerificationDate = new Date().toISOString();
  state.dismissed = false;
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
 * Deactivate support (reset to not completed state).
 * Used when user wants to re-verify support. Wired to the "Deactivate"
 * button in the Options UI via activation-status.ts.
 */
export async function deactivateSupport(): Promise<void> {
  const state = await getSupportState();
  state.supportCompleted = false;
  state.lastVerificationDate = null;
  state.dismissed = false;
  await saveSupportState(state);
}

/**
 * Determine if the user needs to verify support (daily check).
 * Returns true if it's been more than 24 hours since last verification.
 */
export async function needsDailyVerification(): Promise<boolean> {
  const state = await getSupportState();
  if (!state.supportCompleted) return false; // Not yet completed initial setup

  if (!state.lastVerificationDate) return true;

  const now = Date.now();
  const lastVerification = new Date(state.lastVerificationDate).getTime();
  const hoursSinceVerification = (now - lastVerification) / (1000 * 60 * 60);

  return hoursSinceVerification >= 24;
}

/**
 * Determine if the support prompt should be shown.
 * Rules:
 * - If support not completed and formsFilled >= 3: MUST show (blocking)
 * - If support not completed and formsFilled < 3: show gentle prompt
 * - If support completed but needs daily verification: show verification prompt
 * - If dismissed and support not completed: still show after 3 fills
 */
export async function shouldShowSupport(): Promise<{
  show: boolean;
  isRequired: boolean;
  reason: 'initial' | 'required' | 'daily-verification' | 'none';
}> {
  const state = await getSupportState();

  // If support is completed, check daily verification
  if (state.supportCompleted) {
    const needsVerification = await needsDailyVerification();
    if (needsVerification) {
      return { show: true, isRequired: true, reason: 'daily-verification' };
    }
    return { show: false, isRequired: false, reason: 'none' };
  }

  // Support not completed yet
  if (state.formsFilled >= 3) {
    // After 3 fills, it's REQUIRED
    return { show: true, isRequired: true, reason: 'required' };
  }

  // Before 3 fills, show gentle prompt
  if (state.dismissed) {
    // Don't show again if dismissed (until 3 fills)
    return { show: false, isRequired: false, reason: 'none' };
  }

  // First use or reminder
  if (!state.lastReminderDate) {
    return { show: true, isRequired: false, reason: 'initial' };
  }

  const now = Date.now();
  const daysSinceLastReminder = (now - new Date(state.lastReminderDate).getTime()) / (1000 * 60 * 60 * 24);

  // Gentle reminders before 3 fills
  if (state.reminderCount === 0 && daysSinceLastReminder >= 3) {
    return { show: true, isRequired: false, reason: 'initial' };
  }
  if (state.reminderCount === 1 && daysSinceLastReminder >= 7) {
    return { show: true, isRequired: false, reason: 'initial' };
  }

  return { show: false, isRequired: false, reason: 'none' };
}

/**
 * Get the owners whose repos and profiles need to be starred/followed.
 */
export function getSupportOwners(): { user: string; org: string } {
  return { user: GITHUB_USER, org: GITHUB_ORG };
}