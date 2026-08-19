# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2026-08-19

### Added

- **Paraphrase-aware fallback matcher** — when the token matcher scores 0, `matchSkill` now expands the utterance with a hackathon-domain synonym map (scope, verify, demo, team, retro, stack, decision, recovery, ship, judge, clarify, time) and re-scores. Gibberish still returns no match. This closes the "current matcher fails on paraphrased trigger phrases" gap without adding an embedding dependency.
- **Coverage report** — `npm run test:coverage` runs the unit suite with Node's `--experimental-test-coverage` and prints line/branch/function percentages. Wired into CI as a separate step.
- **3 new matcher tests** for synonym rescue, paraphrase mapping, and gibberish fallthrough.

### Changed

- `MatchResult` gains an optional `fallback: true` flag; the rescued candidate's reasons include `synonym expansion`.
- CI now runs the coverage step after unit tests.

### Compatibility

- No breaking changes. The fallback only activates on the previously no-match path.

## [0.6.0] - 2026-08-19

### Added

- **`hackathon report`** — a new command that turns `.hackathon/state/` into a post-hackathon markdown report: demo goal, computed verdict (SHIP READY / NEEDS WORK / BLOCKED ON SECRETS / UNVERIFIED), team roster, scope summary, a chronological timeline, and stage-by-stage sections. `--out <file>` writes a file; `--json` emits the machine payload. Reuses `replay`'s timeline collector.
- **`decision-log` skill (the pack now ships 14)** — an append-only record of every KEEP/CUT/DEFER/PIVOT decision at `.hackathon/state/decision-log.json` (schema `decision-log.schema.json`), a Python script (`skills/decision-log/scripts/log_decision.py`), and a human-readable transcript. Pairs: scope-knife decides, decision-log records, retro learns.
- **Four new MCP tools** (8 → 12): `replay`, `report`, `skills_pin`, `skills_diff`. Agents can now run the whole loop (match → run → replay → report) over stdio.
- **ADR-0007** documenting the v0.6 report + decision-log + MCP closure + validation hardening decisions.
- **7 new unit tests** (3 for `report`, 2 for the decision-log skill, 2 for the hardened VERSION check). Total: 118/118 passing.
- **`tests/acceptance/test_decision_log.sh`** covering the decision-log acceptance criteria.

### Changed

- **`validate-skill` hardening** — the `VERSION` pin check now strips the leading module docstring before matching, so a version typed as prose inside a docstring no longer passes. The CLI-argument check accepts any declared `--flag`.
- **`classify.py` bug fix** — `VERSION = "1.0"` moved out of the module docstring to real module scope (it was previously inside the docstring, so the constant did not exist at runtime; the old check false-positived).
- **CLI consistency** — `hackathon run` and `hackathon list` gained `-C/--cwd`; `list` now reports the scripts column truthfully instead of hardcoding "yes".
- **README.md** — fixed a corrupted fenced code block (a paste artifact with a backspace byte) and refreshed the skills table / tagline to 14 skills.

### Compatibility

- No breaking changes. New state file `decision-log.json` is additive; existing `.hackathon/state/` files keep working.

## [0.5.0] - 2026-08-19

### Added

- **Two new skills** (the pack now ships 13):
  - `demo-rehearsal` — runs the team through a timed mock demo with a stopwatch, scores each segment for over/under-time, and emits a per-segment fix list. Use in the final 2 hours before the live demo. Pairs with demo-coach (one drafts the script, the other times the run).
  - `team-roster` — assigns each teammate a role + current task + blocker status, then surfaces the critical-path bottleneck. Use at the start of the build phase and any time the team feels stuck. Pairs with scope-knife (without a plan there is nothing to assign).
- **Three new CLI commands** (`hackathon run --apply`, `hackathon replay`, `hackathon skills`):
  - `hackathon run <skill> --apply` — parses 5 flags (`--demo-goal`, `--team-size`, `--time-remaining`, `--apply`, `--no-banner`) and pre-fills the skill's target state file via the schema-validated `writeState()` helper. Unknown flags now fail loudly instead of being silently accepted.
  - `hackathon replay` — reconstructs the team's timeline from `.hackathon/state/`. Each file's `generated_at` (or `started_at` for verify.json) is used for chronological ordering; output is human-readable by default, `--json` for machines. Pairs with retro.
  - `hackathon skills {list,pin,diff,show}` — manages a per-team `.hackathon/skills.json` catalog. `pin` writes name + version + sha256 checksum; `diff` shows what changed since the pin; `show` prints the current pin. Useful for CI reproducibility.
- **Two new JSON schemas** under `src/state/schemas/`:
  - `rehearsal.schema.json` (per-step timings + scores + fix list)
  - `roster.schema.json` (role assignments + bottleneck detection)
- **ADR-0006: v0.5 — run-time argument parsing + replay + skills.json catalog + 2 new skills**. Documents the four CLI/structural changes and the two new skills. Updated `docs/architecture/adr/index.md`.
- **Skill detail pages for `demo-rehearsal` and `team-roster`** in `docs/skills/`, with mkdocs nav entries.
- **3 new docs pages + index updates** (skills/index.md, mkdocs.yml, state-schemas.md).
- **13 new unit tests** (7 new `run --apply` tests covering flag parsing + skeleton building + state validation, 6 new `replay`/`skills` tests covering timeline reconstruction + catalog management). Total: 111/111 passing.

### Changed

- **`hackathon run`** — unknown flags now fail loudly (`error: unknown option '--foo'`) instead of being silently accepted via `allowUnknownOption(true)`. The target state file is inferred by taking the **last** `state/<x>.json` reference in the SKILL.md body.
- **`validate-skill`** action-verb regex gained `assign|rehearse` so the two new skills' descriptions pass the validator.

### Fixed

- **`skills/scope-knife/scripts/classify.py`** — `VERSION` was only set inside a dict literal; now pinned as a module-level constant `VERSION = "1.0"` at the top of the file. The validate-skill "script lacks VERSION pin" warning now correctly reports zero findings for scope-knife.

## [0.4.0] - 2026-08-19

### Added

- **Three new skills** (the pack now ships 11):
  - `time-box` — allocates the remaining clock to each pipeline stage (build/verify/demo/ship) and emits per-stage checkpoints with alarms. Pairs with scope-knife: one says _what_, the other says _when_.
  - `stack-picker` — recommends a tech stack from `team_skills`, `time_remaining_minutes`, `demo_format`, and `prize_category`. Outputs a 30-minute bootstrap walkthrough. Pairs with idea-clarify.
  - `retro` — post-event retrospective. Computes four ratios (scope_accuracy, time_accuracy, verify_pass_rate, judge_score_avg) and emits a three-bucket action list (keep_doing / stop_doing / try_next_time). Closes the lifecycle loop.
- **MCP server now exposes 8 tools** (was 4):
  - `validate_skill` — lint a skill directory against the protocol (captures stdout, returns findings as structured JSON)
  - `apply_skill_advice` — write a skill's structured output to a state file (supports deep-merge or replace)
  - `list_examples` — enumerate bundled example projects with stack + stage detection
  - `get_recovery_plan` — return the 30-second fallback script + decision tree for a failing demo path
- **Three new example projects** under `examples/` (now 6 total):
  - `data-eng` — Python stdlib ETL (CSV -> TSV)
  - `chrome-extension` — Manifest V3 TODO highlighter
  - `devtool-cli` — Node ESM CLI tool
- **Three new JSON schemas** under `src/state/schemas/`:
  - `time-box.schema.json`, `stack.schema.json`, `retro.schema.json`
- **ADR-0005: v0.4 skill roster expansion** — documents the time-box/stack-picker/retro additions and the MCP surface growth. Updated `docs/architecture/adr/index.md`.
- **Skill detail pages for `time-box`, `stack-picker`, and `retro`** in `docs/skills/`, with mkdocs nav entries.
- **3 new docs pages + index updates** (skills/index.md, mkdocs.yml, state-schemas.md).
- **29 new unit tests** (6 new MCP tests, 12 new skill/schema tests, 11 new example tests). Total: 98/98 passing.

### Changed

- **MCP server `serverInfo.version`** now reads from `package.json` at startup instead of being hardcoded to `0.2.0`. The reported version matches the package version at all times.
- **`validate-skill` action-verb regex** gained `allocate|retro|retrospect|bootstrap` so the new skills' descriptions pass the validator.
- **`.prettierignore`** is now recursive (`**/.hackathon/state/*.json`, `**/.hackathon/artifacts/**`) so example state files don't trigger format warnings.
- **`eslint.config.js`** now covers `examples/**/src/**/*.mjs` and `examples/chrome-extension/src/**/*.js` with appropriate Node + browser globals. CI lint:eslint script now runs `eslint .` (was: a narrow `scripts/` subset).

### Fixed

- **MCP server version hardcoded to `0.2.0`** despite package.json being `0.3.0`. Now reads package.json at startup.

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
