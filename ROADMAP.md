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

## Now (0.7.x)

- [ ] **Embedding-based backend** — optional pluggable semantic backend behind `HACKATHON_EMBED_BACKEND` for teams that want real vector similarity; the zero-dep synonym fallback remains the default.
- [ ] **Re-enable GitHub Pages deployment** — `docs.yml` build step is green; the deploy step needs Pages enabled in repo settings (Source: GitHub Actions).

## Later (0.7+)

- [ ] **Typed CLI options** — replace `any` args in `run` with per-skill option specs derived from the skill's input contract section.
- [ ] **VS Code extension** that surfaces the `hackathon status` lifecycle in the status bar.
- [ ] **Discord / Slack webhook** that posts `ship-pack` results to a team channel.
- [ ] **LLM grader integration** for `judge-sim` — currently heuristic; teams that want a real LLM judge should be able to plug one in via a `HACKATHON_JUDGE_BACKEND=http://...` env var.

## Won't do (out of scope)

(out of scope)

- A web UI for the pack — the CLI + docs site is enough.
- Bundling a model or running one locally — out of scope; teams wire their own.
- Editor plugins for non-VS-Code editors — community contributions welcome but not maintained here.

## How to propose a change

Open an issue with the `roadmap` label. PRs that touch anything above
should reference the corresponding bullet in the PR description.
