# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-08-19

### Added

- **Two new skills** (the pack now ships 8):
  - `idea-clarify` — pre-`scope-knife` step that turns a one-paragraph brief into a one-page brief with a concrete `demo_goal` and `mvp_axis`. Refuses vague answers.
  - `pivot` — mid-build redirect. Reads the 5 state files, computes a preserve/cut/rewrite table, refuses to run if at least 1 KEEP feature does not survive (otherwise it is a rewrite, not a pivot).
- **CLI: `hackathon new-skill <name>`** — scaffolds a new skill folder with the right frontmatter, section headings, kebab-case validation, optional `scripts/<name>.py` + `tests/`, and `--force` to overwrite.
- **CLI: `hackathon validate-skill <dir>`** — lints a `SKILL.md` against the 8-rule protocol (frontmatter, folder-name match, trigger budget, action-verb lead, required body sections, `Do not invoke` clause on `when_to_use`, script shebang + `--repo-root` + `VERSION` pin, state-file-vs-schema pairing). Returns 0 on pass, 1 on any error.
- **CLI: `hackathon diff <a> <b>`** — object-aware JSON diff between two state files or two `.hackathon/state/` directories. Stable-key array matching (matches by `name` or `id` if present, else by index). Supports `--stat` and `--json`.
- **CLI: `hackathon mcp`** — start the Model Context Protocol server on stdio (JSON-RPC 2.0). Exposes 4 tools: `list_skills`, `get_skill`, `match_skill`, `status`. Compatible with Codex, Claude Code, and Cursor.
- **GitHub Action: `MAGA2010/hackathon-run/.github/action@main`** — composite action wrapping the CLI for CI. Subcommands: `validate-skills`, `validate-state`, `list`, `status`, `match`, `new-skill`.
- **MCP server** (`src/mcp/server.ts`) — minimal JSON-RPC 2.0 stdio server. No third-party SDK; the harness is the value, the MCP wrapper is a thin transport. Verified via 4 new unit tests.
- **`recovery-runbook/scripts/build_recovery.py`** — completes the recovery loop (was the missing piece: `recovery-runbook/SKILL.md` describes the runbook, this script actually writes it). CI skill-protocol lint enforces shebang + `--repo-root` + `VERSION = "1.0"` for every `scripts/*.py`.
- **ADR-0004: Skills are extensible via CLI + JSON Schema pairing** — documents the new-skill + validate-skill + schema-pairing pattern. Updated `docs/architecture/adr/index.md` accordingly.
- **Skill detail pages for `idea-clarify` and `pivot`** in `docs/skills/`, with mkdocs nav entries.
- **23 new unit tests** (frontmatter, trigger, state, status, flow, validate-skill, new-skill, diff, mcp). Total: 69/69 passing.
- **`scripts/scaffold-skills.mjs`** — convenience script that scaffolds both `idea-clarify` and `pivot` in one shot. Used during the v0.3.0 build; safe to re-run.

### Changed

- `CONTRIBUTING.md` expanded with the "Add a new skill" walkthrough (4 steps: scaffold → fill in → add schema → `validate-skill`).
- Skill matcher scoring now exposes a `reasons` array per candidate, so `--debug` output explains _why_ a skill won.
- `docs/skills/index.md` state-machine diagram now shows the 8 skills and the `idea-clarify` + `pivot` pre/post stages.
- README "Six skills" / "v1 ships 6 skills done well" lines updated to reflect 8 skills.

### Fixed

- `validate-skill` regex for the `Do not invoke` clause was using `\\s+` (literal backslash + s) instead of `\s+` (whitespace class). This made the check fail for `when_to_use` values that wrapped "do not invoke" across a line break, producing a spurious warning on `pivot` and any future skill that wraps the clause. Replaced with the correct whitespace-class regex; verified 0 warnings on `pivot`, `idea-clarify`, and `scope-knife`.

## [0.2.0] - 2026-08-19

### Added

- New CLI commands:
  - `hackathon status` — read all 5 state files and print lifecycle stage (empty → scoping → verifying → demoing → judging → shipping → complete) with per-file age + highlights + next-step suggestion. Supports `--json` and `-C <dir>`.
  - `hackathon doctor` — environment + state-file health check. Validates every state file against its Ajv schema, checks every skill parses + stays under the 1536-char trigger budget, confirms node ≥ 20 / python3 / git on PATH. Returns 0 on warn, 1 on fail.
  - `hackathon flow` — guided end-to-end pipeline planner that shows which of the 5 stages are done, prints the exact `python3` commands the agent (or user) should run next, and optionally `--execute`s them via `sh -c`.
- `hackathon match` upgrades: `--debug` prints per-candidate score reasons; `--json` emits machine-readable output; `-C <dir>` loads skills from a custom directory.
- Unit-test suite via Node 20's built-in `node:test` runner (no new npm dependencies). 46 tests covering frontmatter parser, trigger matcher, Ajv-validated state read/write, status lifecycle, and flow planning.
  - `npm run test:unit` script + new `Unit tests` step in CI.
- Documentation: 6 skill detail pages (`docs/skills/*.md`) covering inputs, outputs, worked example, trigger phrases, acceptance criteria, and failure modes. Plus `docs/skills/index.md` with a state-machine diagram.
- Example projects now ship with real source scaffolds:
  - `examples/web-app`: Next.js SaaS shell — auth, notes CRUD with 3-second sync, Stripe webhook, minimal dev server, cross-platform smoke test (verified locally: all 5 demo steps pass).
  - `examples/ai-ml`: Python text classifier (question / command / statement) with stdlib-only fallback + eval.json artifact for fast-verify.
  - `examples/mobile`: React Native ApiClient + Login/Notes screens, `node --check` smoke test.
- ESLint v9 flat config (`eslint.config.js`) using only `@eslint/js` — zero new npm dependencies. Scope: `scripts/` and `examples/web-app/scripts/`. New `npm run lint:eslint` script + CI step.

### Changed

- Skill matcher rewritten with layered scoring: 5-pt exact-phrase bonus, 2-pt first-word (action verb) bonus, bigram overlap (+2 per shared bigram), unigram overlap. Per-candidate `reasons` now exposed so the CLI can show _why_ a skill won.
- `src/harness/state.ts`: `defaultSchemaPath()` now correctly maps `plan.json` → `plan.schema.json` (was a latent bug — the file path resolved to `plan.json` because the schema suffix was being dropped on the floor). `writeState` / `readState` now expose the helper for reuse in tests.
- `src/harness/frontmatter.ts`: parser now supports YAML-style `- item` array values for `paths` / `allowed_tools` (previously only inline `[...]` JSON-ish arrays worked).

### Fixed

- 4 acceptance test scripts no longer call the broken `cygpath` fallback on Linux CI (was producing mixed `/tmp/abc\\repo\\...` paths).
- CI test job now installs python3 via `setup-python@v5` so the python-smoke job + acceptance scripts can run.
- `hackathon doctor` correctly resolves `git` on PATH after a fresh build (was a PowerShell `cmd.exe /c` PATH-cache quirk — verified fixed).

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

### Fixed

- Files `scan_repo.py` and `trigger.ts` now end with a trailing newline (POSIX-compliant, no more lint warnings).
- `release.yml` no longer references a non-existent `ci.yml` workflow (one now exists at `.github/workflows/ci.yml`).
- `scripts/release.sh` and `scripts/dogfood.sh` no longer missing (npm `release` and `dogfood` scripts work).
