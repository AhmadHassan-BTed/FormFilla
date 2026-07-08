# Contributing to FormFilla

Thank you for taking the time to contribute. Contributions make the open-source community an amazing place to learn, inspire, and create.

This guide outlines the development workflow and standards.

## Code of Conduct

By participating in this project, agreement to abide by the [Code of Conduct](CODE_OF_CONDUCT.md) is expected.

## Getting Started

### Prerequisites

* Node.js (v18 or higher)
* Git
* Google Chrome or any Chromium-based browser (for extension debugging)

### Local Environment Setup

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/FormFilla.git
   cd FormFilla
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy the environment template and set up overrides:
   ```bash
   cp .env.example .env
   ```
5. Compile the extension:
   ```bash
   npm run build
   ```

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** in the top-left.
4. Select the `dist/` directory inside the cloned repository.

---

## Coding Standards

* **TypeScript:** Write clean, strictly-typed code. Avoid type castings like `any` unless interacting directly with unstable browser APIs.
* **Separation of Concerns:** Business matching logic must reside inside `src/content/matching/` and remain 100% decoupled from DOM manipulations.
* **Coding Conventions:** Emojis are strictly banned in source files. Keep comments brief and focus on code self-documentation.

## Pull Request Guidelines

1. Create a branch for the changes:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```
2. Write unit tests for any new score logic or selectors inside `tests/scorer.test.ts`.
3. Verify that all tests pass:
   ```bash
   npm run test
   ```
4. Format and lint the code:
   ```bash
   npm run build
   ```
5. Commit the changes using descriptive commit messages.
6. Push to the branch and open a Pull Request against the `main` branch.

---

## Contributing to JSON Databases (Expandable Configurations)

To scale up FormFilla's parser and matching accuracy, contributions can be made directly to the **4 JSON Configuration Databases** without modifying TypeScript source code:

1. **`src/shared/dictionary/rules.json`:** Expand input exact phrases, regex patterns, or repeated block signatures.
2. **`src/shared/dictionary/profile-template.json`:** Add new default parameters matching the profile schema.
3. **`src/shared/constants/abbreviations.json`:** Add acronym expansions.
4. **`src/shared/constants/degrees.json`:** Add international degree ranks.

*Each file includes a `"__meta__"` key outlining developer prompt instructions. You can load these files directly into advanced AI models to expand and validate matching scopes securely.*