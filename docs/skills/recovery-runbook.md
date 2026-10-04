# recovery-runbook

Detect a 2am-class failure (build red, demo broken, secrets leaked) and emit a minimum-time-to-green runbook.

!!! info "When to invoke"
Run when something breaks (build red, demo broken, secrets leaked, deploy failed, agent looping). Do NOT use it for design feedback.

## Inputs

| Field                             | Type   | Required | Description                                           |
| --------------------------------- | ------ | -------- | ----------------------------------------------------- |
| `failure_description`             | string | required | one-sentence description of what broke                |
| `severity`                        | enum   | required | P0 / P1 / P2 / P3                                     |
| `out_dir`                         | path   | optional | repo or `.hackathon` directory (default `.hackathon`) |
| `.hackathon/state/verify.json`    | file   | optional | most recent verification failures                     |
| `.hackathon/state/rehearsal.json` | file   | optional | timed rehearsal risks                                 |

## Outputs

- `.hackathon/artifacts/recovery-runbook.md` — printable fallback plan and 30-second script
- `.hackathon/state/recovery.json` — severity, fallback, script, recovery steps, and absorbed evidence

`scripts/fallback.py` reads `verify.json` and `rehearsal.json`, records their
failures in `recovery.json.evidence`, and prepends the recorded fixes to the
off-stage recovery steps.

## Example

```
Input
  failure_description: "The live API timed out."
  severity: P1

Output (recovery.json highlights)
  fallback:
    default: screenshots
    do: "Switch to curated screenshots and walk through them verbally."
    say: "The live API is timing out; I have screenshots showing the working flow."
    not: "Do not retry the API call. Do not blame the network."
  script:
    - { step: 1, phase: acknowledge, max_seconds: 3, line: "Live demo hiccup..." }
    - { step: 2, phase: playback, max_seconds: 12, line: "(play the GIF)" }
  evidence:
    - { source: fast-verify, step: 2, action: "save note", detail: "connection refused" }
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

- [ ] Emits a P0/P1/P2/P3 fallback with DO / SAY / NOT guidance.
- [ ] The on-stage script fits within 30 seconds.
- [ ] Verify and rehearsal evidence is absorbed into recovery steps.
- [ ] `recovery.json` validates against `recovery.schema.json`.

## Failure modes

| Mode                      | Behavior                                                        |
| ------------------------- | --------------------------------------------------------------- |
| Missing failure text      | Refuse; ask once for the dominant failure description.          |
| Unknown severity          | Refuse; accept only P0 / P1 / P2 / P3.                          |
| No verify/rehearsal files | Emit generic off-stage steps without evidence fields.           |
| Multiple evidence records | Prepend every recorded fix, keeping the existing recovery list. |

## See also

- [State Schemas](../architecture/state-schemas.md) — full output JSON schema
- [36-Hour Walkthrough](../guides/36-hour-walkthrough.md) — when this fires in the canonical flow
