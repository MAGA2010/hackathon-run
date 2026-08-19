# demo-coach

Generate a 60-second pitch script broken into six canonical steps with risk flags.

!!! info "When to invoke"
Once fast-verify is green, run this skill to lock the pitch script. Do NOT change the script mid-rehearsal without re-running this skill.

## Inputs

| Field                        | Type        | Required   | Description                      |
| ---------------------------- | ----------- | ---------- | -------------------------------- |
| `demo_goal`                  | string      | required   | one-sentence product positioning |
| `duration_seconds`           | 30          | 60         | 90                               | required | hard-coded by schema; pick at the start         |
| `audience_interest`          | 'technical' | 'business' | 'both'                           | optional | bias SAY/CLICK/SHOW content toward the audience |
| `.hackathon/state/plan.json` | file        | optional   | informs the core_action step     |

## Outputs

- `.hackathon/state/demo.json` — A six-step script with say / click / show / not / risks per step.
- `.hackathon/artifacts/demo-script.md` — Printable rehearsal script.

## Example

```
Input
  duration_seconds: 60
  demo_goal: "Markdown notes that sync, in 3 seconds."

Output (demo.json highlights)
  steps:
    - { name: opening,     max_seconds: 8,  say: "We are Team X. We built Y." }
    - { name: pain,        max_seconds: 10, say: "Writers lose notes across apps." }
    - { name: product,     max_seconds: 10, say: "Markdown notes that sync in 3s." }
    - { name: core_action, max_seconds: 22, click: "create note", show: "list updates" }
    - { name: result,      max_seconds: 6,  say: "10k notes, zero lost." }
    - { name: close,       max_seconds: 4,  say: "Thanks. Questions?" }
```

## Trigger phrases

- "write me a pitch script"
- "help me demo this"
- "how should I present"
- "demo time"
- "60 second pitch"

## Acceptance criteria

- [ ] Exactly 6 steps with names opening, pain, product, core_action, result, close.
- [ ] Each step has max_seconds and a SAY of at most 2 sentences.
- [ ] Sum of max_seconds <= duration_seconds.
- [ ] demo.json validates against demo.schema.json.

## Failure modes

| Mode                                    | Behavior                                                  |
| --------------------------------------- | --------------------------------------------------------- |
| `No demo_goal`                          | Ask once; refuse to default.                              |
| `duration_seconds outside {30, 60, 90}` | Reject; explain the constraint.                           |
| `Audience contradiction`                | Pick "both" and write for both; surface the compromise.   |
| `Pitch runs long on first rehearsal`    | Trim by reducing `say` first; never extend `max_seconds`. |

## See also

- [State Schemas](../architecture/state-schemas.md) — full output JSON schema
- [36-Hour Walkthrough](../guides/36-hour-walkthrough.md) — when this fires in the canonical flow
