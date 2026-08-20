---
name: pivot
description: Detects a mid-build scope change and re-runs scope-knife against the new direction without losing prior progress. Use when the user says pivot, change direction, or after a flat demo; do not invoke pre-build.
when_to_use: |
  Trigger when the user says "pivot", "change direction", "the demo
  idea is wrong", or after a demo that landed flat with judges. Do
  not invoke pre-build; switch to scope-knife directly for greenfield
  ideas.

version: 1.0
category: scoping
tags: ['mid-build-redirect', 'cut-rewrite', 'preserves-keep']
dependencies: ['scope-knife', 'decision-log']
side_effects: ['plan']
triggers: ['pivot', 'change direction', 'rebuild', 'mid-build redirect', 'start over']
---

# pivot

A pivot is the most expensive thing a hackathon team can do. Done
wrong, it costs the team 4 hours and a working demo. Done right, it
saves them from shipping something nobody wants.

This skill does the minimum work needed to redirect the team without
losing prior state.

## Input contract

Required:

- `new_direction`: one-sentence description of where the team is going now

Optional:

- `.hackathon/state/plan.json` (if it exists, the pivot preserves KEEP features)
- `.hackathon/state/verify.json` (last failure signatures — useful for the new plan)
- `.hackathon/state/review.json` (judge feedback that triggered the pivot)
- `.hackathon/state/demo.json` (current pitch — often the source of the pivot)
- `time_remaining_minutes`: integer >= 0 (default: from plan.json if present)

## Execution

### 1. Read every state file

If `.hackathon/state/` exists, read all 5 files. For each, summarize
in one line:

- plan.json: how many KEEP features, what demo_path
- verify.json: pass / fail / skipped counts, last failure signature
- review.json: overall score, fix_now count
- demo.json: duration, one_liner
- ship.json: packaging status

### 2. Compute preserve / drop / rewrite

For every feature in the previous plan.json:

| Previous status           | Default action          |
| ------------------------- | ----------------------- |
| KEEP + still relevant     | preserve                |
| KEEP + no longer relevant | cut, add to "lost" list |
| CUT or DEFER              | cut (no change)         |

Hard rule: at least 1 feature must survive unchanged, otherwise the
pivot is actually a rewrite and the user should re-run scope-knife
from scratch.

### 3. Emit a pivot report

Write `.hackathon/artifacts/pivot-report.md` with:

- the one-line summary of every prior state file
- the preserve/cut/rewrite table
- the proposed new demo_goal (one sentence)
- a recommended next-step: `hackathon run scope-knife` with the new brief

## Output contract

Files written:

- `.hackathon/artifacts/pivot-report.md` (human-readable)

Like `idea-clarify`, this skill does NOT write to `.hackathon/state/*.json`.
It prepares the team to re-run `scope-knife` with a fresh plan.

## Acceptance criteria

- [ ] Reads all 5 state files (or notes which are missing).
- [ ] Computes preserve / cut / rewrite per previous feature.
- [ ] At least 1 KEEP feature survives (otherwise refuse: "this is a rewrite, not a pivot").
- [ ] `pivot-report.md` exists and is <= 1 page.

## Failure modes

| Mode                         | Behavior                                           |
| ---------------------------- | -------------------------------------------------- |
| No plan.json                 | Refuse: "nothing to pivot from; run scope-knife"   |
| New direction is identical   | Refuse: "no change; this isn't a pivot"            |
| All KEEP features irrelevant | Refuse: "this is a rewrite; run scope-knife fresh" |
| Time < 30 min                | Refuse: "no time to pivot safely"                  |

## Trigger phrases (for agent intent matching)

- "pivot"
- "change direction"
- "the demo idea is wrong now"
- "judges hated it"
- "we are building the wrong thing"
- "start over but keep X"
