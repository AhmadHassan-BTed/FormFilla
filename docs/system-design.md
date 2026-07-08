# System Design

This document explains the data flow, persistence layout, and DOM writing abstractions used in FormFilla.

## Data Persistence

* **Options Dashboard:** The primary setup interface. All textual configuration is written directly to `chrome.storage.local`. Large files (like resumes, cover letters, and pictures) are converted to `ArrayBuffer` objects and persisted inside browser-level **IndexedDB** sandboxes under the database name `FormFillaFiles`.
* **Popup Controller:** A simple control panel. It queries the active tab window, triggers the content script, and outputs match count statistics.

## DOM Writing Abstractions

FormFilla implements a specialized value injector to bypass virtual DOM state overrides. Setting `element.value = "..."` directly on React, Angular, or Vue inputs only updates the visible DOM without syncing the framework's internal store.

## JSON Database Architecture

FormFilla separates execution logic from semantic data. The matching algorithms are immutable, while all semantic mapping logic is stored in 4 decoupled, human-readable JSON files designed for independent AI scaling.