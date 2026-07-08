# Security Policy

We take the security of this project seriously. Because JobApplier operates locally on personal candidate profile data, including documents, protecting your privacy is our primary focus.

## Local-First Security Design

* **No Server Connectivity:** JobApplier does not communicate with external APIs, tracking services, or remote machine models. All data matching calculations are performed locally in memory.
* **Storage Encryption:** Credentials and files are stored inside your browser's private local client sandboxes (`chrome.storage.local` and `IndexedDB`), protected by the browser's own filesystem sandbox.

## Supported Versions

Only the latest release version receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| >=0.1.x | :white_check_mark: |
| <0.1.0  | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public GitHub issue. Instead, report it privately to our security team:

* Email: **ahmadhassan.bted@gmail.com**

Please include:

* A detailed description of the vulnerability.
* Steps to reproduce the issue.
* Any impact analysis.

We will review your submission and respond within 48 hours to coordinate a security patch.
