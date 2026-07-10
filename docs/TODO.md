# FormFilla Coherence Audit & Fix Plan

Full analysis of the GitHub star/follow system, issue templates, feedback system, downloadable JSON template, and activation section.

---

## Issues Found

### 🔴 Critical: Verification System Cannot Actually Verify Stars

The `verifySupportCompletion()` in [github-support.ts](../src/shared/storage/github-support.ts) **cannot actually verify** whether a specific user has starred repos. The code acknowledges this in comments (lines 118-121, 145-147):

> "We can't reliably check if a specific user starred without auth"

The current `isRepoStarred()` function just checks if the repo exists and has _any_ stars — it doesn't verify the _user_'s star. The `verifySupportCompletion()` function checks if repos are accessible (not if they're starred), so the "verify" button always passes as long as the GitHub API is reachable.

**Impact**: The entire gating system is a no-op. Users can click "I've starred & followed all" and pass verification without actually starring anything.

---

### 🔴 Critical: `getSupportTargets()` is Hardcoded, Not Dynamic

[getSupportTargets()](../src/shared/storage/github-support.ts) returns a hardcoded list of 3 repos. But the whole point is to dynamically fetch **all public repos** under `AhmadHassan-BTed` and `Fractal-Compute-Orchestrations`. The `fetchPublicRepos()` function exists and does this correctly, but `getSupportTargets()` ignores it.

---

### 🟡 Major: Feedback Issues Go to `AhmadHassan-BTed/issue-tracker` (doesn't exist)

[feedback.ts](../src/shared/storage/feedback.ts) targets `AhmadHassan-BTed/issue-tracker`. This repo does not exist. The user asked issues to go to the **public** `FormFilla` repo instead.

---

### 🟡 Major: `section-activation` Missing from Options HTML

The options page sidebar has a nav button `data-section="activation"` ([options.html](../src/options/options.html)), but there is **no corresponding `<section id="section-activation">`** in the HTML. The `activation-status.ts` UI code looks for `activation-status-label` and `activation-status-detail` elements that don't exist. Clicking "Activation" in the sidebar shows nothing.

---

### 🟡 Major: `setupGithubVerification()` References Missing HTML Elements

[options.ts](../src/options/options.ts) references `verify-github-btn`, `github-profile-url`, and `github-verify-status` — **none of these exist** in `options.html`. This function silently fails.

---

### 🟠 Moderate: Feature Request Template Says "JobApplier" Instead of "FormFilla"

The `.github/ISSUE_TEMPLATE/feature_request.md` says `about: Suggest a new idea or improvement for JobApplier`. Should say FormFilla.

---

### 🟠 Moderate: Export Filenames Use "hired" Instead of "formfilla"

[options.ts](../src/options/options.ts) downloads `hired_profile.json` and `hired_extensive_template.json`. Should be `formfilla_profile.json` and `formfilla_extensive_template.json`.

---

### 🟢 Minor: Profile Template JSON is Complete and Coherent

The [profile-template.json](../src/shared/dictionary/profile-template.json) is comprehensive (362 lines). It covers all sections in the UI (personal, education, experience, references, projects, certifications, skills, languages, awards, coursework, documents, EEO, academics, optIns, family). The `mergeProfileWithTemplate()` function correctly merges all these sections. The `__meta__` block is properly stripped on export. **This is coherent and complete.**

---

## Proposed Changes

### 1. GitHub Support Verification — Use GitHub Username Approach

Since we can't verify stars without OAuth, the best seamless approach is:

1. When the support gate triggers (after 3 fills), ask the user for their **GitHub username** (one-time input, saved)
2. Use the GitHub API to check: `GET /users/{username}/starred` — paginate through all starred repos
3. Similarly check following via: `GET /users/{username}/following/{target}` — returns `204` if following, `404` if not.
4. Dynamically fetch all public repos via the existing `fetchPublicRepos()` function.

> [!IMPORTANT]
> **User review needed**: The GitHub API endpoints `/users/{username}/starred` and `/users/{username}/following/{target}` are **public** and don't require auth. However, the starred endpoint returns a paginated list (not a direct yes/no), so we'll need to paginate through all starred repos to check. An alternative is to check stargazers of each repo — but that's also paginated and worse for repos with many stars.
>
> The most efficient approach: Use `GET /users/{username}/starred?per_page=100` and paginate through all starred repos, then check if each required repo is in the list. For following, `GET /users/{username}/following/{target}` returns 204/404 directly.

#### [MODIFY] [github-support.ts](../src/shared/storage/github-support.ts)

- Add `githubUsername` field to `GitHubSupportState`
- Add `saveGithubUsername()` and `getGithubUsername()` helpers
- Rewrite `verifySupportCompletion()` to use the user's GitHub username
- Fetch all starred repos for the user and compare against all public repos from both owners
- Check following status for both `AhmadHassan-BTed` and `Fractal-Compute-Orchestrations`
- Remove `getSupportTargets()` hardcoded function (use dynamic fetching)

---

### 2. Add Activation Section to Options HTML

#### [MODIFY] [options.html](../src/options/options.html)

- Add `<section id="section-activation">` between Getting Started and Personal Info sections
- Include `activation-status-label`, `activation-status-detail` elements
- Add GitHub username input field (`github-profile-url` → rename to `github-username`)
- Add verify button and status display
- Show star/follow requirements with dynamic repo list

---

### 3. Fix Feedback System to Target FormFilla Repo

#### [MODIFY] [feedback.ts](../src/shared/storage/feedback.ts)

- Change `ISSUE_TRACKER_REPO` from `'AhmadHassan-BTed/issue-tracker'` to `'AhmadHassan-BTed/FormFilla'`

---

### 4. Fix Issue Templates

#### [MODIFY] [.github/ISSUE_TEMPLATE/feature_request.md](../.github/ISSUE_TEMPLATE/feature_request.md)

- Change "JobApplier" to "FormFilla"

---

### 5. Fix Export Filenames

#### [MODIFY] [options.ts](../src/options/options.ts)

- Change `hired_profile.json` → `formfilla_profile.json`
- Change `hired_extensive_template.json` → `formfilla_extensive_template.json`

---

### 6. Create GitHub Labels on FormFilla Repo

Create labels needed by the issue templates on the public `FormFilla` repo. The `bug` and `enhancement` labels already exist (GitHub defaults). No additional labels needed.

---

### 7. Update Popup Panels to Include GitHub Username Input

#### [MODIFY] [popup.html](../src/popup/popup.html)

- Add GitHub username input field to the required support panel
- Add GitHub username input field to the daily verification panel

#### [MODIFY] [popup.ts](../src/popup/popup.ts)

- Wire up the username input to the verification flow
- Save/load username from storage

---

## Open Questions

> [!IMPORTANT]
> **GitHub API Rate Limits**: The unauthenticated GitHub API has a 60 requests/hour limit. Fetching all public repos for 2 owners + checking all starred repos for a user could consume 5-10 requests per verification. Is this acceptable? The daily check keeps it reasonable, but if a user clicks "verify" repeatedly, they could hit the limit.

> [!WARNING]
> **The `AhmadHassan-BTed/issue-tracker` repo does not exist**. The feedback system currently points there. I'll redirect to `FormFilla`. Is that correct, or should I create a separate issue-tracker repo?

## Verification Plan

### Manual Verification

- Build the extension with `npm run build` (or equivalent)
- Load into Chrome and test the 3-fill gating flow
- Test daily verification flow
- Test the feedback "Open GitHub Issue" button targets FormFilla
- Test export filenames
- Verify the Activation section renders in options page