# Skill template

Copy this into `skills/<name>/SKILL.md` and fill in.

```markdown
---
name: <kebab-case-name>
description: |
  <One sentence, verb-led. What the skill does and when to invoke it.>
when_to_use: |
  <Trigger scenarios. Sample user utterances.>
version: 1.0
category: <scoping|building|verifying|demoing|judging|shipping|recovering|lifecycle>
tags: ['<tag>']
dependencies: ['<upstream-skill>']
side_effects: ['<state-stem>']
triggers:
  - '<phrase>'
  - '<phrase>'

# Optional third-party manifest (recommended for distribution)
license: MIT
author: <org-or-person>
homepage: https://example.com/skill
repository: https://github.com/org/skill
compatibility: 'Requires Node 20+'
---

# <Display Name>

## Input contract

Required:

- `field`: description

Optional:

- `field`: description

## Execution

### 1. <Step name>

<What this step does.>

### 2. <Step name>

<What this step does.>

### 3. <Step name>

<What this step does.>

## Output contract

Files written:

- `<path>` (matches `<schema>.schema.json`)
- `<path>` (human-readable)

## Acceptance criteria

- [ ] <One verifiable behavior>
- [ ] <One verifiable behavior>
- [ ] <One verifiable behavior>

## Failure modes

| Mode        | Behavior |
| ----------- | -------- |
| <condition> | <action> |

## Trigger phrases

- "<phrase>"
- "<phrase>"
```

## Companion files

- `scripts/<helper>.py` or `.ts` — one or more helpers.
- `references/<table>.md` — lookup data the agent may consult.
- `tests/acceptance/test_<skill>.sh` — at least one shell test per
  acceptance criterion.
