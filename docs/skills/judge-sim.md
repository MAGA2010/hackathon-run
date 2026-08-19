# judge-sim

Simulate a panel of judges, score across 5 dimensions, and produce a prioritized fix list.

!!! info "When to invoke"
After demo-coach produces a script, run this skill to predict judge feedback. Run again after each fix_now item is closed.

## Inputs

| Field                        | Type         | Required | Description                                      |
| ---------------------------- | ------------ | -------- | ------------------------------------------------ |
| `.hackathon/state/demo.json` | file         | required | the pitch script under evaluation                |
| `.hackathon/state/plan.json` | file         | required | to cross-check demo_path coverage                |
| `panel_size`                 | integer 3..7 | optional | default 5; one judge per dimension               |
| `HACKATHON_JUDGE_BACKEND`    | URL          | optional | HTTP LLM judge; fallback to heuristic on failure |

## Outputs

- `.hackathon/state/review.json` — Per-dimension scores, overall (0..5), and fix_priorities.{fix_now, fix_last_10_min, do_not_touch}.

## Example

```
Output (review.json highlights)
  overall: 3.7
  dimensions:
    - { name: demo_clarity,    score: 4.5 }
    - { name: technical_depth, score: 3.2 }
    - { name: novelty,         score: 4.0 }
    - { name: polish,          score: 3.0 }
    - { name: feasibility,     score: 3.8 }
  fix_priorities:
    fix_now:        ["complete Stripe webhook handler"]
    fix_last_10_min:["trim README to 1 page"]
    do_not_touch:   ["the auth flow"]
```

## Trigger phrases

- "what would judges say"
- "simulate a judge panel"
- "how do we score"
- "judge this demo"

## Acceptance criteria

- [ ] Overall score in [0, 5] with one decimal place.
- [ ] Exactly 5 dimensions: demo_clarity, technical_depth, novelty, polish, feasibility.
- [ ] fix_now is empty only if overall >= 4.5; otherwise >= 1 item.
- [ ] do_not_touch is non-empty whenever scope-knife marked any feature KEEP.
- [ ] review.json validates against review.schema.json.

## Failure modes

| Mode                                 | Behavior                                                |
| ------------------------------------ | ------------------------------------------------------- |
| `Missing demo.json`                  | Refuse; tell the agent to run demo-coach first.         |
| `Inconsistent fix_now vs demo_path`  | Recompute; surface the conflict to the agent.           |
| `Score spikes in one dimension only` | Require at least one cross-check before reporting.      |
| `Team rejects the score`             | Show reasoning; offer a re-judge with a different seed. |

## See also

- [State Schemas](../architecture/state-schemas.md) — full output JSON schema
- [36-Hour Walkthrough](../guides/36-hour-walkthrough.md) — when this fires in the canonical flow
