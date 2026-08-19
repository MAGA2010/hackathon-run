# State schemas

Each skill writes JSON state files into `.hackathon/state/`. Schemas live in
`src/state/schemas/`.

| State file      | Producer           | Consumers                                |
| --------------- | ------------------ | ---------------------------------------- |
| `plan.json`     | `scope-knife`      | `fast-verify`, `demo-coach`, `judge-sim` |
| `verify.json`   | `fast-verify`      | `judge-sim`, `recovery-runbook`          |
| `demo.json`     | `demo-coach`       | `judge-sim`, `recovery-runbook`          |
| `review.json`   | `judge-sim`        | humans, future `portfolio-convert`       |
| `ship.json`     | `ship-pack`        | humans, CI                               |
| `recovery.json` | `recovery-runbook` | humans, future log tools                 |

## Why JSON + Schema?

- **Inspectable**: open any state file with a text editor.
- **Strict**: the schema enforces shape; bad writes fail loud.
- **Cross-runtime**: JSON works everywhere; no proprietary binary.
- **Versioned**: every schema has a `version` field. Bump it on breaking
  changes.

## How to add a new state file

1. Author `<name>.schema.json` in `src/state/schemas/`.
2. Add it to the table above.
3. The CLI's `validate` command picks it up automatically.
4. Update the producer skill's SKILL.md.

## Validation in CI

`tests/run-acceptance.sh` and `tests/run-integration.sh` call
`hackathon validate` after every run. CI fails if any state file is
malformed.
