# scope-knife

Force a KEEP/CUT/DEFER decision on every feature when scope is too large, MVP consensus is missing, or time is running out.

!!! info "When to invoke"
Run this skill **first** if scope is ambiguous, the team has more than 10 features, or time is below 6 hours. Re-run if a major pivot happens mid-build.

## Inputs

| Field                        | Type         | Required | Description                                                   |
| ---------------------------- | ------------ | -------- | ------------------------------------------------------------- |
| `repo_root`                  | path         | required | current project root                                          |
| `demo_goal`                  | string       | required | one-sentence description of what judges should see at the end |
| `time_remaining_minutes`     | integer >= 0 | required | estimated minutes left in the hackathon                       |
| `features`                   | array        | optional | inferred from `scripts/scan_repo.py <repo_root>` if omitted   |
| `.hackathon/state/plan.json` | file         | optional | previous plan to refine; current plan supersedes it           |

## Outputs

- `.hackathon/state/plan.json` — A plan.json matching plan.schema.json (KEEP/CUT/DEFER, default-FAIL `passes`, demo_path, next_tasks).
- `.hackathon/artifacts/scope-knife-output.md` — Human-readable rationale + pressure calculation.

## Example

```
Input
  demo_goal: "User signs up and saves their first note."
  time_remaining_minutes: 240

Output (plan.json highlights)
  features:
    - name: Auth        classification: KEEP   status: implemented  passes: false
    - name: Notes CRUD  classification: KEEP   status: half-implemented  passes: false
    - name: Search      classification: CUT    status: unimplemented  passes: false
    - name: Dark mode   classification: DEFER  status: unimplemented  passes: false
  demo_path:  [Open app, Click Sign Up, Save a note, See it appear]
  next_tasks: [Finish Notes CRUD (P0, 90m), Polish Auth (P1, 30m)]
```

## Trigger phrases

- "I have too many ideas"
- "the feature list is huge"
- "no MVP consensus"
- "what should we cut"
- "running out of time"
- "what should judges see"

## Acceptance criteria

- [ ] Every feature receives KEEP, CUT, or DEFER (no MAYBE).
- [ ] demo_path has at most 5 steps and starts with open URL.
- [ ] next_tasks are tagged P0 / P1 / P2 with `estimate_minutes`.
- [ ] Refuses to mark every feature as KEEP.
- [ ] CUT rate meets the pressure threshold for the remaining time.
- [ ] plan.json validates against plan.schema.json.
- [ ] Every KEEP feature starts `passes: false` with at least one acceptance criterion.

## Failure modes

| Mode                    | Behavior                                                    |
| ----------------------- | ----------------------------------------------------------- |
| `Empty repo`            | Suggest `idea-clarify` first; refuse to invent features.    |
| `Missing demo_goal`     | Ask once; do not guess.                                     |
| `User rejects all cuts` | Recompute pressure, ask again with the threshold exposed.   |
| `Schema mismatch`       | Fail loudly with the Ajv error list; never silently coerce. |

## See also

- [State Schemas](../architecture/state-schemas.md) — full output JSON schema
- [36-Hour Walkthrough](../guides/36-hour-walkthrough.md) — when this fires in the canonical flow
