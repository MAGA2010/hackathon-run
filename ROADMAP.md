# Roadmap

This is the live roadmap for `@maga2010/hackathon-surgeon`. It is updated
when priorities shift; the most recent release notes are in [CHANGELOG.md](CHANGELOG.md).

## Now (0.2.x)

- [x] Skill matcher v2 (bigram + phrase + action-verb scoring)
- [x] `hackathon status` / `doctor` / `flow` CLI commands
- [x] Unit-test suite via Node's built-in `node:test` runner
- [x] 6 skill detail pages + state-machine index
- [x] Real source scaffolds for the three example projects
- [x] ESLint v9 flat config wired to CI
- [x] Frontmatter parser supports YAML-style `- item` arrays
- [x] `state.ts` correctly maps `<file>.json` → `<stem>.schema.json`

## Next (0.3.x)

- [ ] **Embedding-based fallback matcher** — when token-based score = 0, fall back to a small embedding model (configurable; opt-in). Required because the current matcher fails on paraphrased trigger phrases.
- [ ] **`recovery-runbook` → `recovery.json` round-trip** — the schema exists but no script writes to it yet. Add `scripts/fallback.py` writer + acceptance test.
- [ ] **Node fallback for python scripts** — when python3 is missing, the 5 stage commands in `hackathon flow --execute` should print a clear error AND attempt a minimal Node port of `scan_repo.py` / `classify.py` so the first two stages can complete on a pure Node box.
- [ ] **`hackathon run` argument parsing** — currently `hackathon run <skill>` just dumps the SKILL.md. Pass `--demo-goal="..."` style options to the SKILL.md body and pre-fill the state file with the user's args.
- [ ] **Codecov + coverage report** in CI once the unit-test suite stabilizes.
- [ ] **GitHub Pages deployment** of `site/` is already wired (`docs.yml`) but currently builds against `main` without a release tag. Tag-triggered builds are tracked separately.

## Later (0.4+)

- [ ] **Skill marketplace format** — a JSON catalog at `.hackathon/skills.json` listing every skill with version + checksum, so teams can pin a known set.
- [ ] **Typed CLI options** — replace `any` args in `run` with per-skill option specs derived from the skill's input contract section.
- [ ] **`hackathon replay`** — given a `plan.json` + `verify.json` + `review.json` + `ship.json` quartet, replay what the team did at each stage (good for post-mortems).
- [ ] **VS Code extension** that surfaces the `hackathon status` lifecycle in the status bar.
- [ ] **Discord / Slack webhook** that posts `ship-pack` results to a team channel.
- [ ] **LLM grader integration** for `judge-sim` — currently heuristic; teams that want a real LLM judge should be able to plug one in via a `HACKATHON_JUDGE_BACKEND=http://...` env var.

## Won't do (out of scope)

- A web UI for the pack — the CLI + docs site is enough.
- Bundling a model or running one locally — out of scope; teams wire their own.
- Editor plugins for non-VS-Code editors — community contributions welcome but not maintained here.

## How to propose a change

Open an issue with the `roadmap` label. PRs that touch anything above
should reference the corresponding bullet in the PR description.
