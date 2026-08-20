---
name: recovery-runbook
description: Generates an emergency 30-second demo script and a fallback plan when a live demo breaks on stage. Use the moment a failure occurs: P0 if the demo is dead, P3 if only copy is wrong.
when_to_use: |
  Trigger when the demo fails on stage, the dev server is down, the API
  times out, or any skill invocation surfaces a P0/P1 failure. Do not
  invoke preemptively; this skill is for live emergencies.


version: 1.0
category: recovering
tags: ["fallback", "decision-tree", "30-second"]
dependencies: ["fast-verify", "demo-coach"]
side_effects: ["recovery"]
triggers: ["demo is broken", "fallback", "recovery", "what do we do if X fails", "30-second fallback"]
---

# recovery-runbook

## Input contract

Required:

- `failure_description`: one-sentence description of what broke
- `severity`: P0 | P1 | P2 | P3
- `demo_path` (from `.hackathon/state/plan.json` or user-supplied)

Optional:

- `.hackathon/state/verify.json` (last failure signatures)

## Execution

### 1. Classify severity

| Severity | Meaning                  | Default fallback                        |
| -------- | ------------------------ | --------------------------------------- |
| P0       | Demo entirely broken     | Video recording + verbal narrative      |
| P1       | Core feature crashes     | Static screenshots + verbal walkthrough |
| P2       | Peripheral feature fails | Skip the failing step, narrate the rest |
| P3       | UI / copy issue          | Acknowledge, continue                   |

### 2. Pick a fallback strategy

For each severity, the skill produces:

1. **The thing to do next** (action verb)
2. **The thing to say** (one sentence)
3. **The thing NOT to do** (anti-pattern to avoid)

### 3. Write the 30-second script

Mandatory content:

- Acknowledge the failure in < 5 seconds ("the live demo hiccuped, here's what we built").
- Switch to the fallback in < 10 seconds.
- Show value in the next 10 seconds.
- End with a confident close in < 5 seconds.

### 4. Provide recovery steps

For the engineer, off-stage:

- Check the dev server (`lsof`, `ps`).
- Check the most recent log lines.
- Check environment variables.
- Check external service status.

### 5. Write artifacts

- `.hackathon/artifacts/recovery-runbook.md` (printable card)
- `.hackathon/state/recovery.json` (machine-readable for downstream tools)

## Output contract

Files written:

- `.hackathon/artifacts/recovery-runbook.md` (the 30-second script + fallback plan)
- `.hackathon/state/recovery.json` (matches `src/state/schemas/recovery.schema.json`; severity + steps + fallback)

## Acceptance criteria

- [ ] Provides a fallback plan for the given severity.
- [ ] Provides presentation talking points.
- [ ] Avoids prolonged live debugging.
- [ ] Prioritizes demo continuity over technical depth.
- [ ] Outputs a 30-second script that fits within 30 seconds when read aloud.

## Failure modes

| Mode                       | Behavior                                                 |
| -------------------------- | -------------------------------------------------------- |
| `symptom` is empty         | Ask once; do not invent a symptom                        |
| Demo is already over       | Refuse; recovery-runbook is for the live demo            |
| `time_to_present` <= 0     | Refuse; emit "too late, post-mortem instead"             |
| Multiple symptoms detected | Ask the human to pick the dominant one before proceeding |

## Trigger phrases

- "the demo just died"
- "the screen is frozen"
- "API is down"
- "what do I do"
- "fallback plan"
