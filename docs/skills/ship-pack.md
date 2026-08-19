# ship-pack

Audit the repo for ship-readiness: secret scan, README checklist, reproducibility, and a packaging command.

!!! info "When to invoke"
The last skill. Run immediately before submission. Re-run if review.json changes after the final fix.

## Inputs

| Field                          | Type | Required | Description                     |
| ------------------------------ | ---- | -------- | ------------------------------- |
| `repo_root`                    | path | required | current project root            |
| `.hackathon/state/review.json` | file | required | to derive the final polish list |

## Outputs

- `.hackathon/state/ship.json` — secret_scan + checklist + packaging_command.
- `.hackathon/artifacts/ship-pack-output.md` — Human-readable ship report.

## Example

```
Output (ship.json highlights)
  secret_scan:
    clean: true
    findings: []
  checklist:
    passed: ["README present", "License present", "tests run green", "demo video linked"]
    failed: ["screenshots in /docs/assets"]
  packaging_command: "tar czf submit.tar.gz --exclude=node_modules --exclude=.git ."
```

## Trigger phrases

- "are we ready to ship"
- "final audit"
- "ship check"
- "package it up"
- "is the demo safe to publish"

## Acceptance criteria

- [ ] Secret scan is `clean` (zero HIGH/MEDIUM findings).
- [ ] README has at least 7 of the canonical sections.
- [ ] Checklist records pass + fail; ship-pack refuses `passing=true` if `clean=false`.
- [ ] packaging_command is a single shell line, copy-paste runnable.
- [ ] ship.json validates against ship.schema.json.

## Failure modes

| Mode                                               | Behavior                                                 |
| -------------------------------------------------- | -------------------------------------------------------- |
| `Secret found`                                     | Refuse to mark ship-ready; print location + remediation. |
| `Missing README section`                           | Block; tell the agent the missing section name.          |
| `Packaging command uses paths not under repo_root` | Refuse; constrain to the repo.                           |
| `No review.json`                                   | Refuse; tell the agent to run judge-sim first.           |

## See also

- [State Schemas](../architecture/state-schemas.md) — full output JSON schema
- [36-Hour Walkthrough](../guides/36-hour-walkthrough.md) — when this fires in the canonical flow
