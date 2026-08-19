---
id: adr-0006
title: v0.5 — run-time argument parsing + replay + skills.json catalog + 2 new skills
status: accepted
date: 2026-08-19
---

## Context

By v0.4.0 the pack had 11 skills and 8 MCP tools, but the **most-used
CLI command** (`hackathon run <skill>`) still just dumped SKILL.md to
stdout and silently accepted any unknown flag. Three pain points:

1. `run` was read-only — to actually pre-fill a state file the team had
   to hand-edit JSON, defeating the "agents write state" promise.
2. There was no way to **replay the team's journey** after the event. The
   `retro` skill could compute ratios but not produce a chronological
   timeline.
3. There was no way to **pin skill versions**. A team upgrading the pack
   could not tell which of their 11 skills had changed.

Plus the skill roster still had two gaps the user surfaced:

- **demo-rehearsal**: there was no skill for the "stopwatch run" 2 hours
  before the live demo. `demo-coach` drafts the script; nothing times
  the actual run.
- **team-roster**: with no role-assignment skill, multi-person teams
  stumbled into 4 solo-developer mode instead of a build crew.

## Decision

v0.5.0 ships four CLI/structural changes and two new skills.

### CLI changes

1. **`hackathon run <skill>` now parses 5 flags** and pre-fills the
   skill's target state file when `--apply` is given:
   - `--demo-goal <text>` → `plan.json: demo_goal`, `demo.json: one_liner`
   - `--team-size <n>` → `time-box.json: team_size`, `roster.json: team_size`
   - `--time-remaining <n>` → `plan.json: time_remaining_minutes`,
     `time-box.json: time_remaining_minutes`
   - `--apply` → actually write via the schema-validated `writeState()` helper
   - `--no-banner` → skip the `# Skill: <name>` header

   The target state file is inferred by taking the **last** `state/<x>.json`
   reference in the SKILL.md body (the Output contract section is always
   near the bottom; the Input contract references are near the top).

   Unknown flags now fail loudly (`error: unknown option '--foo'`) instead
   of being silently accepted via `allowUnknownOption(true)`.

2. **`hackathon replay`** reconstructs the team's timeline from
   `.hackathon/state/`. For each file it reads `generated_at` (or
   `started_at` for verify.json), sorts chronologically, and emits
   per-file deltas + a one-line summary.

3. **`hackathon skills {list,pin,diff,show}`** manages a per-team
   `.hackathon/skills.json` catalog. `pin` writes name + version +
   sha256 checksum; `diff` shows what changed.

### New skills (now 13 total)

4. **`demo-rehearsal`** — times a mock run of the demo path, scores
   each segment, classifies as on-time / drift / broken, emits a fix list.
5. **`team-roster`** — assigns each teammate a role by skill match,
   greedy-assigns KEEP features, surfaces the bottleneck and the rescuer.

### Validation rule

The action-verb regex in `validate-skill` gained `assign|rehearse`
so the two new skill descriptions pass the validator.

## Consequences

- `hackathon run scope-knife --demo-goal="..." --time-remaining=240 --apply`
  is now the canonical "start the hackathon" command. No JSON hand-editing.
- `hackathon replay --json` can be piped into a blog post or a Slack
  update.
- `.hackathon/skills.json` is checked into the team repo, giving CI a
  reproducible skill set.
- The pack now covers the full hackathon lifecycle: pre-event, during,
  finale, post-event.

## Alternatives considered

- **Plugin system for skills**: deferred to v0.6+.
- **Embedding-based matcher fallback**: deferred from v0.3.x. The 13
  candidates give good token coverage now.
- **`run` as a multi-step wizard**: rejected. One-shot commands are
  easier for agents to drive.

## References

- `src/cli/commands/run.ts` — flag parsing + skeleton builders
- `src/cli/commands/replay.ts` — timeline reconstruction
- `src/cli/commands/skills.ts` — catalog management
- `skills/demo-rehearsal/SKILL.md` — new skill
- `skills/team-roster/SKILL.md` — new skill
- `src/state/schemas/rehearsal.schema.json` — new schema
- `src/state/schemas/roster.schema.json` — new schema
- ADR-0005 — prior expansion
