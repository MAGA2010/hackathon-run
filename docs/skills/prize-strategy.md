# prize-strategy

Pick which prize category a hackathon project should chase, and position the demo around that prize's judging criteria.

!!! info "When to invoke"
Run this skill after `scope-knife` produces a KEEP list, once `demo_goal` is stable and at least four hours remain. Do not invoke before `scope-knife` or in the final hour.

## Inputs

| Field                    | Type         | Required | Description                                                                |
| ------------------------ | ------------ | -------- | -------------------------------------------------------------------------- |
| `prizes`                 | array        | required | list of `{name, criteria: list[str], weight: int}` from the hackathon page |
| `project`                | object       | required | `{demo_goal, features, stack}` from `.hackathon/state/plan.json`           |
| `team_skills`            | array        | required | list of strings, e.g. `python`, `react`, `llm`                             |
| `time_remaining_minutes` | integer >= 0 | optional | default `240`                                                              |
| `target_demo_minutes`    | integer      | optional | default `3`                                                                |
| `previous_prizes`        | array        | optional | prize names the team has won before                                        |

## Outputs

- `.hackathon/state/prize.json` — the target prize, fit score, positioning notes, and anti-targets.
- `.hackathon/artifacts/prize-strategy.md` — a human-readable positioning document.

## Example

```
Input
  prizes:
    - name: "Best AI Use"  criteria: [ai, llm, automation]  weight: 100
    - name: "Newcomer"     criteria: [new, first-time]      weight: 50
  project.demo_goal: "An AI copilot that drafts your meeting notes."
  team_skills: [python, react, llm]

Output (prize.json highlights)
  target_prize:
    name: "Best AI Use"
    fit_score: 0.86
    rationale: "AI/LLM criteria overlap with the copilot demo goal and team skills."
  positioning_notes:
    - Opening hook: "AI that already wrote your notes before the meeting ends."
    - Demo feature first: live note generation from a transcript.
    - Mention: transformer-based summarization + local fallback.
  anti_targets:
    - name: "Newcomer"
      reason: "Team has prior wins, so newcomer criteria do not apply."
```

## Trigger phrases

- "what prize should we target"
- "which track should we go for"
- "how do we position for X prize"
- "what do judges want"
- "which prize category"

## Acceptance criteria

- [ ] Exactly one `target_prize` is named.
- [ ] `target_prize.fit_score` is the highest among all prizes.
- [ ] Positioning notes include at least 3 concrete actions.
- [ ] Anti-targets are named with one reason each.
- [ ] The score per prize is deterministic (no RNG).

## Failure modes

| Mode                          | Behavior                                              |
| ----------------------------- | ----------------------------------------------------- |
| `prizes` empty                | Refuse; ask for the hackathon page URL or prize list. |
| `demo_goal` empty             | Refuse; run idea-clarify or scope-knife first.        |
| All prizes tie at fit_score 0 | Default to the prize with the largest `weight`.       |

## See also

- [State Schemas](../architecture/state-schemas.md) — full output JSON schema
- [Skill Protocol](../architecture/skill-protocol.md) — Format v2 fields
