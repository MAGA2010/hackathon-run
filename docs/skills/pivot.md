# pivot

Detects a mid-build scope change and re-runs `scope-knife` against the new direction without losing prior progress. Use when the user says pivot, change direction, or after a flat demo.

!!! info "When to invoke"
Run this skill **mid-build** when the team realizes the demo direction is wrong. **Do not invoke pre-build** — switch to `scope-knife` directly for greenfield ideas.

## Inputs

| Field                          | Type         | Required | Description                                             |
| ------------------------------ | ------------ | -------- | ------------------------------------------------------- |
| `new_direction`                | string       | required | one-sentence description of where the team is going now |
| `time_remaining_minutes`       | integer >= 0 | optional | defaults from `plan.json` if present                    |
| `.hackathon/state/plan.json`   | file         | optional | previous plan; pivot preserves KEEP features            |
| `.hackathon/state/verify.json` | file         | optional | last failure signatures (useful for the new plan)       |
| `.hackathon/state/review.json` | file         | optional | judge feedback that triggered the pivot                 |
| `.hackathon/state/demo.json`   | file         | optional | current pitch — often the source of the pivot           |

## Outputs

- `.hackathon/artifacts/pivot-report.md` — preserve/cut/rewrite table + proposed `demo_goal` + a recommended next-step (`hackathon run scope-knife` with the new brief).

Like `idea-clarify`, this skill does **not** write to `.hackathon/state/*.json` directly. It prepares the team to re-run `scope-knife` with a fresh plan.

## Example

```
Input
  new_direction: "Stop building the chatbot. Pivot to a passive notification feed."
  time_remaining_minutes: 180

Process
  Read prior plan.json:
    KEEP: chat-ui, websocket-bridge     (both still relevant -> preserve)
    KEEP: leaderboard                   (no longer relevant  -> cut, add to lost list)
    CUT:  ai-summary                   (already cut, no change)

  Hard rule: at least 1 KEEP feature must survive (chat-ui does).

Output (.hackathon/artifacts/pivot-report.md highlights)
  preserve: [chat-ui, websocket-bridge]
  cut:      [leaderboard]
  new_demo_goal: "Users see a live notification feed with no input required."
  next_step:     "hackathon run scope-knife --demo_goal=live notification feed"
```

## Trigger phrases

- "pivot"
- "change direction"
- "the demo idea is wrong now"
- "judges hated it"
- "we are building the wrong thing"
- "start over but keep X"

## Acceptance criteria

- [ ] Reads all 5 state files (or notes which are missing).
- [ ] Computes preserve / cut / rewrite per previous feature.
- [ ] At least 1 KEEP feature survives (otherwise refuse: "this is a rewrite, not a pivot").
- [ ] `pivot-report.md` exists and is <= 1 page.

## Failure modes

| Mode                         | Behavior                                           |
| ---------------------------- | -------------------------------------------------- |
| No `plan.json`               | Refuse: "nothing to pivot from; run scope-knife"   |
| New direction is identical   | Refuse: "no change; this isn't a pivot"            |
| All KEEP features irrelevant | Refuse: "this is a rewrite; run scope-knife fresh" |
| Time < 30 min                | Refuse: "no time to pivot safely"                  |

## See also

- [scope-knife](scope-knife.md) — the next skill after a pivot
- [idea-clarify](idea-clarify.md) — pre-`scope-knife` clarification for greenfield pivots
- [State Schemas](../architecture/state-schemas.md) — full prior-state JSON schemas
