# fast-verify

Run each `demo_path` step end-to-end and capture pass/fail with diagnosis on the first failure.

!!! info "When to invoke"
After scope-knife produces a demo_path, run this skill before declaring any feature done. Re-run after every fix.

## Inputs

| Field                        | Type    | Required | Description                                              |
| ---------------------------- | ------- | -------- | -------------------------------------------------------- |
| `.hackathon/state/plan.json` | file    | required | source of demo_path steps to verify                      |
| `step_index`                 | integer | optional | restrict to a single step (default: all)                 |
| `re_verify_after`            | boolean | optional | after a fix, only re-verify steps that previously failed |

## Outputs

- `.hackathon/state/verify.json` — Per-step pass/fail with timing and error signature; matches verify.schema.json.

## Example

```
Input
  plan.json demo_path:
    - { step: 1, action: "Open the app URL" }
    - { step: 2, action: "Click Sign Up" }

Output (verify.json highlights)
  status: fail
  steps:
    - { step: 1, status: pass, duration_seconds: 1.2 }
    - { step: 2, status: fail, duration_seconds: 8.4,
        error_signature: "net::ERR_CONNECTION_REFUSED",
        diagnosis: { likely_cause: "backend died",
                     minimal_fix: "npm run dev in /api",
                     re_verify_command: "verify_step --step 2" } }
```

## Trigger phrases

- "run the fast verify script"
- "check the demo path"
- "verify each step"
- "what is failing"
- "something broke"

## Acceptance criteria

- [ ] Every demo_path step receives a `pass` / `fail` / `skip` status.
- [ ] Failed steps include `error_signature` and `diagnosis.{likely_cause, minimal_fix, re_verify_command}`.
- [ ] Total duration recorded; overall status is `pass` only when all steps pass.
- [ ] verify.json validates against verify.schema.json.

## Failure modes

| Mode                                          | Behavior                                                             |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `Step timeout`                                | Mark step `fail`, record duration_seconds, surface minimal_fix.      |
| `Missing plan.json`                           | Refuse to run; tell the agent to run scope-knife first.              |
| `Network or auth flakiness`                   | One automatic retry; persistent failure goes to fail with diagnosis. |
| `Re-verify after a fix reveals a new failure` | Append a new step entry; do not overwrite the original.              |

## See also

- [State Schemas](../architecture/state-schemas.md) — full output JSON schema
- [36-Hour Walkthrough](../guides/36-hour-walkthrough.md) — when this fires in the canonical flow
