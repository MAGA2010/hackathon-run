# Architecture overview

Hackathon Run is a **skill pack**, not a runtime. The runtime is whatever
agent you load it into (Codex, Claude Code, Cursor, or our CLI).

## Components

```
                +-------------------+
                |  SKILL.md (1 per  |
                |   skill, .md)     |
                +---------+---------+
                          |
            frontmatter   body
                          |
                          v
        +-----------------+-----------------+
        |       Agent runtime              |
        |  (Codex / Claude / our CLI)      |
        +-----------------+-----------------+
                          |
              trigger    load
             matching    body
                          |
                          v
        +-----------------+-----------------+
        |       Skill scripts               |
        |  (Python or TypeScript helpers)   |
        +-----------------+-----------------+
                          |
                          v
        +-----------------+-----------------+
        |     State files (JSON)            |
        |  .hackathon/state/*.json          |
        |  (validated against published     |
        |   JSON Schemas)                   |
        +------------------------------------+
```

## Three-layer progressive disclosure

1. **Layer 1 (always loaded)**: skill name + description. The agent knows
   what each skill does without paying token cost.
2. **Layer 2 (loaded on trigger)**: full SKILL.md body. Contains execution
   logic.
3. **Layer 3 (loaded on demand)**: scripts, templates, references. Only the
   executing skill needs them.

## State on the filesystem

Every skill writes `.hackathon/state/<name>.json`. Downstream skills can
read it but never require it. This is **cooperative, not blocking** —
`demo-coach` reads `plan.json` if it exists but works without it.

Every state file is validated against a published JSON Schema in
`src/state/schemas/`.

## Harness state

The harness layer adds five state artifacts and two operator-control files:

- `session.json` — the compact handoff brief a fresh agent reads to resume work.
- `sprint.json` — the agreed definition of done for the current feature.
- `eval.json` — the evaluator's evidence-backed verdict and feedback.
- `PROGRESS.md` — the agent-maintained progress log that every session reads
  first and appends to before finishing.
- `AGENT_STOP` — operator kill switch; `hackathon resume` refuses to continue
  while it exists.
- `STEER.md` — one-shot operator redirect, surfaced once by the next resume.

`plan.json` is the default-FAIL contract: every KEEP feature starts with
`passes: false`, and only evidence-backed evaluation can flip it. All
harness actions are appended to `.hackathon/traces/events.jsonl` for replay,
report, and retrospective analysis.

The first context window uses `agents/initializer.md` to set up the
environment: `hackathon init`, `scope-knife`, `PROGRESS.md`, smoke test, and a
clean initial git commit. Later sessions run `hackathon resume`, read git log
and progress, start the app, verify the demo path, and build one feature per
sprint.

## The trigger matcher

When a user says "what should we cut", the agent should reach for
`scope-knife`. The match logic lives in `src/harness/trigger.ts`:

1. Tokenize the utterance.
2. Compare against each skill's description + when_to_use + trigger phrases.
3. Score by token overlap.
4. Break ties by trigger budget (more focused wins).
5. Final tie-break by alphabetical order (stable, predictable).

For semantic matching, set `HACKATHON_EMBED_BACKEND` to an HTTP ranking
endpoint; any transport or schema failure falls back to the local matcher.
The pack follows the [Agent Skills open standard](https://agentskills.io/specification).

## CLI surface

The `hackathon` CLI wraps the pack with both human and machine-readable
commands:

- `hackathon list`, `hackathon skills search`, `hackathon skills graph`
- `hackathon run <skill> [--chain] [--apply]`
- `hackathon match "<utterance>"`
- `hackathon init`, `hackathon status`, `hackathon flow`
- `hackathon resume` — print the handoff brief for a fresh agent
- `hackathon sprint new|approve|review|accept|status|budget` — contract lifecycle
- `hackathon checkpoint` — append an agent-maintained progress entry
- `hackathon guard stop|clear|steer|status` — operator controls
- `hackathon trace` — inspect the append-only harness event log
- `hackathon doctor`, `hackathon validate`, `hackathon validate-skill`
- `hackathon replay`, `hackathon report`, `hackathon skills pin`
- `hackathon mcp` — Model Context Protocol server (`tools/list`, `find_skills`, ...)

## What's in the repo

| Path                 | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `skills/`            | Each skill folder with `SKILL.md` + scripts                                      |
| `src/harness/`       | TypeScript harness (loader, frontmatter, trigger, state, session, sprint, trace) |
| `src/cli/`           | The `hackathon` CLI                                                              |
| `src/mcp/`           | Model Context Protocol server                                                    |
| `src/state/schemas/` | Published JSON Schemas for state files                                           |
| `tests/acceptance/`  | One shell test per skill                                                         |
| `tests/integration/` | End-to-end 36h-flow tests                                                        |
| `tests/unit/`        | Node test files for harness + CLI + MCP                                          |
| `examples/`          | Six real-style projects with `.hackathon/` artifacts                             |
| `docs/`              | MkDocs site source                                                               |
| `.github/workflows/` | CI, release, docs                                                                |

## See also

- [State schemas](state-schemas.md)
- [Skill protocol](skill-protocol.md)
- [ADR index](adr/index.md)
