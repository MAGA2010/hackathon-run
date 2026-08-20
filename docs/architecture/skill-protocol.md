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

### Required fields

```yaml
---
name: kebab-case-name # required, must match folder name
description: | # required, verb-led, <= 1536 chars combined with when_to_use
  Sentence describing what the skill does and when to invoke.
when_to_use: | # optional but recommended
  More trigger context: scenarios, sample utterances, situations.
---
```

### Format v2 fields

Since v0.9.0 every skill carries first-class discovery metadata:

```yaml
version: 1.0 # optional, recommended; per-skill version
category:
  scoping # one of: scoping, building, verifying, demoing,
  #          judging, shipping, recovering, lifecycle
tags: ['mvp', 'demo-path'] # optional
dependencies: ['scope-knife'] # optional: skills this skill consumes
side_effects: ['plan'] # optional: state files this skill writes (stem names)
triggers: # optional: explicit trigger phrases
  - 'too many features'
```

### v1.2 third-party manifest fields

Optional fields for skills distributed outside this repo. All are WARN-only in
`validate-skill`:

```yaml
license: MIT
author: acme-org
homepage: https://example.com/tool
repository: https://github.com/acme-org/tool
compatibility: 'Requires Node 20+' # max 500 chars
```

See [ADR-0009](adr/0009-skill-format-v2.md) for Format v2 rationale and
[ADR-0011](adr/0011-v120-skill-manifest.md) for the manifest design.

## SKILL.md body

The body contains execution logic only. **No backstory, no marketing, no
changelog.**

Required sections (enforced by `hackathon validate-skill`):

- `## Input contract`
- `## Execution`
- `## Output contract`
- `## Acceptance criteria`
- `## Failure modes`

Recommended section:

- `## Trigger phrases` — explicit utterances that should invoke the skill.

## Acceptance criteria

Every acceptance criterion must be tested. The CI enforces:

- Every `## Acceptance Criteria` item maps to a shell test.
- Tests live in `tests/acceptance/test_<skill>.sh`.

## Trigger budget

`description + when_to_use` cannot exceed **1536 characters**. This is enforced
by CI (`ci.yml > trigger-phrase-length` job).

## Versioning

The pack has a version (`package.json`) and each skill has its own Format v2
`version`. Bump the skill version when its contract changes; `hackathon skills
pin` records per-skill versions for reproducibility.

## See also

- [Skill template](../contributing/skill-template.md)
- [Skills overview](../skills/index.md)
- [ADR-0003](adr/0003-agent-skills-standard.md)
