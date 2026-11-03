# FormFilla Roadmap

## Current Release (v0.1.0)

- **Manifest V3** extension scaffold with esbuild bundling
- **DOM scanning** — recursive field detection across same-origin iframes
- **Repeated block detection** — structural fingerprinting for education, experience, and references
- **Multi-signal scoring** — autocomplete tokens, exact phrases, regex patterns, fuzzy similarity (Dice + Jaro-Winkler)
- **Hungarian algorithm** — globally optimal field-to-key assignment
- **Framework-safe DOM writing** — native setter bypass + bubbling events for React/Vue/Angular
- **Sensitivity gating** — standard, sensitive (opt-in), and critical (needs-confirm) tiers
- **File injection** — synthetic DataTransfer for resume/CV/cover letter/photo uploads
- **Options dashboard** — profile editor with file pickers, JSON import/export
- **Popup controller** — one-click fill trigger with result summary
- **Review overlay** — color-coded field highlighting (green/amber/gray/golden badge)
- **GitHub support verification** — star/follow gating with daily re-verification
- **4 theme variants** — light, dark, brutalist-light, brutalist-dark
- **Platform adapters** — Workday, Greenhouse, Lever
- **Test harness** — Vitest + JSDOM with fixture-based scoring tests

## Upcoming

### Q3 2026
- Custom field selection overrides saved to local storage
- User-defined field mapping overrides per domain
- Improved combobox detection for custom ATS widgets

### Q4 2026
- Platform adapters for Taleo, Workable, and Breezy HR
- Performance optimizations for large forms (100+ fields)
- Accessibility improvements for overlay interactions

### Q1 2027
- Encrypted profile backup exports using client-side AES-GCM
- Multi-language field matching (non-English form support)
- Profile sharing via encrypted export/import

## Future Considerations

- Firefox Manifest V3 compatibility
- Edge/Chrome/Brave/Opera store distribution
- Community-contributed dictionary expansions
- Optional telemetry (opt-in, anonymized, privacy-first)