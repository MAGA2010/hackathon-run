# retro

**One-line summary:** Reviews the hackathon journey after submission and produces a prioritized list of learnings for next time. Use after ship-pack has marked the project ready to submit.

## What it does

The hackathon does not end at submission. The team has roughly an hour of high-fidelity memory before it decays. retro captures that memory in a form a future team can actually use.

## When to invoke

- The user says "what did we learn" or "post-mortem"
- After ship-pack marks all gates green
- Before the team leaves the venue

Do not invoke during the build; the team is too busy to answer honestly.

## Input contract

| State file                       | Required | Notes                          |
| -------------------------------- | -------- | ------------------------------ |
| `.hackathon/state/plan.json`     | yes      | KEEP / CUT / DEFER decisions   |
| `.hackathon/state/verify.json`   | yes      | what actually worked           |
| `.hackathon/state/review.json`   | yes      | judge scores                   |
| `.hackathon/state/ship.json`     | yes      | submission outcome             |
| `.hackathon/state/time-box.json` | yes      | clock usage vs plan            |
| `free_text_notes`                | no       | last-hour quotes from the team |

## Output contract

- `.hackathon/state/retro.json` — four ratios + surprises + action list
- `.hackathon/artifacts/retro.md` — human-readable post-mortem

## The four ratios

| Ratio              | Formula                          | Interpretation                       |
| ------------------ | -------------------------------- | ------------------------------------ |
| `scope_accuracy`   | KEEP / (KEEP + CUT + DEFER)      | did scope-knife right-size the build |
| `time_accuracy`    | planned_minutes / actual_minutes | did time-box forecast correctly      |
| `verify_pass_rate` | passed_steps / total_steps       | was the demo path solid              |
| `judge_score_avg`  | mean(score across all judges)    | how did judges see it                |

## Failure modes

- Missing state files -> skip the corresponding ratio; note it.
- `judge_score_avg = NaN` -> substitute `not judged` placeholder.
- Ran during build -> refuse; suggest running after ship-pack.

## See also

- ship-pack (the gate that triggers retro)
- recovery-runbook (the safety net for live demos)
