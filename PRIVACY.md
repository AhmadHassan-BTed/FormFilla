# Privacy Policy

**Last updated:** July 2026

## Overview

FormFilla is a browser extension designed to help you automatically fill job application forms, scholarship forms, and other enrollment applications. This Privacy Policy describes what data we collect, how it is used, and your rights regarding that data.

## Data Collection & Storage

### What We Collect
- **Profile Information**: Personal details you enter in the Options page (name, email, phone, address, education history, work experience, etc.)
- **Documents**: Resume, cover letter, photo, and other files you upload for form filling
- **Settings**: Your preferences for auto-fill behavior, theme selection, and opt-in settings

### How We Store It
All data is stored **locally on your device only**:
- Profile JSON data is stored in `chrome.storage.local` (browser's built-in storage)
- Uploaded documents are stored in `IndexedDB` (a browser database) under the name `FormFillaFiles`
- No data is transmitted to external servers during normal operation

### GitHub Verification Feature
When you verify support after 3+ form fills, the extension makes the following **solely to check your GitHub support status**:
- Fetches public repository lists from `api.github.com/users/{username}/repos` (to verify you starred them)
- Checks following status via `api.github.com/users/{username}/following/{target}`
- These requests are **public API calls** that do not require authentication and do not contain your personal profile data

## Data Sharing

We do **not** share your data with anyone. The only network requests made are:
1. To GitHub's public API for star/follow verification (as described above)
2. These requests contain no personal profile information and are used solely for project support verification

## Permissions Explained

| Permission | Purpose |
|----------|---------|
| `storage` | Store your profile and settings locally |
| `scripting` | Run the content script on the active tab when you click "Fill this page" |
| `activeTab` | Access the current webpage only when you initiate a fill action |
| `<all_urls>` (optional) | Allow the extension to run on any website where you might need to fill forms |

## Your Rights

- You can delete all your profile data at any time by clicking "Remove Profile" in the Options page
- You can export your profile as JSON before deleting
- All data stays on your device unless you explicitly share it

## Contact

If you have questions about this Privacy Policy, contact: ahmadhassan.bted@gmail.com

## Changes to This Policy

Any changes to this policy will be updated in the extension and reflected in this document.