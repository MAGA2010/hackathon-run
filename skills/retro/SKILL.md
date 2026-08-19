---
name: retro
description: Reviews the hackathon journey after submission and produces a prioritized list of learnings for next time. Use after ship-pack has marked the project ready to submit; do not invoke mid-build.
when_to_use: |
Trigger when the user says "what did we learn", "post-mortem", "retrospective", "what should we do differently next time", or after ship-pack marks all gates green. Do not invoke during the build; the team is too busy to answer honestly.
---

# retro

The hackathon does not end at submission. The team has roughly an
hour of high-fidelity memory before it decays. retro captures that
memory in a form a future team can actually use.

## Input contract

Required:

- `.hackathon/state/plan.json` (load; the KEEP / CUT / DEFER decisions)
- `.hackathon/state/verify.json` (load; what actually worked)
- `.hackathon/state/review.json` (load; judge scores)
- `.hackathon/state/ship.json` (load; submission outcome)
- `.hackathon/state/time-box.json` (load; clock usage vs plan)

Optional:

- `free_text_notes`: anything the team said in the last hour
- `next_event_date`: ISO 8601 string; used for follow-up reminders

## Execution

### 1. Compute the four ratios

| Ratio              | Formula                          |
| ------------------ | -------------------------------- |
| `scope_accuracy`   | KEEP / (KEEP + CUT + DEFER)      |
| `time_accuracy`    | planned_minutes / actual_minutes |
| `verify_pass_rate` | passed_steps / total_steps       |
| `judge_score_avg`  | mean(score across all judges)    |

Print each with a one-sentence interpretation.

### 2. Mine the surprises

Compare plan vs reality and emit a `surprises` list:

- A feature that was CUT but turned out to be trivial
- A feature that was KEEP but took > 2x the time
- A failure during verify that was foreseeable
- A judge dimension that scored lower than expected

### 3. Generate the action list

Three buckets, each with at most 3 items:

- `keep_doing`: behaviors to repeat
- `stop_doing`: behaviors to drop
- `try_next_time`: experiments for the next event

Each item has: `behavior` (one sentence), `evidence` (which state file
shows it), `owner_hint` (which role would own it next time).

### 4. Emit the one-page PDF-ready summary

```text
# Retro — <event name> — <date>

## Four ratios
- scope_accuracy: 0.42 (cut more than half; mild over-scoping)
- time_accuracy:  1.15 (slight overrun; buffer held)
- verify_pass_rate: 0.83 (one flaky step near demo)
- judge_score_avg: 3.7 / 5 (mid-pack)

## Surprises
- Login was CUT but trivial in retrospect.

## Keep doing
- Pair-programmed the demo path (evidence: verify.json).

## Stop doing
- Spent 2h on a polished README (evidence: ship.json).

## Try next time
- Schedule a dry-run 2h before the live demo.
```

## Output contract

Files written:

- `.hackathon/state/retro.json` (NEW schema)
- `.hackathon/artifacts/retro.md` (the human-readable summary)

## Acceptance criteria

- [ ] All four ratios are computed and printed.
- [ ] Surprises list has at least one item OR is explicitly empty with rationale.
- [ ] Each bucket (`keep_doing`, `stop_doing`, `try_next_time`) has <= 3 items.
- [ ] Every action item has an `evidence` pointer to a state file.
- [ ] `retro.md` is <= 250 lines and stands alone as a post-mortem.

## Failure modes

| Mode                    | Behavior                                |
| ----------------------- | --------------------------------------- |
| Missing state files     | Skip the corresponding ratio; note it   |
| `judge_score_avg = NaN` | Substitute `not judged` placeholder     |
| `free_text_notes` empty | Skip the free-text section              |
| Ran during build        | Refuse; suggest running after ship-pack |

## Trigger phrases (for agent intent matching)

- "what did we learn"
- "post-mortem"
- "retrospective"
- "what should we do differently next time"
- "wrap up the hackathon"
- "lessons learned"
