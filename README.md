<p align="center">
  <img src="docs/assets/small_promo_tile_hd.png" alt="FormFilla promo tile" style="width:100%;max-width:440px;height:auto;" />
</p>

<h1 align="center">FormFilla</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"/></a>
  <img src="https://img.shields.io/badge/Deployment-Chrome%20Extension-blue.svg" alt="Deployment: Chrome Extension"/>
  <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/Language-TypeScript-blue.svg" alt="TypeScript"/></a>
  <img src="https://img.shields.io/badge/Engine-Zero--AI-green.svg" alt="Zero AI" />
  <img src="https://img.shields.io/badge/Logic-Kuhn--Munkres-purple.svg" alt="Kuhn-Munkres" />
  <img src="https://img.shields.io/badge/Architecture-Local--First-teal.svg" alt="Local First" />
  <img src="https://img.shields.io/badge/Privacy-100%25-brightgreen.svg" alt="Privacy" />
</p>

<p align="center">
  <strong>A local-first, privacy-respecting form engine designed to restore candidate dignity and speed in the modern job hunt.</strong>
</p>

<hr />

## The Philosophy

Job hunting is exhausting, repetitive, and increasingly dehumanizing. Candidates spend hours copy-pasting their professional profiles into applicant tracking systems (ATS) that often parse records inaccurately.

FormFilla was created by **Ahmad Hassan (B-Ted)** to reclaim candidate time. Built as a local-first browser extension, it processes all data in memory, ensuring that personal details (such as contact information, references, and resumes) never leave the local environment.

---

## Technical Architecture

FormFilla runs a structured analysis and injection pipeline inside the browser. It avoids fragile heuristics by utilizing classical bipartite graph matching.

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

Rather than using a greedy best-match strategy (which often leads to field misalignments), FormFilla models form filling as a **Maximum Weight Bipartite Matching** problem. The Kuhn-Munkres algorithm solves this globally, maximizing the overall score confidence across the form.

```mermaid
flowchart TD
    Tokens[Normalized Field Tokens] --> Scorer[Signal Scorer: Fuzzy Sim + Regex]
    Profile[Candidate Profile JSON] --> Scorer
    Scorer --> CostMatrix[Build Cost Matrix: 100 - Score]
    CostMatrix --> Hungarian[Hungarian Minimization Algorithm]
    Hungarian --> GlobalMatching[Globally Optimal Field-to-Key Mapping]
```

### 3. Framework-Safe DOM Writing

Standard value assignment fails on websites built with modern frameworks (React, Vue, Angular) because virtual DOM trees override standard property setters. FormFilla retrieves the browser's native property setter descriptors and dispatches bubbling events to trigger state updates.

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

## Features

- **Zero Network Requests:** Data is stored locally using `chrome.storage.local` and IndexedDB. There are no tracking scripts, artificial gates, or required remote APIs.
- **Repeated Block Fingerprinting:** Correctly groups and indexes repeated lists (e.g. multiple jobs or degrees) by checking element layouts.
- **Unified File Transfers:** Simulates drag-and-drop operations using synthetic `DataTransfer` streams to upload local resumes and cover letters.
- **Sensitivity Gating:**
  - **High Confidence:** Automated insertion without prompt.
  - **Review Warning:** Visual styling indicators applied to fields needing validation.
  - **Needs Action:** Explicit confirmation dialogs before modifying sensitive items.

---

## Directory Structure

```
FormFilla/
├── .github/               # CI/CD Workflows & Issue templates
├── docs/                  # Architecture, changelog, and developer specifications
│   ├── assets/            # Store and documentation promo imagery
│   └── implementation-plan.md
├── formfactory/           # Benchmark fixtures
├── icons/                 # Extension icons (16, 32, 48, 128)
├── infra/                 # Infrastructure configurations
│   └── docker/            # Docker Compose & Dockerfile
├── scripts/               # Build & utility scripts
│   ├── build.js           # esbuild bundler configuration
│   ├── generate-icons.ps1 # Icon generation script
│   └── setup.bat          # Windows setup script
├── src/
│   ├── assets/            # Static assets (logos, SVGs)
│   ├── background/        # Service Worker bootstrapping
│   │   └── service-worker.ts
│   ├── content/           # Core runtime engine
│   │   ├── adapters/      # Site-specific platform adapters (Workday, Lever, Greenhouse)
│   │   │   ├── adapter.interface.ts
│   │   │   ├── generic.ts
│   │   │   ├── greenhouse.ts
│   │   │   ├── lever.ts
│   │   │   └── workday.ts
│   │   ├── core/          # Orchestrator and logic bootstrappers
│   │   │   ├── orchestrator.ts
│   │   │   └── value-path.ts
│   │   ├── dom/           # DOM traversal and observers
│   │   │   ├── field-scanner.ts
│   │   │   ├── mutation-watcher.ts
│   │   │   ├── repeated-block.ts
│   │   │   └── signal-extractor.ts
│   │   ├── fill/          # Value injectors and event simulation
│   │   │   ├── combobox-adapter.ts
│   │   │   ├── date-filler.ts
│   │   │   ├── file-filler.ts
│   │   │   ├── native-setter.ts
│   │   │   ├── radio-checkbox-filler.ts
│   │   │   └── select-filler.ts
│   │   ├── matching/      # Scoring & matching algorithms
│   │   │   ├── assignment.ts
│   │   │   ├── fuzzy.ts
│   │   │   ├── normalizer.ts
│   │   │   └── scorer.ts
│   │   └── ui/            # Highlighters and badge widgets
│   │       ├── review-highlighter.ts
│   │       └── target-mapper.ts
│   ├── options/           # Dashboard settings panel (HTML/CSS/TS)
│   │   ├── options.css
│   │   ├── options.html
│   │   ├── options.ts
│   │   ├── sections/      # Modular options panels
│   │   └── theme-loader.js
│   ├── popup/             # Action popup (HTML/CSS/TS)
│   │   ├── popup.css
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── theme-loader.js
│   ├── shared/            # Common drivers, configs, and types
│   │   ├── config/
│   │   │   └── config.ts
│   │   ├── constants/
│   │   │   ├── abbreviations.json
│   │   │   ├── constants.ts
│   │   │   └── degrees.json
│   │   ├── dictionary/
│   │   │   ├── profile-template.json
│   │   │   ├── rules.json
│   │   │   └── rules.ts
│   │   ├── messaging/
│   │   │   └── messages.ts
│   │   ├── storage/
│   │   │   ├── feedback.ts
│   │   │   ├── files-storage.ts
│   │   │   ├── learned-store.ts
│   │   │   ├── mapping-storage.ts
│   │   │   ├── profile-storage.ts
│   │   │   └── storage-client.ts
│   │   └── types/
│   │       └── index.ts
│   └── themes/            # CSS theme files
│       ├── theme-brutalist-dark.css
│       ├── theme-brutalist-light.css
│       ├── theme-dark.css
│       └── theme-light.css
├── store_assets/          # Chrome Web Store promotional assets
├── tests/                 # Unit and integration test suites
│   ├── fixtures/
│   ├── airline.test.ts
│   ├── city_state.test.ts
│   ├── decode_mhtml.test.ts
│   ├── phone_fill.test.ts
│   └── scorer.test.ts
├── .editorconfig          # Editor configuration
├── .env.example           # Environment variable template
├── .gitattributes         # Git attributes
├── .gitignore             # Git ignore rules
├── LICENSE                # MIT License
├── manifest.json          # Extension manifest (MV3)
├── package.json           # Node dependencies & scripts
├── tsconfig.json          # TypeScript configuration
└── vitest.config.ts       # Test runner configuration
```

---

## Setup & Development

### 1. Installation

Install project dependencies and build the extension:

```bash
# Clone the repository
git clone https://github.com/AhmadHassan-BTed/FormFilla.git
cd FormFilla

# Install local dependencies
npm install

# Build unpacked files
npm run build
```

### 2. Loading the Extension in Chrome

1. Navigate to `chrome://extensions/` in Google Chrome.
2. Toggle **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `dist/` directory inside this repository.

### 3. Testing

Run unit and integration tests:

```bash
npm run test
```

To run watch mode during development:

```bash
npm run test:watch
```

---

## AI-Driven Dictionary Expansion (Enhancing Performance)

FormFilla's matching engine relies entirely on externalized JSON databases rather than hardcoded logic. To scale up field matching accuracy and support custom career portals, developers and independent AI models can directly expand these 4 dictionary files. Expanding these files directly increases the coverage and intelligence of the matching solver:

1. **[rules.json](src/shared/dictionary/rules.json) (Field Selectors & Signatures):**
   Defines document guidelines, repeated blocks, and input selectors. Expanding its `exactPhrases` and `regexPatterns` allows FormFilla to map highly customized inputs.
2. **[profile-template.json](src/shared/dictionary/profile-template.json) (Profile Schema Layout):**
   Defines the export template schema. Expand this to align with new fields in `rules.json` to allow user pre-configurations.
3. **[abbreviations.json](src/shared/constants/abbreviations.json) (Acronym maps):**
   Maps common input acronyms (e.g. `emp` -> `employer`). Expanding this prevents tokenization failures on short names.
4. **[degrees.json](src/shared/constants/degrees.json) (Education Rank Matrix):**
   Compares and ranks degrees. Expand this to add local or international variations.

_Every JSON configuration contains an embedded `__meta__` prompt. You can supply these files directly to AI models to securely expand FormFilla's capacity without editing code._

---

## Installation via Chrome Web Store

FormFilla is officially distributed through the Chrome Web Store to ensure you always receive the latest, secure updates directly to your browser.

**[Install FormFilla from the Chrome Web Store](https://chromewebstore.google.com/detail/ghdmoobkedimgbgohodgmjmnldfmkcja?utm_source=item-share-cb)**

---

## Roadmap

- **Q3 2026:** Custom field selection overrides saved to local storage.
- **Q4 2026:** Platform adapters for Taleo, Workable, and Breezy HR.
- **Q1 2027:** Encrypted profile backup exports using client-side AES-GCM.

---

## Bugs & Feature Requests

We manage all feedback, bugs, and feature requests centrally to maintain a clean workflow.

If you encounter an issue or have a feature idea for FormFilla, please submit it to our central board:
**[Open the Central Issue Tracker](https://github.com/AhmadHassan-BTed/FormFilla/issues)**

---

## License

This project is licensed under the [MIT License](LICENSE).
