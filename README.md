<h1 align="center">Hired</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License"></a>
  <a href="https://github.com/AhmadHassan-BTed/Hired/actions"><img src="https://github.com/AhmadHassan-BTed/Hired/actions/workflows/ci.yml/badge.svg" alt="CI Status"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/Version-0.1.0-purple.svg" alt="Version"></a>
  <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/Language-TypeScript-blue.svg" alt="TypeScript"></a>
</p>

<p align="center">
  <strong>A local-first, privacy-respecting form engine designed to restore candidate dignity and speed in the modern job hunt.</strong>
</p>

<hr />

## The Philosophy

Job hunting is exhausting, repetitive, and increasingly dehumanizing. Candidates spend hours copy-pasting their professional profiles into applicant tracking systems (ATS) that often parse records inaccurately. 

Hired was created by **Ahmad Hassan (B-Ted)** to reclaim candidate time. Built as a local-first browser extension, it processes all data in memory, ensuring that personal details (such as contact information, references, and resumes) never leave the local environment.

---

## Technical Architecture

Hired runs a structured analysis and injection pipeline inside the browser. It avoids fragile heuristics by utilizing classical bipartite graph matching.

### 1. Element Scanning & Normalization

The system recursively scans the active DOM (including same-origin frame nodes) to locate target inputs. Elements undergo signal normalization (tokenization, case conversions, and abbreviation expansions) before scoring.

```mermaid
flowchart TD
    DOM[Active DOM Subtree] --> Scan[Scanner: Find Inputs, Selects, & Textareas]
    Scan --> Blocks[Repeated Block Detector: Identify School/Work Cards]
    Blocks --> Extract[Signal Extractor: Read Label, Placeholder, ID, Name]
    Extract --> Normalizer[Normalizer: Tokenize & Expand Abbreviations]
    Normalizer --> Tokens[Normalized Tokens]
```

### 2. Kuhn-Munkres (Hungarian) Scoring Engine

Rather than using a greedy best-match strategy (which often leads to field misalignments), Hired models form filling as a **Maximum Weight Bipartite Matching** problem. The Kuhn-Munkres algorithm solves this globally, maximizing the overall score confidence across the form.

```mermaid
flowchart TD
    Tokens[Normalized Field Tokens] --> Scorer[Signal Scorer: Fuzzy Sim + Regex]
    Profile[Candidate Profile JSON] --> Scorer
    Scorer --> CostMatrix[Build Cost Matrix: 100 - Score]
    CostMatrix --> Hungarian[Hungarian Minimization Algorithm]
    Hungarian --> GlobalMatching[Globally Optimal Field-to-Key Mapping]
```

### 3. Framework-Safe DOM Writing

Standard value assignment fails on websites built with modern frameworks (React, Vue, Angular) because virtual DOM trees override standard property setters. Hired retrieves the browser's native property setter descriptors and dispatches bubbling events to trigger state updates.

```mermaid
sequenceDiagram
    participant E as Core Orchestrator
    participant D as Target DOM Element
    participant F as Web Framework (React/Vue/JS)
    
    E->>D: Resolve Value Assignment
    E->>D: Call native prototype setter (bypass wrapper)
    D-->>F: Update element value
    E->>D: Dispatch event: 'input' (bubbling: true)
    E->>D: Dispatch event: 'change' (bubbling: true)
    F-->>F: Sync internal state store
    Note over D,F: Element highlighted green/amber for review
```

---

## Features & Gates

* **Zero Network Requests:** Data is stored locally using `chrome.storage.local` and IndexedDB. There are no tracking scripts or server APIs.
* **Repeated Block Fingerprinting:** Correctly groups and indexes repeated lists (e.g. multiple jobs or degrees) by checking element layouts.
* **Unified File Transfers:** Simulates drag-and-drop operations using synthetic `DataTransfer` streams to upload local resumes and cover letters.
* **Sensitivity Gating:**
  * **Standard (Green/Amber):** Fills details instantly and highlights them for quick visual checking.
  * **EEO Protections (Opt-in):** Disables equal-opportunity fields unless they are explicitly enabled in the settings panel.
  * **Critical Items (Needs Confirm):** Fields like Social Security Numbers are never auto-filled. Instead, a floating golden badge appears, requiring a manual click to confirm injection.

---

## Directory Structure

```
Hired/
├── .github/               # CI/CD Workflows & Templates
├── docs/                  # Detailed System and Security Guides
├── src/
│   ├── background/        # Service Worker bootstrapping
│   ├── content/           # Core runtime engine
│   │   ├── adapters/      # Site-specific platform adapters (Workday, Lever)
│   │   ├── core/          # Orchestrator and logic bootstrappers
│   │   ├── dom/           # DOM traversal and observers
│   │   ├── fill/          # Value injectors and event simulation
│   │   ├── ui/            # Highlighters and badge widgets
│   ├── options/           # Dashboard settings panel (HTML/CSS/TS)
│   ├── popup/             # Action panel (HTML/CSS/TS)
│   └── shared/            # Common drivers, configs, and types
├── tests/                 # JSDOM unit test runner suites
├── build.js               # esbuild bundler configuration
└── vitest.config.ts       # Test runner configuration
```

---

## Setup & Development

### 1. Installation

Install project dependencies and build the extension:

```bash
# Clone the repository
git clone https://github.com/AhmadHassan-BTed/Hired.git
cd Hired

# Install local dependencies
npm install

# Copy local configurations
cp .env.example .env

# Build unpacked files
npm run build
```

### 2. Loading the Extension in Chrome

1. Navigate to `chrome://extensions/` in Google Chrome.
2. Toggle **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `dist/` directory inside this repository.

### 3. Environment Variables

<details>
<summary><b>Click to expand environment configurations</b></summary>

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DEBUG_MODE` | `boolean` | `false` | Enables detailed logging in the browser console. |
| `MOCK_STORAGE` | `boolean` | `false` | Uses an in-memory database mock for testing. |
| `BYPASS_CONFIRMATIONS` | `boolean` | `false` | Automatically fills critical fields without requiring confirmation (for development use only). |

</details>

---

## Testing & Quality Assurance

Static verification and unit testing are configured to validate changes:

```bash
# Run unit and integration tests
npm run test

# Run static type checks
npx tsc --noEmit
```

Docker configurations are available to compile and test the extension within a standardized container:

```bash
# Run tests inside Docker
docker-compose up --build
```

---

## Roadmap

* **Q3 2026:** Custom field selection overrides saved to local storage.
* **Q4 2026:** Platform adapters for Taleo, Workable, and Breezy HR.
* **Q1 2027:** Encrypted profile backup exports using client-side AES-GCM.

---

## License & Support

This project is open-source and licensed under the [MIT License](LICENSE). 

For bug reports or support inquiries, open an issue in this repository or contact the author, **AhmadHassan-BTed**, at **ahmadhassan.bted@gmail.com**. Refer to the [Security Policy](SECURITY.md) for vulnerability reporting.
