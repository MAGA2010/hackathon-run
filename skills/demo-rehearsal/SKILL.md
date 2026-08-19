---
name: demo-rehearsal
description: Runs the team through a timed mock demo with a stopwatch, scores each segment for over/under-time, and emits a per-segment fix list. Use in the final 2 hours before the live demo.
when_to_use: |
Trigger when the user says "let's rehearse", "practice the demo", "timing run", or 2 hours before the live slot. Do not invoke on day 1; the demo path is not stable yet.
---

# demo-rehearsal

The first time the team sees the timer is on stage, the run is bad. The rehearsal exists so the second time — also on stage — is the good one. This skill structures the rehearsal into scored segments.

## Input contract

Required:

- `demo_path`: ordered list of steps from `.hackathon/state/plan.json`
- `time_remaining_minutes`: minutes until the live slot (>= 30)

Optional:

- `target_total_seconds`: budget for the whole demo (default 180 = 3 min)
- `per_step_seconds`: per-step budget override (default: scale target by step count)
- `audience_count`: integer (affects pause tolerance)
- `run_number`: integer, increments each rehearsal (default 1)

## Execution

### 1. Announce the run

Print one line: "Rehearsal #N — total budget Xs — start NOW."

### 2. Time each segment

For each step in `demo_path`:

- Print `[step N/MAX] action` at t=0.
- Caller types `done` when the step finishes; record `actual_seconds`.
- Compute `delta = actual_seconds - per_step_seconds`.

### 3. Score

`score = max(0, 10 - |delta| * 2)` — symmetric penalty around the budget.
Below 6 = "rushed" or "dragged"; below 3 = "rewrite this step".

### 4. Classify

For each step:

| Score | Class   | Action                          |
| ----- | ------- | ------------------------------- |
| 8+    | on-time | no change                       |
| 5-7   | drift   | trim a sentence OR add a breath |
| <5    | broken  | rewrite the step, not just trim |

### 5. Emit fix list

Output one bullet per `broken` step with:

- What to cut (1 sentence)
- What to keep (1 sentence)
- The new budget (seconds)

## Output contract

- `.hackathon/state/rehearsal.json` (NEW schema, matches `rehearsal.schema.json`)
- `.hackathon/artifacts/rehearsal-log.md` — timestamped transcript

## Acceptance criteria

- [ ] Every step in `demo_path` has a recorded `actual_seconds`.
- [ ] Total run time is within `target_total_seconds` +/- 15%.
- [ ] At least one step scored below 8 OR an explicit note "all-green".
- [ ] Fix list has one bullet per `broken` step, with cut / keep / new-budget.
- [ ] No step runs more than 2x its `per_step_seconds` (refuse; suggest pivot).

## Failure modes

- `time_remaining_minutes < 30` -> refuse; suggest `recovery-runbook` instead.
- `demo_path` empty -> refuse; run `scope-knife` first.
- Run #1 with score >= 9 on every step -> warn "suspicious; likely skipped steps".
- Network failure during live-timer lookup -> fall back to caller-reported seconds.

## Trigger phrases (for agent intent matching)

- "let's rehearse"
- "practice the demo"
- "timing run"
- "mock demo"
- "stopwatch run"
