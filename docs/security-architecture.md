# Security Architecture

This document describes the security controls and sandbox protections implemented in FormFilla.

## Zero-Trust, Zero-Network Boundary

FormFilla operates under a strict **Zero-Trust, Zero-Network** security boundary:
* **Zero Network Requests:** The extension codebase does not contain any calls to `fetch()`, `XMLHttpRequest`, or third-party tracking APIs.

## Data Isolation

To prevent cross-site scripting (XSS) attacks from compromising candidate profiles, FormFilla isolates data storage:
* **JSON Profile Store:** Textual profiles are saved inside `chrome.storage.local`. This store is isolated at the extension level, making it inaccessible to standard web pages.
* **IndexedDB Binary Store:** Binary resumes, cover letters, and photo data are kept in the extension's local sandboxed IndexedDB database (`FormFillaFiles`). It is inaccessible to any client website script.
* **No Page-Context Exposure:** Content scripts run in an isolated execution sandbox. While they have access to the page's DOM, they do not share global namespace variables or window variables with the site's scripts, preventing page-level scripts from reading the extension's storage.

## JSON Database Security

FormFilla uses isolated JSON databases (`rules.json`, `profile-template.json`, `abbreviations.json`, `degrees.json`) to drive the parsing logic:
* **No Code Execution:** Because these files are static JSON structures, they cannot execute scripts, preventing malicious modifications or prototype pollution from externalized dictionary entries.