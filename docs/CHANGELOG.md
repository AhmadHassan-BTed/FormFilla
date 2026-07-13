# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-08

### Added
* **Scaffolding:** Manifest V3 template, esbuild configurations, strict tsconfig rules.
* **Scanning & Detection:** High-speed recursive DOM scanner and repeated block structure analyzer (education, experience, references).
* **Fuzzy Matching Algorithm:** Custom implementations of Dice's Coefficient, Jaro-Winkler distance, and Levenshtein metrics.
* **Global Resolver:** Kuhn-Munkres (Hungarian) bipartite matching algorithm to resolve competitive profile assignments.
* **Injectors:** Framework-safe setter callbacks simulating native UI input/change event bubbles.
* **UI Controls:** Options Dashboard page and a glassmorphic Popup trigger interface.
* **Support & Feedback:** Activation status indicator (popup + options) and a Support & Feedback form that opens your GitHub issue-tracker with Bug/Feature templates prefilled.
* **Tests:** Vitest harness with JSDOM and Chrome storage mocks verifying matching configurations.

## [0.1.1] - 2026-07-13

### Added
* **Mind2Web Benchmarking**: Integrated osunlp/Mind2Web dataset and created [scripts/evaluate-mind2web.js](../scripts/evaluate-mind2web.js) local JSDOM stress-testing runner.
* **Popup Stats Header**: Dynamic fields scanner metric displaying total scanned inputs (`Analysis & Fill Summary (X Fields)`) inside the popup.
* **Document Fallbacks**: CV and Resume cross-fallback value resolution in the filling orchestrator.

### Fixed
* **Engine Type Restrictions**: Added `'search'` and `'password'` to allowedTypes in dynamic rules generation to resolve misses on location and credentials fields.
* **File Upload Scanning**: Bypassed size/visibility checks for native hidden `<input type="file">` elements in the scanner, allowing custom-styled upload widgets to be successfully scanned.
* **Orchestrator Object Validation**: Updated `isFillableValue` to accept document metadata objects instead of silently skipping file filling operations.
* **Options Page Contrast**: Replaced default download buttons with high-contrast indigo-glassmorphism elements to ensure text readability.
* **Hungarian Assignment Normalization**: Preserved case boundaries in faked profile targets to match fuzzy scoring criteria.
