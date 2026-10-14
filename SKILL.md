---
name: hackathon-run
description: Decision-making and execution system for hackathon teams under time pressure. Use when the user is running a hackathon, ship-a-demo crunch, MVP cut, or any "we have N hours and need to ship" workflow - this skill surfaces the right cut at the right time, drives the team through clarify -> prize-target -> scope -> time-box -> build -> verify -> demo -> judge -> ship -> recover -> pivot -> retro -> decide-log, and persists every decision in `.hackathon/state/*.json`. Trigger phrases: "we are doing a hackathon", "time-box", "scope knife", "ship the demo", "judge my project", "demo rehearsal", "MVP cut", "fast verify", "what should I cut", and the Chinese equivalents "砍什么功能", "还剩三小时怎么排", "评委打分", "复盘", "演示挂了". Invoke via the local CLI at `D:\personal skill\dist\cli\index.js`.
metadata:
  short-description: Run the 15-skill hackathon decision workflow with auditable state
---

# Hackathon Run

> Ship the demo, not the dream.

This skill is a wrapper around the local CLI at `D:\personal skill\dist\cli\index.js` (package `@hackathon-run/hackathon-run` v1.2.4). The runtime bundles **fifteen skills** for the hackathon lifecycle and persists every decision to `.hackathon/state/` so the next agent (or the next morning) can `hackathon resume` cold and pick up exactly where work stopped.

## When to use this skill

Trigger it whenever the user says any of:

- "We are doing a hackathon" / "ship the demo" / "MVP cut".
- "time-box" / "scope knife" / "what should I cut" / "what is in scope".
- "fast verify" / "demo rehearsal" / "demo coach" / "pitch script".
- "judge my project" / "ship pack" / "submission readiness".
- "we crashed on stage" / "recovery runbook" / "pivot" / "retro".
- "log this decision" / "decision log".

If the request is not a hackathon / time-boxed build, prefer doing it directly. This skill is not a general productivity tool.

## Bundled skills (15)

| # | Skill | When to fire |
|---|---|---|
| 1 | `idea-clarify` | Vague one-paragraph brief. Force the real ask. |
| 2 | `prize-strategy` | Decide which prize to chase and shape the demo around it. |
| 3 | `scope-knife` | Force KEEP / CUT / DEFER on every feature. |
| 4 | `time-box` | Allocate the remaining hours across features. |
| 5 | `stack-picker` | Pick the boring, fast, defensible stack. |
| 6 | `fast-verify` | Verify the demo path runs end-to-end. |
| 7 | `demo-coach` | Draft a 30/60/90-second pitch script. |
| 8 | `demo-rehearsal` | Rehearse the live demo with a stopwatch. |
| 9 | `judge-sim` | Self-review 0-5 across seven judging dimensions. |
| 10 | `ship-pack` | Audit submission readiness (README, secrets, license). |
| 11 | `recovery-runbook` | 30-second fallback when the live demo breaks. |
| 12 | `pivot` | Mid-build scope change. Re-run scope-knife against the new direction. |
| 13 | `retro` | Post-hackathon retrospective. |
| 14 | `decision-log` | Append-only log of every cut / commit / pivot. |
| 15 | `team-roster` | Track who owns which feature during the crunch. |

## CLI surface

```bash
# Bootstrap a project (creates .hackathon/ in cwd)
node "D:\personal skill\dist\cli\index.js" init

# Run a single skill (with --apply to pre-fill the target state file)
node "D:\personal skill\dist\cli\index.js" run scope-knife --demo-goal "..." --time-remaining 240 --apply

# Deterministically verify the demo path (writes verify.json + evidence)
node "D:\personal skill\dist\cli\index.js" verify run

# Run a chained pipeline
node "D:\personal skill\dist\cli\index.js" flow --execute

# Inspect state, handoff brief, or trace
node "D:\personal skill\dist\cli\index.js" status
node "D:\personal skill\dist\cli\index.js" resume
node "D:\personal skill\dist\cli\index.js" trace

# Sprint workflow (default-FAIL feature contract -> evaluator handoff -> accept)
node "D:\personal skill\dist\cli\index.js" sprint new --feature Auth
node "D:\personal skill\dist\cli\index.js" sprint approve
node "D:\personal skill\dist\cli\index.js" sprint review
node "D:\personal skill\dist\cli\index.js" sprint accept

# Environment + validation
node "D:\personal skill\dist\cli\index.js" doctor
node "D:\personal skill\dist\cli\index.js" validate
node "D:\personal skill\dist\cli\index.js" validate-skill skills/<name>
node "D:\personal skill\dist\cli\index.js" match "what should I cut"

# Bundled skill catalog
node "D:\personal skill\dist\cli\index.js" list
node "D:\personal skill\dist\cli\index.js" skills pin --all

# MCP server (stdio, JSON-RPC 2.0)
node "D:\personal skill\dist\cli\index.js" mcp
```

## How to apply the skill to a Codex task

1. **Bootstrap.** Run `hackathon init` inside the project (e.g. `D:\成都项目`). This creates `.hackathon/state/*.json` and `.hackathon/skills.json`. **Never skip this** — every other command expects these files.
2. **Force the real ask.** If the user brief is fuzzy, run `idea-clarify` first. The answer becomes the input for every later skill.
3. **Choose the next cut.** For the first pass through a hackathon, the recommended order is `scope-knife` -> `time-box` -> `stack-picker` -> `fast-verify` -> `demo-coach` -> `judge-sim` -> `ship-pack`. `flow --execute` chains these.
4. **Always pass `--apply`** when running a skill, so the result is written to `.hackathon/state/` and the next agent can `resume` cold.
5. **Surface state before claiming victory.** Before declaring "done", run `hackathon status` + `hackathon trace` and read the actual state files. Never trust the model's word.
6. **Sprint workflow for code features.** `sprint new --feature X` creates a default-FAIL contract; `sprint approve` locks it; `sprint review` emits the evaluator handoff; `sprint accept` applies the verdict (passes: true with evidence, or feedback for the next iteration).
7. **When the live demo breaks** on stage, run `recovery-runbook` immediately. It produces a 30-second fallback script.
8. **Cost and time are gates.** `sprint budget --minutes 45 --max-iterations 3` before any sprint.

## Design rules (non-negotiable)

1. **Each skill is independently usable.** No forced flow. Run any skill at 2am without reading the docs first.
2. **State lives in the filesystem** (`.hackathon/state/*.json`), readable, never blocking.
3. **Trigger phrases in every description** so the agent can match intent without ambiguity.
4. **Body = execution logic only.** No backstory, no changelogs inside skill files.
5. **v1 ships a small set of skills done well**, not 100 stubs.
6. **Acceptance criteria live in the skill file** and are wired to shell tests.

## Pair with `ai-time-run`

- `hackathon-run` owns the **decisions** (scope, cut, time-box, ship readiness).
- `ai-time-run` owns the **audit trail** (every tool call / effect / evidence on an append-only ledger).
- Pair them on any non-trivial task: frame the mission with `ai-time-run`, then drive the cut/build/verify loop with `hackathon-run`. Both skills write to separate files (`ledger.jsonl` vs `.hackathon/state/*.json`) so they do not collide.

## Output expectations

- Always point at concrete state files under `.hackathon/state/`.
- Always run `hackathon status` + `hackathon resume` before handing off.
- Never declare a feature shipped without `sprint accept` recording a passing eval.
- Use `decision-log` for any cut that future-you might second-guess.

## Failure modes

- `hackathon init` not run -> `run <skill>` fails with missing-state errors. Bootstrap first.
- `npm run build` not run -> CLI throws "Cannot find module". Rebuild with `cd "D:\personal skill" && npm run build` before invoking.
- `sprint accept` without an evaluator verdict in eval.json -> silently no-ops. Always fill eval.json first.
- `flow --execute` against an empty `.hackathon/` -> degrades to defaults. Better to run skills one at a time on a real brief.
