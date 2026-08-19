---
name: time-box
description: Allocates time across the hackathon lifecycle (idea -> scope -> build -> verify -> demo -> ship) and warns before each deadline slips. Use when the clock is the constraint or when scope-knife reports time pressure.
when_to_use: |
Trigger when the user says "we have X hours left", "how should we split the time", "we're falling behind", or after scope-knife reports a tight timeline. Do not invoke on day 1 when the team has 30+ hours and no plan yet; use scope-knife first.
---

# time-box

A hackathon is won or lost on the clock. scope-knife decides _what_ to
build; time-box decides _when_ to build each piece. Together they form
a viable plan: one says "no", the other says "now".

## Input contract

Required:

- `time_remaining_minutes`: integer >= 0
- `team_size`: integer >= 1
- `current_stage`: one of `idea | scope | build | verify | demo | ship`

Optional:

- `stage_progress`: float in [0, 1] for the current stage (default 0)
- `buffer_minutes`: reserve at end of clock for ship/demo (default 90)
- `.hackathon/state/plan.json`: load if exists, use KEEP list as scope

## Execution

### 1. Compute the stage budget

Subtract `buffer_minutes` from `time_remaining_minutes` to get
`work_budget`. Then split across the remaining stages:

| Remaining stages         | Default split of work_budget |
| ------------------------ | ---------------------------- |
| `build verify demo ship` | 60 / 15 / 15 / 10            |
| `verify demo ship`       | 40 / 40 / 20                 |
| `demo ship`              | 50 / 50                      |
| `ship`                   | 100                          |

When `current_stage = build`, the verify/demo/ship windows are
_forced_ from the table above — not user-negotiable.

### 2. Allocate per-person

`per_person_minutes = stage_budget / team_size`. Round down to 15.
If per-person is below 30 min, warn: "single-person stage; consider
combining roles".

### 3. Emit checkpoints

For each remaining stage, emit one checkpoint:

- `T-?`: minutes from now until stage starts
- `alarm_at`: minutes from now when the team should re-evaluate
- `exit_criteria`: one sentence describing "done enough"

### 4. Detect slip

If `current_stage = build` and `stage_progress < (elapsed / stage_budget)`,
flag `slipping: true` and recommend a CUT pass via scope-knife.

## Output contract

Files written:

- `.hackathon/state/time-box.json` (NEW schema, see `src/state/schemas/time-box.schema.json`)
- `.hackathon/artifacts/time-box-schedule.md` (human-readable timeline)

## Acceptance criteria

- [ ] Stages add up to <= `time_remaining_minutes` (no over-budget).
- [ ] Buffer is honored.
- [ ] Per-person allocation is at least 30 minutes, OR a warning is emitted.
- [ ] Each remaining stage has an exit criterion and an alarm.
- [ ] Slipping flag fires when actual progress < expected.

## Failure modes

| Mode                         | Behavior                              |
| ---------------------------- | ------------------------------------- |
| `time_remaining_minutes = 0` | Refuse; suggest `recovery-runbook`    |
| `team_size = 0`              | Refuse; ask for valid input           |
| No `plan.json` yet           | Suggest `scope-knife` first           |
| Already past buffer          | Output only `ship` stage; warn loudly |

## Trigger phrases (for agent intent matching)

- "we have 4 hours left"
- "how should we split the time"
- "running out of time"
- "falling behind"
- "what should we focus on next"
- "how long until the demo"
