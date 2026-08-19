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

## Index of schemas

Every state file in `.hackathon/state/` has a matching schema under `src/state/schemas/`. The pack ships twelve schemas as of v0.6.0:

| Schema file                | Skill that writes it        | Required keys                                                        |
| -------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `plan.schema.json`         | scope-knife                 | version, generated_at, demo_goal, features, demo_path, next_tasks    |
| `verify.schema.json`       | fast-verify                 | version, generated_at, demo_path, steps                              |
| `demo.schema.json`         | demo-coach                  | version, generated_at, script                                        |
| `review.schema.json`       | judge-sim                   | version, generated_at, scores                                        |
| `ship.schema.json`         | ship-pack                   | version, generated_at, gates, status                                 |
| `recovery.schema.json`     | recovery-runbook            | version, generated_at, fallback_script                               |
| `time-box.schema.json`     | time-box (new in 0.4)       | version, generated_at, schedule                                      |
| `stack.schema.json`        | stack-picker (new in 0.4)   | version, generated_at, recommendation, runners_up, bootstrap         |
| `retro.schema.json`        | retro (new in 0.4)          | version, generated_at, ratios, keep_doing, stop_doing, try_next_time |
| `rehearsal.schema.json`    | demo-rehearsal (new in 0.5) | version, started_at, target_total_seconds, segments, fixes           |
| `decision-log.schema.json` | decision-log (new in 0.6)   | version, generated_at, entries                                       |
| `roster.schema.json`       | team-roster (new in 0.5)    | version, generated_at, team_size, members, bottleneck                |

To add a new one: see [How to add a new state file](#how-to-add-a-new-state-file) above.
