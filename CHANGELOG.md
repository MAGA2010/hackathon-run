# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Cycle 3 P0 fixes: `ci.yml` workflow (unblocks releases), `scripts/release.sh` and `scripts/dogfood.sh`, ASCII `[OK]/[ERR]/[!]` log markers for Windows console compatibility, trailing newlines on `scan_repo.py` and `trigger.ts`.
- `validate` / `test` / `test:acceptance` / `test:integration` npm scripts now auto-build, so `dist/` no longer needs to be pre-generated.

### Changed

- `CODEOWNERS` disabled pending creation of `@hackathon-surgeon/*` GitHub teams; previously blocked every PR.
- `lint` script temporarily replaced with `tsc --noEmit`. ESLint v9 requires `typescript-eslint` for `.ts` parsing; install blocked in this environment by an unwritable npm cache. Track as P1.
- `test` / `test:acceptance` / `test:integration` / `dogfood` / `release` now route through `scripts/run-sh.mjs`, which auto-detects Git Bash on Windows and falls back to a clear install-or-use-WSL error message.

## [0.1.0] - 2026-08-19

### Added

- Day 1-3: Foundation - LICENSE (MIT), CHANGELOG, README, BRAND, brand identity
- Day 4-5: Repository architecture - directory structure, configs, contributing docs
- Day 6: Core skill `scope-knife` - SKILL.md, scripts, tests, state schema
- Initial CLI bootstrap (`src/cli/`)
- State JSON schemas for `plan`, `verify`, `demo`, `review`, `ship`
- Documentation site skeleton (`docs/`)
- Three example projects (`examples/web-app`, `examples/ai-ml`, `examples/mobile`)
- Cycle 2: remaining five core skills (`fast-verify`, `demo-coach`, `judge-sim`, `ship-pack`, `recovery-runbook`) with SKILL.md, scripts, references, templates, and acceptance tests; corresponding state schemas (`demo`, `verify`, `review`, `ship`, `recovery`); full 36-hour end-to-end integration test.
- CI workflows (`codeql.yml`, `docs.yml`, `release.yml`) and reusable `ci.yml`.

### Changed

- `scope-knife/scripts/scan_repo.py` now extracts real code symbols (functions / classes) instead of just directory names, and applies a stricter noise filter to markdown headings.
- `harness/trigger.ts` tie-break is now: smaller `triggerBudget` first, then alphabetical skill name (stable, predictable).
- `cli/commands/validate.ts` now uses `ajv-formats` for `date-time` / `uri` / `email` schema support.

### Removed

### Deprecated

### Fixed

- Files `scan_repo.py` and `trigger.ts` now end with a trailing newline (POSIX-compliant, no more lint warnings).
- `release.yml` no longer references a non-existent `ci.yml` workflow (one now exists at `.github/workflows/ci.yml`).
- `scripts/release.sh` and `scripts/dogfood.sh` no longer missing (npm `release` and `dogfood` scripts work).

### Security

[Unreleased]: https://github.com/MAGA2010/hackathon-run/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MAGA2010/hackathon-run/releases/tag/v0.1.0
