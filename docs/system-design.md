# System Design - Data Flow and State Synchronization

This document explains the data flow, persistence layout, and DOM writing abstractions used in Hired.

---

## 1. System Data Flow

```
   [Options Dashboard]                     [Popup UI panel]
          |                                       |
    Saves JSON/Files                        Sends START_FILL
          |                                       |
          v                                       v
+--------------------+                  +---------------------+
| Local Sandbox:     |                  | Content Script:     |
| - chrome.storage   | <=============>  | - scanForFields()   |
| - IndexedDB        |   Reads Profile  | - resolveAllFields()|
+--------------------+                  | - writeValue()      |
                                        +---------------------+
```

* **Options Dashboard:** The primary setup interface. All textual configuration is written directly to `chrome.storage.local`. Large files (like resumes, cover letters, and pictures) are converted to `ArrayBuffer` objects and persisted inside browser-level **IndexedDB** sandboxes under the database name `HiredFiles`.
* **Popup Controller:** A simple control panel. It queries the active tab window, triggers the content script, and outputs match count statistics.
* **Content Script Core:** The central execution worker. It reads data from local sandbox storage, runs the scanners, scores matches, and mutates the form elements.

---

## 2. State & Module Boundaries

* **Immutable Configs:** Configuration constants, dictionary rules, and ranking indexes are immutable, stateless configurations.
* **Storage Wrapper Isolation:** All storage modifications occur via [storage-client.ts](../../src/shared/storage/storage-client.ts). Content scripts and settings pages access persistence only through this contract.
* **State Sync:** Background scripts operate as transient workers and do not retain business state in memory, conforming to Chrome Manifest V3 service-worker lifecycle limits.

---

## 3. Framework-Safe DOM Writing

Hired implements a specialized value injector to bypass virtual DOM state overrides. Setting `element.value = "..."` directly on React, Angular, or Vue inputs only updates the visible DOM without syncing the framework's internal store.

The injector solves this by:
1. Fetching the native element prototype descriptor setter (`HTMLInputElement.prototype` or `HTMLTextAreaElement.prototype`).
2. Calling the native setter, bypassing the framework's overridden wrapper:
   ```typescript
   nativeSetter.call(element, value);
   ```
3. Dispatching bubbling `input` and `change` events on the input node so framework reactive hooks catch and commit the updates.

---

## 4. Custom Combobox Adapters

For custom selection elements (which are stylized divs without standard selects):
* The adapter fires a click event on the combobox trigger element to mount the options dropdown.
* It simulates character-by-character typing into the search node to trigger client-side filtration logic.
* It polls the DOM (up to `1500ms`) for elements matching standard combobox selectors (`[role="option"]`, etc.).
* It evaluates the mounted options using fuzzy string matching and clicks the winning option.
* If it fails to find a match, it dispatches an `Escape` key event to close the dropdown cleanly.
