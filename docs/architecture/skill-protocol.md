# Skill protocol

Every skill in the pack obeys the same contract.

## Folder layout

```
skills/<skill-name>/
├── SKILL.md              # required
├── scripts/              # optional: executable helpers
├── templates/            # optional: output scaffolding
├── tests/                # optional: skill-specific tests
└── references/           # optional: lookup tables, heuristics
```

## SKILL.md frontmatter

```yaml
---
name: kebab-case-name           # required, must match folder name
description: |                   # required, <= 1536 chars combined with when_to_use
  Verb-led sentence describing what the skill does and when to invoke.
when_to_use: |                   # optional but recommended
  More trigger context: scenarios, sample utterances, situations.
paths: ['**/*.ts']               # optional: only activate when matching files exist
allowed_tools: [Bash, Read]      # optional: tools the skill needs
model: claude-opus-4             # optional: pin a model
---
```

## SKILL.md body

The body contains execution logic only. **No backstory, no marketing, no
changelog.**

Sections commonly used:

- `## Input contract`
- `## Execution`
- `## Acceptance criteria`
- `## Trigger phrases`
- `## Failure modes`

## Acceptance criteria

Every acceptance criterion must be tested. The CI enforces:

- Every `## Acceptance Criteria` item maps to a shell test.
- Tests live in `tests/acceptance/test_<skill>.sh`.

## Trigger budget

`description + when_to_use` cannot exceed **1536 characters**. This is enforced
by CI (`ci.yml > trigger-phrase-length` job).

## Versioning

The skill folder's contents do not have a version — the *pack* does. Bump
`package.json` `version` on any change to any skill.

## See also

- [Skill template](../contributing/skill-template.md)
- [ADR-0003](adr/0003-agent-skills-standard.md)
