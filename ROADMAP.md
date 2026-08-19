# Roadmap

This is the live roadmap for `@maga2010/hackathon-surgeon`. It is updated
when priorities shift; the most recent release notes are in [CHANGELOG.md](CHANGELOG.md).

## Shipped

- [x] Skill matcher v2 (bigram + phrase + action-verb scoring)
- [x] `hackathon status` / `doctor` / `flow` CLI commands
- [x] Unit-test suite via Node's built-in `node:test` runner
- [x] 9 skill detail pages + state-machine index
- [x] Real source scaffolds for the three example projects
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

## Now (0.4.x)

- [ ] **Embedding-based fallback matcher** — when token-based score = 0, fall back to a small embedding model (configurable; opt-in). Required because the current matcher fails on paraphrased trigger phrases.
- [ ] **`hackathon replay`** — given a `plan.json` + `verify.json` + `review.json` + `ship.json` quartet, replay what the team did at each stage (good for post-mortems; pairs with the new `retro` skill).
- [ ] **`hackathon run` argument parsing** — currently `hackathon run <skill>` just dumps the SKILL.md. Pass `--demo-goal="..."` style options to the SKILL.md body and pre-fill the state file with the user's args.
- [ ] **Codecov + coverage report** in CI once the unit-test suite stabilizes.
- [ ] **GitHub Pages deployment** of `site/` is already wired (`docs.yml`) but currently builds against `main` without a release tag. Tag-triggered builds are tracked separately.

## Later (0.5+)

- [ ] **Skill marketplace format** — a JSON catalog at `.hackathon/skills.json` listing every skill with version + checksum, so teams can pin a known set.
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
