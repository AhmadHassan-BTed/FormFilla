# Security Policy

Security is prioritized in this project. Because FormFilla operates locally on personal candidate profile data, including documents, protecting candidate privacy is the primary focus.

## Security Architecture

* **No Server Connectivity:** FormFilla does not communicate with external APIs, tracking services, or remote machine models. All data matching calculations are performed locally in memory.
* **Storage Encryption:** Credentials and files are stored inside private local client sandboxes (`chrome.storage.local` and `IndexedDB`), protected by the browser's own filesystem sandbox.

## Reporting a Vulnerability

To report a security vulnerability, contact **AhmadHassan-BTed** at **ahmadhassan.bted@gmail.com**. Do not open public issues for security-related concerns.