# recovery-runbook

Detect a 2am-class failure (build red, demo broken, secrets leaked) and emit a minimum-time-to-green runbook.

!!! info "When to invoke"
Run when something breaks (build red, demo broken, secrets leaked, deploy failed, agent looping). Do NOT use it for design feedback.

## Inputs

| Field                          | Type   | Required | Description                                                                  |
| ------------------------------ | ------ | -------- | ---------------------------------------------------------------------------- |
| `repo_root`                    | path   | required | current project root                                                         |
| `symptom`                      | string | required | one of: build_red, demo_broken, secret_leak, slow, deploy_failed, agent_loop |
| `.hackathon/state/verify.json` | file   | optional | most recent verification log                                                 |

## Outputs

- `.hackathon/state/recovery.json` — A runbook with ranked actions (minutes saved each) and the smallest reversible fix.

## Example

```
Input
  symptom: build_red
  time_remaining_minutes: 180

Output (recovery.json highlights)
  actions:
    - { order: 1, action: "revert last commit",
        eta_minutes: 5, verify: "npm run build", rollback: "git revert" }
    - { order: 2, action: "pin dependency X to 1.2.3",
        eta_minutes: 10, verify: "npm ci && npm run build", rollback: "rm override" }
```

## Trigger phrases

- "something broke"
- "it is 2am and the build is red"
- "demo is broken"
- "we leaked a secret"
- "slow"
- "deploy failed"
- "agent is looping"

## Acceptance criteria

- [ ] At most 5 actions; total estimated minutes <= time_remaining / 4.
- [ ] Each action has owner, ETA, verification command, and rollback plan.
- [ ] recovery.json validates against recovery.schema.json.

## Failure modes

| Mode                        | Behavior                                                        |
| --------------------------- | --------------------------------------------------------------- |
| `Unknown symptom`           | Ask the agent to pick from the enum; refuse to invent.          |
| `No verify.json`            | Run fast-verify first; refuse to guess at root causes.          |
| `Multiple symptoms`         | Treat as one composite symptom; pick the highest-EVA fix first. |
| `All actions exceed budget` | Surface the budget breach and ask to CUT scope first.           |

## See also

- [State Schemas](../architecture/state-schemas.md) — full output JSON schema
- [36-Hour Walkthrough](../guides/36-hour-walkthrough.md) — when this fires in the canonical flow
