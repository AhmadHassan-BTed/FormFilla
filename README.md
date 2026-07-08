# JobApplier

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Continuous Integration](https://github.com/AhmadHassan-BTed/JobApplier/actions/workflows/ci.yml/badge.svg)](https://github.com/AhmadHassan-BTed/JobApplier/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/Version-0.1.0-purple.svg)](CHANGELOG.md)

JobApplier is a local-first, privacy-respecting browser extension designed to fill job application forms using your local JSON profile data and documents. By operating entirely within your browser sandbox, it performs all analysis and autofilling local-first, executing no AI API calls, zero network calls, and ensuring no data leakage.

---

## Technical Highlights

* **Kuhn-Munkres (Hungarian) Resolver:** Models form filling as a Maximum Weight Bipartite Matching problem to globally resolve field assignments.
* **Fuzzy Signal Scorer:** Uses custom implementations of Jaro-Winkler distance and Dice's Coefficient to evaluate element attributes (labels, placeholders, names, IDs).
* **Framework-Safe Injector:** Bypasses virtual DOM frameworks (React, Angular, Vue) by invoking native prototype setters and dispatching bubbling change events.
* **Sibling Fingerprinting:** Group sibling containers into repeated blocks to index entries (Work Experience #1, Education #2) before scoring.
* **Drag-and-Drop Mocking:** Simulates synthetic `DataTransfer` file drops to bypass strict HTML5 file input constraints.
* **Isolated Security Boundaries:** Critical items (e.g. SSNs, National IDs) require manual confirmation buttons.

---

## Directory Architecture

```
JobApplier/
├── .github/               # Automated GitHub CI/CD Actions and Templates
├── docs/                  # Detailed Architectural & Security guides
├── src/
│   ├── background/        # Extension background service worker
│   ├── content/           # Content script matching and filling logic
│   │   ├── adapters/      # Site-specific platform adapters
│   │   ├── core/          # Main execution orchestrator
│   │   ├── dom/           # Element scanners and observation observers
│   │   ├── fill/          # Value injectors and input simulators
│   │   ├── ui/            # Highlighters and badge overlays
│   ├── options/           # Profile settings dashboard (HTML/CSS/TS)
│   ├── popup/             # Popup UI panel (HTML/CSS/TS)
│   └── shared/            # Core business logic, types, and persistence
│       ├── config/        # Environment config manager
│       ├── constants/     # Metric scores, rankings, abbreviations
│       ├── dictionary/    # Signal rules and signatures
│       ├── messaging/     # Messaging type interfaces
│       ├── storage/       # Local-first persistence wrapper
│       └── types/         # Core TypeScript declarations
├── tests/                 # Vitest test runner suites and mock scripts
├── build.js               # esbuild build bundler configuration
└── vitest.config.ts       # Test harness configuration
```

---

## Getting Started

### Prerequisites

* Node.js (v18 or higher)
* NPM

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/AhmadHassan-BTed/JobApplier.git
   cd JobApplier
   ```
2. Install local packages:
   ```bash
   npm install
   ```
3. Set up the local environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Build the extension:
   ```bash
   npm run build
   ```

### Loading in Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `dist/` folder inside your project directory.

---

## Testing & Quality

We run Vitest under a sandboxed JSDOM container to verify matching scoring pipelines.

* **Execute test suite:**
  ```bash
  npm run test
  ```
* **Verify Types Compiler:**
  ```bash
  npx tsc --noEmit
  ```

---

## DevOps & Docker Support

A Docker configuration is available to compile and test the extension within a standardized container environment.

* **Build and execute tests in Docker:**
  ```bash
  docker-compose up --build
  ```

---

## Contributing

We welcome contributions! Please review our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before opening pull requests.

## Security

Please report vulnerabilities privately by emailing us at **ahmadhassan.bted@gmail.com**. Refer to our [Security Policy](SECURITY.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
