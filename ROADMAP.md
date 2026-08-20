# Roadmap

This is the live roadmap for `@maga2010/hackathon-surgeon`. It is updated
when priorities shift; the most recent release notes are in [CHANGELOG.md](CHANGELOG.md).

## Shipped

- [x] Skill matcher v2 (bigram + phrase + action-verb scoring)
- [x] `hackathon status` / `doctor` / `flow` CLI commands
- [x] Unit-test suite via Node's built-in `node:test` runner
- [x] 13 skill detail pages + state-machine index
- [x] Real source scaffolds for the six example projects
- [x] ESLint v9 flat config wired to CI
- [x] Frontmatter parser supports YAML-style `- item` arrays
- [x] `state.ts` correctly maps `<file>.json` -> `<stem>.schema.json`
- [x] `recovery-runbook/scripts/build_recovery.py` writes `recovery.json` (v0.3.0)
- [x] `hackathon mcp` command + Windows `pathToFileURL` compat (v0.3.0)
- [x] 8 skills total after v0.3.0: idea-clarify, pivot, scope-knife, fast-verify, demo-coach, judge-sim, ship-pack, recovery-runbook
- [x] `validate-skill` regex + 5 missing body sections + verb conjugation regex (v0.3.0)
- [x] 11 skills after v0.4.0: adds time-box, stack-picker, retro
- [x] 8 MCP tools after v0.4.0: adds validate_skill, apply_skill_advice, list_examples, get_recovery_plan
- [x] 6 example projects after v0.4.0: adds data-eng, chrome-extension, devtool-cli
- [x] 98/98 unit tests passing after v0.4.0
- [x] **13 skills after v0.5.0**: adds demo-rehearsal, team-roster
- [x] **`hackathon run <skill> --apply`** with `--demo-goal` / `--team-size` / `--time-remaining` flag parsing + skeleton pre-fill via `writeState()` (v0.5.0)
- [x] **`hackathon replay`** — timeline reconstruction from `.hackathon/state/` with per-file `generated_at` ordering and `--json` output (v0.5.0)
- [x] **`hackathon skills {list,pin,diff,show}`** — `.hackathon/skills.json` catalog with name + version + sha256 checksum (v0.5.0)
- [x] **2 new JSON schemas** in v0.5.0: `rehearsal.schema.json`, `roster.schema.json`
- [x] **ADR-0006** documenting the v0.5 CLI/structural changes (v0.5.0)
- [x] **111/111 unit tests passing** after v0.5.0 (was 98 after v0.4.0)
- [x] **`hackathon report`** — post-hackathon markdown report with verdict + timeline + stage sections (v0.6.0)
- [x] **`decision-log` skill** — append-only decision record, 14th skill (v0.6.0)
- [x] **12 MCP tools** — adds replay, report, skills_pin, skills_diff (v0.6.0)
- [x] **validate-skill hardening** — docstring-safe VERSION pin check + any-flag CLI check (v0.6.0)
- [x] **118/118 unit tests passing** after v0.6.0 (was 111 after v0.5.0)
- [x] **Paraphrase-aware fallback matcher** — zero-dep synonym expansion on the no-match path (v0.7.0)
- [x] **Coverage report in CI** — `npm run test:coverage` with line/branch/function percentages (v0.7.0)
- [x] **121/121 unit tests passing** after v0.7.0 (was 118 after v0.6.0)
- [x] **LLM judge backend** — `HACKATHON_JUDGE_BACKEND` in judge-sim with heuristic fallback (v0.8.0)
- [x] **Ship webhook** — `HACKATHON_SHIP_WEBHOOK` in ship-pack, non-fatal delivery (v0.8.0)
- [x] **Validation no-op fix** — `validate` now routes through the real CLI; `judge_questions` minItems fixed (v0.8.0)
- [x] **Skill Format v2** — `version` / `category` / `tags` / `dependencies` / `side_effects` / `triggers` in YAML frontmatter, validated by `validate-skill`, surfaced by new `skills search` subcommand + `find_skills` MCP tool (v0.9.0)
- [x] **All 14 skills carry Format v2 metadata** — v0.9.0
- [x] **`.nvmrc` pinned to Node 20.9.0** — fixes CI `npm run test:coverage` step (v0.9.0)
- [x] **132/132 unit tests passing** after v0.9.0 (was 121/121)
- [x] **`hackathon skills graph`** — Mermaid / DOT / ASCII graph of skill dependencies + side effects (v1.0.0)
- [x] **Auto-derived state diagram** in `docs/skills/index.md` from Format v2 metadata (v1.0.0)
- [x] **Dependency cycle detection** in `skills graph` (v1.0.0)
- [x] **140/140 unit tests passing** after v1.0.0 (was 132/132)
- [x] **v1.0.0: public API is stable** — Format v2 is the contract; no breaking changes planned until v2.0.0
- [x] **hackathon run <skill> --chain** — follows Format v2 dependencies in topological order (v1.1.0)
- [x] **Per-skill version pin** — skills pin records each skill's own Format v2 version + a ^ diff line (v1.1.0)
- [x] **Embedding matcher backend** — HACKATHON_EMBED_BACKEND HTTP ranking with token/synonym fallback (v1.1.0)
- [x] **skill_chain MCP tool** — 14 MCP tools total (v1.1.0)
- [x] **152/152 unit tests passing** after v1.1.0 (was 140/140)
- [x] **Optional third-party manifest fields** — `license` / `author` / `homepage` / `repository` / `compatibility` (WARN-only, surfaced in `skills search` + `find_skills`) (v1.2.0)
- [x] **158/158 unit tests passing** after v1.2.0 (was 152/152)

## Now (1.2.x)

- [ ] **Re-enable GitHub Pages deployment** — `docs.yml` build step is green; the deploy step needs Pages enabled in repo settings (Source: GitHub Actions).

## Later (0.7+)

- [ ] **Typed CLI options** — replace `any` args in `run` with per-skill option specs derived from the skill's input contract section.
- [ ] **VS Code extension** that surfaces the `hackathon status` lifecycle in the status bar.
- [ ] **Discord / Slack webhook** that posts `ship-pack` results to a team channel.
- [ ] **Typed LLM judge protocol** — document a stricter request/response schema for `HACKATHON_JUDGE_BACKEND` providers and add an example adapter.

## Won't do (out of scope)

(out of scope)

- A web UI for the pack — the CLI + docs site is enough.
- Bundling a model or running one locally — out of scope; teams wire their own.
- Editor plugins for non-VS-Code editors — community contributions welcome but not maintained here.

## How to propose a change

Open an issue with the `roadmap` label. PRs that touch anything above
should reference the corresponding bullet in the PR description.
