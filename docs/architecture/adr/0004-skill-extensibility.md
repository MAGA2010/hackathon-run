---
id: adr-0004
title: Skills are extensible via CLI + JSON Schema pairing
status: accepted
date: 2026-08-19
---

## Context

The original design (ADR-0001) only specified the on-disk shape of a skill:
`SKILL.md` plus optional `scripts/`, `templates/`, `tests/`, `references/`.
That is enough to _read_ a skill, but not enough to _grow_ the pack safely:

- Contributors had no way to scaffold a new skill without copy-pasting a
  previous one, leading to drift in frontmatter, section ordering, and
  script shebangs.
- There was no machine-checkable way to verify a skill matched the
  protocol; humans had to read each `SKILL.md` and check against
  [skill-protocol.md](../skill-protocol.md) by eye.
- When a skill referenced a state file in its body, no test ensured the
  matching JSON Schema actually existed. The drift would only surface at
  runtime when a downstream skill failed to parse.

## Decision

Skill extensibility is a first-class part of the protocol, delivered as
three pieces that work together:

1. **`hackathon new-skill <name>`** — scaffolds `skills/<name>/SKILL.md`
   (plus optional `scripts/<name>.py`, `tests/`) with correct frontmatter,
   section headings, kebab-case validation, and `--force` to overwrite.
   The scaffold includes a `## Trigger phrases` section so the matcher
   has explicit phrases to score on day one.
2. **`hackathon validate-skill <dir>`** — lints a `SKILL.md` against the
   8-rule protocol (frontmatter, folder-name match, trigger budget,
   action-verb lead, required body sections, `Do not invoke` clause on
   `when_to_use`, script shebang + `--repo-root` + `VERSION` pin, and
   state-file-vs-schema pairing). Returns 0 on pass, 1 on any error,
   2 on IO/usage error. Wire it into CI on every PR that touches
   `skills/`.
3. **Schema pairing** — every `state/<name>.json` referenced in a skill
   body must have a matching `src/state/schemas/<name>.schema.json`.
   `validate-skill` enforces this; `hackathon init` does not need to
   know about it. New schemas are added in lockstep with new state files
   (see [0002](0002-state-filesystem.md) for the original state decision).

Together these turn "contribute a new skill" into a 4-step path:

```
1. hackathon new-skill <name> --with-tests --description "..." --when-to-use "..."
2. Fill in the scaffold (inputs, outputs, trigger phrases, failure modes).
3. Add src/state/schemas/<name>.schema.json if the skill writes state.
4. hackathon validate-skill skills/<name>  # must be 0 errors before merging
```

## Consequences

- Adding a skill no longer requires reading the entire protocol doc — the
  scaffold embeds the protocol.
- PR review can focus on _content_ (does this skill solve a real problem?),
  not _form_ (does the frontmatter parse?).
- `validate-skill` is the single source of truth for "is this a valid
  skill". The protocol doc describes the _why_; the validator enforces
  the _what_.
- A broken skill (missing section, bad shebang, dangling state ref)
  blocks its own PR at CI time, not at a teammate's 2am.
- The validator is itself a CI step (`.github/workflows/ci.yml` runs
  `hackathon validate-skill skills/*/` on every push), so the gate is
  automatic.
- `idea-clarify` and `pivot` were the first two skills authored under
  this protocol. Their SKILL.md files conform end-to-end; both pass
  `validate-skill` with 0 errors and 0 warnings.

## Alternatives considered

- **JSON-only skill manifest (no markdown body)**: rejected. The body is
  the execution logic; agents read it. Moving it out of `SKILL.md` would
  break progressive disclosure and the Agent Skills standard (0003).
- **Plugin marketplace / discovery service**: rejected. Out of scope for
  v0.3; revisit when there are 20+ skills in the wild.
- **Pre-commit hook only, no CI step**: rejected. Hooks can be bypassed
  (`--no-verify`); CI is the last line of defense.

## References

- [0001-skill-format.md](0001-skill-format.md) — original skill shape
- [0002-state-filesystem.md](0002-state-filesystem.md) — state files + schemas
- [0003-agent-skills-standard.md](0003-agent-skills-standard.md) — Agent Skills open standard
- [skill-protocol.md](../skill-protocol.md) — the 8-rule protocol
- [contributing/skill-template.md](../../contributing/skill-template.md) — the human template
- `src/cli/commands/new-skill.ts` — the scaffolder
- `src/cli/commands/validate-skill.ts` — the linter
