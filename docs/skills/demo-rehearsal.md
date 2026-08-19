# demo-rehearsal

**One-line summary:** Runs the team through a timed mock demo with a stopwatch, scores each segment, and emits a per-segment fix list. Use in the final 2 hours before the live demo.

## What it does

The first time the team sees the timer is on stage, and that run is the bad one. The rehearsal exists so the second time — also on stage — is the good one. demo-rehearsal structures the run into scored segments so the team sees which steps are dragging, which are rushed, and which need a rewrite (not just a trim).

## When to invoke

- The user says "let's rehearse", "practice the demo", or "timing run"
- Roughly 2 hours before the live demo slot
- Any time a previous run scored below 6 on multiple segments

Do not invoke on day 1; the demo path is not stable yet. Run `scope-knife` and `fast-verify` first.

## Input contract

| Field                    | Type   | Required | Notes                                                   |
| ------------------------ | ------ | -------- | ------------------------------------------------------- |
| `demo_path`              | array  | yes      | ordered list of steps from `plan.json`                  |
| `time_remaining_minutes` | int    | yes      | minutes until the live slot (>= 30)                     |
| `target_total_seconds`   | int    | no       | budget for the whole demo (default 180 = 3 min)         |
| `per_step_seconds`       | object | no       | per-step budget override (default: scale by step count) |
| `audience_count`         | int    | no       | affects pause tolerance                                 |
| `run_number`             | int    | no       | increments each rehearsal (default 1)                   |

## Output contract

- `.hackathon/state/rehearsal.json` — per-segment timings + scores + fix list (matches `rehearsal.schema.json`)
- `.hackathon/artifacts/rehearsal-log.md` — timestamped transcript

## Scoring

For each step the score is computed as:

```
score = max(0, 10 - |delta| * 2)
```

where `delta = actual_seconds - per_step_seconds`. A symmetric penalty around the budget, capped at 0.

| Score | Class   | Action                          |
| ----- | ------- | ------------------------------- |
| 8+    | on-time | no change                       |
| 5-7   | drift   | trim a sentence OR add a breath |
| <5    | broken  | rewrite the step, not just trim |

## Fix list

Output one bullet per `broken` step with three fields:

- **Cut** — one sentence to remove
- **Keep** — one sentence to anchor the step
- **New budget** — seconds

## Acceptance criteria

- Every step in `demo_path` has a recorded `actual_seconds`.
- Total run time is within `target_total_seconds` +/- 15%.
- At least one step scored below 8 OR an explicit `verdict: all-green` note.
- Fix list has one bullet per `broken` step, with cut / keep / new-budget.
- No step runs more than 2x its `per_step_seconds` (refuse; suggest `pivot`).

## Failure modes

- `time_remaining_minutes < 30` -> refuse; suggest `recovery-runbook` instead.
- `demo_path` empty -> refuse; run `scope-knife` first.
- Run #1 with score >= 9 on every step -> warn "suspicious; likely skipped steps".
- Network failure during live-timer lookup -> fall back to caller-reported seconds.

## See also

- [scope-knife](scope-knife.md) — produces `demo_path`
- [fast-verify](fast-verify.md) — confirms the path runs end-to-end before this skill
- [recovery-runbook](recovery-runbook.md) — when there is no time to rehearse
