# Security & Sandbox Architecture

This document describes the security controls and sandbox protections implemented in Hired.

---

## 1. Local-First Security Design

Hired operates under a strict **Zero-Trust, Zero-Network** security boundary:
* **Zero Network Requests:** The extension codebase does not contain any calls to `fetch()`, `XMLHttpRequest`, or third-party tracking APIs.
* **No Remote Processing:** All scoring, tokenization, normalizations, and Hungarian assignments are executed completely within the active browser tab's local context.
* **No Telemetry Leakage:** Execution summary metrics (confident, review, unmapped, confirm counts) are sent back to the popup panel for display, but no actual profile values or field structures ever leave the browser tab boundaries.

---

## 2. Storage Sandbox Boundaries

To prevent cross-site scripting (XSS) attacks from compromising candidate profiles, Hired isolates data storage:
* **JSON Profile Store:** Textual profiles are saved inside `chrome.storage.local`. This store is isolated at the extension level, making it inaccessible to standard web pages.
* **IndexedDB Binary Store:** Binary resumes, cover letters, and photo data are kept in the extension's local sandboxed IndexedDB database (`HiredFiles`). It is inaccessible to any client website script.
* **No Page-Context Exposure:** Content scripts run in an isolated execution sandbox. While they have access to the page's DOM, they do not share global namespace variables or window variables with the site's scripts, preventing page-level scripts from reading the extension's storage.

---

## 3. Frame Security & Cross-Origin Isolation

Recruitment portals often render form parts inside nested `<iframe>` containers.
* **Same-Origin Frames:** Same-origin iframes are scanned recursively by checking `iframe.contentDocument` and accessing form fields normally.
* **Cross-Origin Frames:** Accessing cross-origin frames throws a `SecurityError` due to browser Same-Origin Policy protections.
* **Blocked Origin Reporting:** The scanner catches `SecurityError` during traversal, extracts the frame origin via `iframe.src`, and sends a `PERMISSION_NEEDED` notification to the popup UI. This allows users to review the origin and choose whether to grant host permissions, maintaining active consent constraints.

---

## 4. Sensitivity Gates & EEO Protection

To protect sensitive candidate information, the matching rules dictate strict access tiers:
* **EEO Protections:** Sensitive EEO rules (Race, Gender, Veteran, Disability) are protected by a strict opt-in flag. Unless the candidate toggles EEO support on the options dashboard, EEO match rules are completely skipped.
* **Critical Gates:** Highly sensitive credentials (such as Social Security Numbers, National IDs, and Passport IDs) are marked as `critical`. The value is never auto-filled. The review highlighter overlays a persistent golden badge next to the element, requiring the user to explicitly click the "Confirm" action button to inject the value on each run.
