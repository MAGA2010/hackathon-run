# State schemas

Each skill writes JSON state files into `.hackathon/state/`. Schemas live in
`src/state/schemas/`.

| State file          | Producer                  | Consumers                                            |
| ------------------- | ------------------------- | ---------------------------------------------------- |
| `plan.json`         | `scope-knife`             | `fast-verify`, `demo-coach`, `judge-sim`, `time-box` |
| `time-box.json`     | `time-box`                | humans, `scope-knife` re-runs                        |
| `stack.json`        | `stack-picker`            | humans, bootstrap scripts                            |
| `roster.json`       | `team-roster`             | humans, `demo-rehearsal`                             |
| `verify.json`       | `fast-verify`             | `judge-sim`, `recovery-runbook`                      |
| `demo.json`         | `demo-coach`              | `judge-sim`, `recovery-runbook`                      |
| `rehearsal.json`    | `demo-rehearsal`          | humans                                               |
| `review.json`       | `judge-sim`               | humans, future `portfolio-convert`                   |
| `ship.json`         | `ship-pack`               | humans, CI                                           |
| `recovery.json`     | `recovery-runbook`        | humans, future log tools                             |
| `retro.json`        | `retro`                   | humans                                               |
| `decision-log.json` | `decision-log`            | `pivot`, `retro`, humans                             |
| `session.json`      | `hackathon init`          | every agent session start, `resume`                  |
| `sprint.json`       | `hackathon sprint`        | generator, evaluator                                 |
| `eval.json`         | `hackathon sprint review` | evaluator, generator feedback loop                   |

## Why JSON + Schema?

- **Inspectable**: open any state file with a text editor.
- **Strict**: the schema enforces shape; bad writes fail loud.
- **Cross-runtime**: JSON works everywhere; no proprietary binary.
- **Versioned**: every schema has a `version` field. Bump it on breaking
  changes.

## How to add a new state file

1. Author `<name>.schema.json` in `src/state/schemas/`.
2. Add it to the table below.
3. The CLI's `validate` command picks it up automatically.
4. Update the producer skill's SKILL.md.

## Validation in CI

`tests/run-acceptance.sh` and `tests/run-integration.sh` call
`hackathon validate` after every run. CI fails if any state file is
malformed.

## Index of schemas

| Schema file                | Skill that writes it | Required keys                                                                             |
| -------------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `plan.schema.json`         | scope-knife          | version, generated_at, demo_goal, time_remaining_minutes, features, demo_path, next_tasks |
| `time-box.schema.json`     | time-box             | version, generated_at, time_remaining_minutes, team_size, current_stage, schedule         |
| `stack.schema.json`        | stack-picker         | version, generated_at, demo_format, recommendation, runners_up, bootstrap                 |
| `roster.schema.json`       | team-roster          | version, generated_at, team_size, members, bottleneck                                     |
| `verify.schema.json`       | fast-verify          | version, started_at, status, steps                                                        |
| `demo.schema.json`         | demo-coach           | version, duration_seconds, one_liner, steps                                               |
| `rehearsal.schema.json`    | demo-rehearsal       | version, started_at, target_total_seconds, segments, fixes                                |
| `review.schema.json`       | judge-sim            | version, generated_at, dimensions, overall, fix_priorities                                |
| `ship.schema.json`         | ship-pack            | version, generated_at, readme, secret_scan, checklist, reproducible, packaging_command    |
| `recovery.schema.json`     | recovery-runbook     | version, generated_at, failure, severity, fallback, script                                |
| `retro.schema.json`        | retro                | version, generated_at, ratios, surprises, keep_doing, stop_doing, try_next_time           |
| `decision-log.schema.json` | decision-log         | version, generated_at, entries                                                            |
| `session.schema.json`      | harness init         | version, generated_at, current_stage, next_task, completed, blockers, environment         |
| `sprint.schema.json`       | harness sprint       | version, generated_at, name, goal, feature, status, criteria                              |
| `eval.schema.json`         | harness evaluator    | version, generated_at, sprint, verdict, criteria, feedback                                |

To add a new one: see [How to add a new state file](#how-to-add-a-new-state-file) above.
