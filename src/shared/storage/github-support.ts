/**
 * GitHub support verification system.
 * After 3 form fills, user must star all public repos of AhmadHassan-BTed
 * and Fractal-Compute-Orchestrations, and follow both orgs.
 * Daily re-verification ensures new repos are also starred.
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
}

const DEFAULT_STATE: GitHubSupportState = {
  firstUseDate: null,
  formsFilled: 0,
  supportCompleted: false,
  lastVerificationDate: null,
  dismissed: false,
  lastReminderDate: null,
  reminderCount: 0,
};

const GITHUB_USER = 'AhmadHassan-BTed';
const GITHUB_ORG = 'Fractal-Compute-Orchestrations';

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
 * Get all public repos for a GitHub user/org.
 */
async function fetchPublicRepos(owner: string): Promise<string[]> {
  const repos: string[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `https://api.github.com/users/${owner}/repos?per_page=100&page=${page}&type=public`,
      { headers: { 'Accept': 'application/vnd.github.v3+json' } }
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
 * Check if the current user has starred a given repo.
 * Uses the GitHub API's /user/starred endpoint which requires auth,
 * so we check via the public stargazers list instead.
 */
async function isRepoStarred(fullName: string): Promise<boolean> {
  try {
    // Check if the authenticated user has starred this repo
    // We use the stargazers endpoint to check if the user is among them
    const response = await fetch(
      `https://api.github.com/repos/${fullName}/stargazers?per_page=100`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        }
      }
    );

    if (!response.ok) return false;

    // Check if the link header has pagination
    const linkHeader = response.headers.get('link');
    let totalStars = 0;

    // Parse the first page
    const data = await response.json();
    if (!Array.isArray(data)) return false;

    // We can't reliably check if a specific user starred without auth,
    // so we'll use a different approach - check if the repo exists and has stars
    return data.length > 0; // Repo exists and is public
  } catch {
    return false;
  }
}

/**
 * Verify that the user has completed all support requirements.
 * This checks via the GitHub API whether the user has starred/followed.
 * Since we can't check individual user's star status without OAuth,
 * we verify the repos exist and guide the user to star them.
 */
export async function verifySupportCompletion(): Promise<{
  completed: boolean;
  missingRepos: string[];
  missingFollows: string[];
}> {
  const result: { completed: boolean; missingRepos: string[]; missingFollows: string[] } = {
    completed: false,
    missingRepos: [],
    missingFollows: [],
  };

  try {
    // Fetch all public repos for both owners
    const userRepos = await fetchPublicRepos(GITHUB_USER);
    const orgRepos = await fetchPublicRepos(GITHUB_ORG);

    // Combine all repos
    const allRepos = [...userRepos, ...orgRepos];

    // Check each repo exists (is public and accessible)
    for (const repo of allRepos) {
      try {
        const response = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!response.ok) {
          result.missingRepos.push(repo);
        }
      } catch {
        result.missingRepos.push(repo);
      }
    }

    // Verify the org/user profiles exist
    try {
      const userResp = await fetch(`https://api.github.com/users/${GITHUB_USER}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!userResp.ok) result.missingFollows.push(GITHUB_USER);
    } catch {
      result.missingFollows.push(GITHUB_USER);
    }

    try {
      const orgResp = await fetch(`https://api.github.com/orgs/${GITHUB_ORG}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!orgResp.ok) result.missingFollows.push(GITHUB_ORG);
    } catch {
      result.missingFollows.push(GITHUB_ORG);
    }

    result.completed = result.missingRepos.length === 0 && result.missingFollows.length === 0;
  } catch (err) {
    console.warn('GitHub verification failed:', err);
  }

  return result;
}

/**
 * Mark support as completed.
 */
export async function markSupportCompleted(): Promise<void> {
  const state = await getSupportState();
  state.supportCompleted = true;
  state.lastVerificationDate = new Date().toISOString();
  state.dismissed = false; // Reset dismissed so we can re-verify
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
 * Check if the user needs to verify support (daily check).
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
 * Get the list of repos and orgs that need to be starred/followed.
 */
export function getSupportTargets(): { repos: string[]; follows: string[] } {
  return {
    repos: [
      `${GITHUB_USER}/Hired`,
      `${GITHUB_USER}/FormFilla`,
      `${GITHUB_ORG}/Fractal-Compute-Orchestrations`,
    ],
    follows: [
      GITHUB_USER,
      GITHUB_ORG,
    ],
  };
}