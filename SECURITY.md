# Security Policy

Security is prioritized in this project. Because Hired operates locally on personal candidate profile data, including documents, protecting candidate privacy is the primary focus.

## Local-First Security Design

* **No Server Connectivity:** Hired does not communicate with external APIs, tracking services, or remote machine models. All data matching calculations are performed locally in memory.
* **Storage Encryption:** Credentials and files are stored inside private local client sandboxes (`chrome.storage.local` and `IndexedDB`), protected by the browser's own filesystem sandbox.

## Supported Versions

Only the latest release version receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| >=0.1.x | :white_check_mark: |
| <0.1.0  | :x:                |

## Reporting a Vulnerability

If a security vulnerability is discovered, please do not open a public GitHub issue. Instead, report it privately to:

* Email: **ahmadhassan.bted@gmail.com**

Please include:

* A detailed description of the vulnerability.
* Steps to reproduce the issue.
* Any impact analysis.

Submissions will be reviewed and responded to within 48 hours to coordinate a security patch.
