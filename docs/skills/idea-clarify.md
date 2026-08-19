# idea-clarify

Surfaces what the user actually wants when the repo is empty or the request is one paragraph of vibes. Use before `scope-knife` on empty repos or vague briefs.

!!! info "When to invoke"
Run this skill **before `scope-knife`** if the repo is empty, the idea is one sentence, or the user gave a one-paragraph brief. **Do not invoke** once `scope-knife` has produced a plan.

## Inputs

| Field                    | Type         | Required | Description                            |
| ------------------------ | ------------ | -------- | -------------------------------------- |
| `user_brief`             | string       | required | the raw one-paragraph description      |
| `audience`               | string       | required | who the demo is for                    |
| `time_remaining_minutes` | integer >= 0 | optional | defaults to 36 * 60                    |
| `prior_artifacts`        | array        | optional | pre-existing notes, sketches, or links |

## Outputs

- `.hackathon/artifacts/idea-brief.md` — a one-page brief containing the four canonical answers, surfaced contradictions, a one-line `demo_goal`, and a one-line `mvp_axis`.

This skill does **not** write to `.hackathon/state/*.json` directly. It is a pre-`scope-knife` step; `scope-knife` reads the brief and writes `plan.json` from it.

## Example

```
Input
  user_brief: "We want to build an AI coach for hackathon teams"
  audience:   "judges at a 36h AI hackathon"

Process (questions asked, once)
  1. Who is the user?        -> "Hackathon teams in the first 6 hours of a 36h event."
  2. What does success look like at the demo? -> "Coach flags scope creep in real time."
  3. What is the smallest thing that proves it? -> "Type a feature idea, get CUT/KEEP verdict in 2s."
  4. What is the one thing you cannot ship without? -> "Latency under 2s for a verdict."

Output (.hackathon/artifacts/idea-brief.md highlights)
  demo_goal: "AI coach delivers a 2-second verdict on any feature idea."
  mvp_axis:  "verdict latency"
  contradictions: []
```

## Trigger phrases

- "we have an empty repo"
- "what should we build"
- "the brief is one paragraph"
- "we have an idea but no plan"
- "idea is too vague"

## Acceptance criteria

- [ ] The four canonical questions are asked exactly once.
- [ ] Contradictions are surfaced, not silently resolved.
- [ ] `demo_goal` is a single sentence (max 20 words).
- [ ] `mvp_axis` is a single noun phrase.
- [ ] `.hackathon/artifacts/idea-brief.md` exists and is <= 1 page.

## Failure modes

| Mode                       | Behavior                                    |
| -------------------------- | ------------------------------------------- |
| User gives one-word answer | Ask again, refuse to guess                  |
| User refuses to answer     | Surface as contradiction; refuse to proceed |
| Contradiction detected     | Block until resolved                        |
| Time < 1h                  | Skip question 1; ask 3 + 4 only             |

## See also

- [scope-knife](scope-knife.md) — the next skill in the chain
- [State Schemas](../architecture/state-schemas.md) — for what `scope-knife` will produce next
- [Skill Protocol](../architecture/skill-protocol.md) — frontmatter + body rules
