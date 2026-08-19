---
name: judge-sim
description: Scores a hackathon project 0 to 5 across seven judging dimensions and produces a prioritized fix list for the last hour. Use for pre-submission self-review to surface the weak points judges will attack.
when_to_use: |
  Trigger when the user is about to submit, wants feedback before the final
  hour, or asks "how would judges score this". Do not invoke before the
  demo path runs. Apply after demo-coach so the pitch is in place.
---

# judge-sim

## Input contract

Required:

- `repo_root`: project root
- `.hackathon/state/plan.json` (preferred; uses demo_path and KEEP list)
- `.hackathon/state/demo.json` (preferred; uses one_liner)

Optional:

- `time_remaining_minutes`: influences the fix priority list

## Execution

### 1. Score seven dimensions

Each dimension: 0 (catastrophic) to 5 (excellent).

| Dimension                | What judges look for                  |
| ------------------------ | ------------------------------------- |
| **problem_clarity**      | Is the pain obvious in 10 seconds?    |
| **originality**          | Is this novel vs. existing solutions? |
| **completeness**         | Does the demo path actually work?     |
| **technical_depth**      | Is the implementation non-trivial?    |
| **demo_quality**         | Is the pitch tight and rehearsed?     |
| **business_value**       | Would someone pay / use this?         |
| **submission_readiness** | README, run steps, secret hygiene?    |

### 2. For each dimension, output

- `score`: 0..5
- `deduction_reason`: one line why not higher
- `judge_questions`: 2–3 likely questions
- `improvements`: 1–3 concrete actions

### 3. Compute fix priorities

Three buckets:

- **FIX_NOW**: changes that take < 30 min and improve any score
- **FIX_LAST_10MIN**: cosmetic / typo-level changes only
- **DO_NOT_TOUCH**: things that look fixable but risk breaking the demo

### 4. Hard rule

If `.hackathon/state/verify.json` last status is `fail`, **any**
dimension scoring above 3 is invalid. Cap them at 3 and explain.

## Output contract

Files written:

- `.hackathon/state/review.json` (matches `src/state/schemas/review.schema.json`)
- `.hackathon/artifacts/judge-feedback.md` (human-readable review)

## Acceptance criteria

- [ ] Provides per-dimension score (0-5).
- [ ] Provides deduction_reason per dimension.
- [ ] Provides improvement suggestions per dimension.
- [ ] Distinguishes FIX_NOW / FIX_LAST_10MIN / DO_NOT_TOUCH.
- [ ] Caps dimensions at 3 when verify status is fail.
- [ ] Outputs a single overall score (mean).

## Failure modes

| Mode                | Behavior                                                     |
| ------------------- | ------------------------------------------------------------ |
| No `demo.json`      | Refuse; ask to run `demo-coach` first                        |
| `plan.json` missing | Continue, but note "demo not derived from a known plan"      |
| All 7 scores = 5    | Refuse to rubber-stamp; ask the human to challenge one score |
| All 7 scores = 0    | Refuse to dunk; ask the human to confirm                     |

## Trigger phrases

- "how will judges score us"
- "what will the judges ask"
- "is this competitive"
- "final review before submit"
- "what should I fix"
