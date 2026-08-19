# Architecture overview

Hackathon Surgeon is a **skill pack**, not a runtime. The runtime is whatever
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

## The trigger matcher

When a user says "what should we cut", the agent should reach for
`scope-knife`. The match logic lives in `src/harness/trigger.ts`:

1. Tokenize the utterance.
2. Compare against each skill's description + when_to_use + trigger phrases.
3. Score by token overlap.
4. Break ties by trigger budget (more focused wins).
5. Final tie-break by alphabetical order (stable, predictable).

For semantic matching, see the
[Agent Skills open standard](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills).

## What's in the repo

| Path | Purpose |
|---|---|
| `skills/` | Each skill folder with `SKILL.md` + scripts |
| `src/harness/` | TypeScript harness (loader, frontmatter, trigger, state) |
| `src/cli/` | The `hackathon` CLI |
| `src/state/schemas/` | Published JSON Schemas for state files |
| `tests/acceptance/` | One shell test per skill |
| `tests/integration/` | End-to-end 36h-flow tests |
| `examples/` | Three real-style projects with `.hackathon/` artifacts |
| `docs/` | MkDocs site source |
| `.github/workflows/` | CI, release, docs |

## See also

- [State schemas](state-schemas.md)
- [Skill protocol](skill-protocol.md)
- [ADR index](adr/index.md)
