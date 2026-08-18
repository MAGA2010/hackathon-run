---
id: adr-0001
title: Skill format follows the SKILL.md convention
status: accepted
date: 2025-12-19
---

## Context

A skill must be:

- discoverable by an agent at runtime
- loadable on demand (not all at once)
- diffable in code review
- portable across agent runtimes

## Decision

A skill is a folder named in `kebab-case`. It contains one mandatory
`SKILL.md` with YAML frontmatter and a markdown body. Sibling folders
`scripts/`, `templates/`, `tests/`, `references/` are optional and
convention-driven:

| Folder | Purpose |
|---|---|
| `scripts/` | Executable code invoked by the skill |
| `templates/` | Output scaffolding (markdown, JSON, HTML) |
| `tests/` | Acceptance tests run by CI |
| `references/` | Heuristics, decision tables, lookup data |

## Consequences

- One folder per skill keeps concerns isolated.
- Adding a new skill is a single new folder.
- Tests live next to the skill they exercise.
- Reviewers can read one file to understand the contract.

## Alternatives considered

- **Monolithic skill file with all skills in one place**: rejected; harder to
  diff, slower to load.
- **Per-skill sub-repo**: rejected; too much overhead for 6–12 skills.

