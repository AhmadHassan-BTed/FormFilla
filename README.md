<p align="center">
  <img src="docs/assets//small_promo_tile_hd.png" alt="FormFilla promo tile" style="width:100%;max-width:440px;height:auto;" />

<h1 align="center">FormFilla</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-grey?labelColor=black" alt="License"></a>
  <a href="https://github.com/AhmadHassan-BTed/FormFilla/actions"><img src="https://img.shields.io/github/actions/workflow/status/AhmadHassan-BTed/FormFilla/ci.yml?branch=main&label=Build&labelColor=black&color=grey" alt="CI Status"></a>
  <a href="docs/CHANGELOG.md"><img src="https://img.shields.io/badge/Version-0.1.0-grey?labelColor=black" alt="Version"></a>
  <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/Language-TypeScript-grey?labelColor=black" alt="TypeScript"></a>
  <img src="https://img.shields.io/badge/Engine-Zero--AI-grey?labelColor=black" alt="Zero AI" />
  <img src="https://img.shields.io/badge/Logic-Kuhn--Munkres-grey?labelColor=black" alt="Kuhn-Munkres" />
  <img src="https://img.shields.io/badge/Architecture-Local--First-grey?labelColor=black" alt="Local First" />
  <img src="https://img.shields.io/badge/Privacy-100%25-grey?labelColor=black" alt="Privacy" />
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
FormFilla/
├── .github/               # CI/CD Workflows & Templates
├── docs/                  # Documentation (guides, changelog, roadmap, etc.)
│   ├── assets/            # Documentation images and previews
│   └── infra/             # Infrastructure documentation
├── infra/                 # Infrastructure & deployment configs
│   └── docker/            # Docker Compose & Dockerfile
├── scripts/               # Build & utility scripts
│   ├── build.js           # esbuild bundler configuration
│   └── generate-icons.ps1 # Icon generation script
├── src/
│   ├── assets/            # Static assets (logos, SVGs)
│   ├── background/        # Service Worker bootstrapping
│   ├── content/           # Core runtime engine
│   │   ├── adapters/      # Site-specific platform adapters (Workday, Lever)
│   │   ├── core/          # Orchestrator and logic bootstrappers
│   │   ├── dom/           # DOM traversal and observers
│   │   ├── fill/          # Value injectors and event simulation
│   │   ├── matching/      # Scoring & matching algorithms
│   │   ├── overlay/       # Overlay UI components
│   │   └── ui/            # Highlighters and badge widgets
│   ├── options/           # Dashboard settings panel (HTML/CSS/TS)
│   ├── popup/             # Action panel (HTML/CSS/TS)
│   ├── shared/            # Common drivers, configs, and types
│   └── themes/            # CSS theme files
├── icons/                 # Extension icons (16, 32, 48, 128)
├── store_assets/          # Chrome Web Store promotional assets
├── tests/                 # JSDOM unit test runner suites
├── .editorconfig          # Editor configuration
├── .env.example           # Environment variable template
├── .gitattributes         # Git attributes
├── .gitignore             # Git ignore rules
├── LICENSE                # MIT License
├── manifest.json          # Extension manifest
├── package.json           # Node dependencies & scripts
├── tsconfig.json          # TypeScript configuration
└── vitest.config.ts       # Test runner configuration
```

---

## AI-Driven Dictionary Expansion (Enhancing Performance)

FormFilla's matching engine relies entirely on externalized JSON databases rather than hardcoded logic. To scale up field matching accuracy and support custom career portals, developers and independent AI models can directly expand these 4 dictionary files. Expanding these files directly increases the coverage and intelligence of the matching solver:

1. **[rules.json](file:///p:/JobApplier/src/shared/dictionary/rules.json) (Field Selectors & Signatures):**
   Defines document guidelines, repeated blocks, and input selectors. Expanding its `exactPhrases` and `regexPatterns` allows FormFilla to map highly customized inputs.
2. **[profile-template.json](file:///p:/JobApplier/src/shared/dictionary/profile-template.json) (Profile Schema Layout):**
   Defines the export template schema. Expand this to align with new fields in `rules.json` to allow user pre-configurations.
3. **[abbreviations.json](file:///p:/JobApplier/src/shared/constants/abbreviations.json) (Acronym maps):**
   Maps common input acronyms (e.g. `emp` -> `employer`). Expanding this prevents tokenization failures on short names.
4. **[degrees.json](file:///p:/JobApplier/src/shared/constants/degrees.json) (Education Rank Matrix):**
   Compares and ranks degrees. Expand this to add local or international variations.

*Every JSON configuration contains an embedded `__meta__` prompt. You can supply these files directly to AI models to securely expand FormFilla's capacity without editing code.*


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
<summary>Click to expand environment configurations</summary>

| Parameter              | Type      | Default | Description                                                                                    |
| :--------------------- | :-------- | :------ | :--------------------------------------------------------------------------------------------- |
| `DEBUG_MODE`           | `boolean` | `false` | Enables detailed logging in the browser console.                                               |
| `MOCK_STORAGE`         | `boolean` | `false` | Uses an in-memory database mock for testing.                                                   |
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
docker compose -f infra/docker/docker-compose.yml up --build
```

---

## Roadmap

* **Q3 2026:** Custom field selection overrides saved to local storage.
* **Q4 2026:** Platform adapters for Taleo, Workable, and Breezy HR.
* **Q1 2027:** Encrypted profile backup exports using client-side AES-GCM.

---

## License & Support

This project is open-source and licensed under the [MIT License](LICENSE).

For bug reports or support inquiries, open an issue in this repository or contact the author, **AhmadHassan-BTed**, at **ahmadhassan.bted@gmail.com**. Refer to the [Security Policy](docs/SECURITY.md) for vulnerability reporting.
