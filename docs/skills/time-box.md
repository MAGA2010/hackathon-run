# time-box

**One-line summary:** Allocates the remaining clock to each pipeline stage and emits checkpoints. Use when the clock is the constraint.

## What it does

A hackathon is won or lost on the clock. scope-knife decides _what_ to build; time-box decides _when_ to build each piece. Together they form a viable plan: one says "no", the other says "now".

## When to invoke

- The user says "we have X hours left"
- After scope-knife reports a tight timeline
- When a teammate asks "what should we focus on next?"

Do not invoke on day 1 when the team has 30+ hours and no plan yet; use scope-knife first.

## Input contract

| Field                    | Type    | Required | Notes                          |
| ------------------------ | ------- | -------- | ------------------------------ |
| `time_remaining_minutes` | integer | yes      | minutes until the clock hits 0 |
| `team_size`              | integer | yes      | >= 1                           |
| `current_stage`          | enum    | yes      | `idea                          | scope | build | verify | demo | ship` |
| `stage_progress`         | float   | no       | 0..1; default 0                |
| `buffer_minutes`         | integer | no       | reserve at end (default 90)    |
| `plan.json`              | object  | no       | load for KEEP list             |

## Output contract

- `.hackathon/state/time-box.json` — schedule + checkpoints (matches `time-box.schema.json`)
- `.hackathon/artifacts/time-box-schedule.md` — human-readable timeline

## Stage-split table

| Remaining stages         | Default split of work_budget |
| ------------------------ | ---------------------------- |
| `build verify demo ship` | 60 / 15 / 15 / 10            |
| `verify demo ship`       | 40 / 40 / 20                 |
| `demo ship`              | 50 / 50                      |
| `ship`                   | 100                          |

## Failure modes

- `time_remaining_minutes = 0` -> refuse; suggest recovery-runbook.
- `team_size = 0` -> refuse; ask for valid input.
- No `plan.json` -> suggest scope-knife first.
- Already past buffer -> output only `ship` stage; warn loudly.

## See also

- scope-knife (decides what to build)
- fast-verify (decides what still works)
- ship-pack (closes the loop)
