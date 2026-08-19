---
id: adr-0005
title: v0.4 skill roster expansion — time-box, stack-picker, retro + MCP surface growth
status: accepted
date: 2026-08-19
---

## Context

By v0.3.0 the pack had 8 skills covering the core lifecycle (idea-clarify,
scope-knife, fast-verify, demo-coach, judge-sim, ship-pack) plus two
safety nets (pivot, recovery-runbook). Real hackathon teams surfaced
three gaps:

- **The clock is its own problem.** scope-knife decides _what_ to build,
  but nothing decided _when_. Teams without a clock management plan would
  burn the last 2 hours on polish that judges don't see.
- **The cold-start problem.** When the team has no shared stack
  preference, the first hour is spent debating instead of building. No
  skill helped pick a stack from team skills + time + prize category.
- **The post-event problem.** Teams left the venue with no artifact to
  show what they learned. The knowledge evaporated within a week.

The MCP surface was also small (4 tools) and the bundled examples only
covered web-app / ai-ml / mobile. Both limited how well external agents
could adopt Hackathon Surgeon.

## Decision

Three new skills ship in v0.4.0:

1. **time-box** — allocates remaining minutes across pipeline stages
   (build/verify/demo/ship) and emits per-stage checkpoints + alarms.
   Pairs with scope-knife: one says _what_, the other says _when_.
2. **stack-picker** — recommends a stack from `team_skills`,
   `time_remaining_minutes`, `demo_format`, and `prize_category`.
   Outputs a 30-minute bootstrap walkthrough. Pairs with idea-clarify.
3. **retro** — post-event retrospective. Computes four ratios
   (scope_accuracy, time_accuracy, verify_pass_rate, judge_score_avg)
   and emits a three-bucket action list (keep_doing, stop_doing,
   try_next_time). Closes the lifecycle loop.

The MCP server grows from 4 to 8 tools:

| Tool                 | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `list_skills`        | (existing) enumerate every bundled skill                                            |
| `get_skill`          | (existing) read a single SKILL.md by name                                           |
| `match_skill`        | (existing) find the best skill for an utterance                                     |
| `status`             | (existing) read all 5 state files                                                   |
| `validate_skill`     | **new** — lint a skill dir against the protocol                                     |
| `apply_skill_advice` | **new** — write a skill's structured output to a state file (deep-merge or replace) |
| `list_examples`      | **new** — enumerate bundled example projects w/ stack + stage                       |
| `get_recovery_plan`  | **new** — return the 30-second fallback script + decision tree                      |

Three new example projects ship alongside:

- `examples/data-eng` — Python stdlib ETL (CSV -> TSV)
- `examples/chrome-extension` — Manifest V3 highlighter
- `examples/devtool-cli` — Node ESM CLI tool

The MCP server also stops hardcoding `version: '0.2.0'` and now reads
`package.json` at startup so the version reported via `initialize`
matches the package version.

## Consequences

- The skill pack now covers the full lifecycle from idea to retrospective.
- External agents (Codex, Claude Code, Cursor) can drive more of the
  workflow via MCP without falling back to the CLI.
- The CLI still works the same; nothing is removed.
- `validate-skill` is reachable both as a CLI subcommand and an MCP
  tool, so agents and humans share the same gate.
- `apply_skill_advice` writes to `.hackathon/state/` only; it never
  touches source code. The state-file boundary (ADR-0002) is preserved.
- The action-verb regex in `validate-skill` gained `allocate|retro|retrospect|bootstrap`
  so the new skills' descriptions pass the validator.

## Alternatives considered

- **Single mega-skill "orchestrator"**: rejected. Composes 3 small
  skills is better than 1 opaque skill; each is independently testable.
- **Web UI for the pack**: rejected (per existing `Won't do`). The
  CLI + docs site is enough; v0.4.0 doubles down on the MCP surface
  instead of building a UI.
- **Embedding-based matcher**: deferred (was on 0.3.x roadmap). Bigger
  lift, smaller marginal value once the skill roster is more complete.

## References

- [0001-skill-format.md](0001-skill-format.md) — skill shape
- [0002-state-filesystem.md](0002-state-filesystem.md) — state file location
- [0003-agent-skills-standard.md](0003-agent-skills-standard.md) — Agent Skills standard
- [0004-skill-extensibility.md](0004-skill-extensibility.md) — CLI + JSON Schema pairing
- `skills/time-box/SKILL.md` — the new time-box skill
- `skills/stack-picker/SKILL.md` — the new stack-picker skill
- `skills/retro/SKILL.md` — the new retro skill
- `src/mcp/server.ts` — 8 tools, version read from package.json
- `src/state/schemas/time-box.schema.json`, `stack.schema.json`, `retro.schema.json`
