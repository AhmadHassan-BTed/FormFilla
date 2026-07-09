# Refactor / Clean-up Tracker

## Goal
Clean and sophisticate repo structure: move code into proper folders, split “god modules”, keep public APIs stable, and preserve build/test output.

## Constraints
- Avoid breaking import paths referenced by `src/content/index.ts`, `src/popup/*`, `src/options/*`, and `src/background/*`.
- Keep `storage-client.ts` exports stable as a façade unless imports are updated across the repo.

## Steps
- [x] Create `src/content/core/value-path.ts` by extracting `getValueByPath` + degree-ranking helpers from `src/content/core/orchestrator.ts`.

- [x] Split storage into modules under `src/shared/storage/`:
  - [x] `profile-storage.ts` (chrome.storage profile)
  - [x] `mapping-storage.ts` (learned mapping)
  - [x] `files-storage.ts` (IndexedDB ArrayBuffer blobs)
- [x] Update `src/shared/storage/storage-client.ts` to delegate to the new modules while keeping the existing exported function names.

- [ ] Extract orchestrator internals into `src/content/core/fill/`:
  - [ ] `single-field-filler.ts`
  - [ ] `choice-group-filler.ts`
- [ ] Reduce `src/content/core/orchestrator.ts` to coordinator logic only; update imports accordingly.
- [ ] Add barrel `index.ts` files only where they reduce churn (optional).
- [x] Run `npm test` and `npm run build`.

- [ ] Update documentation notes if any folder paths changed.

