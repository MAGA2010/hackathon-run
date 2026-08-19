# Architecture Decision Records

This directory contains the ADRs for Hackathon Surgeon. Each captures a
significant architectural choice, its context, and its consequences.

| ID                                         | Title                                                                                        | Status   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | -------- |
| [0001](0001-skill-format.md)               | Skill format follows `SKILL.md` convention                                                   | Accepted |
| [0002](0002-state-filesystem.md)           | State lives in `.hackathon/state/*.json`                                                     | Accepted |
| [0003](0003-agent-skills-standard.md)      | Skills follow the Agent Skills open standard                                                 | Accepted |
| [0004](0004-skill-extensibility.md)        | Skills are extensible via CLI + JSON Schema pairing                                          | Accepted |
| [0005](0005-skill-roster-v040.md)          | v0.4 skill roster expansion (time-box, stack-picker, retro) + MCP surface growth             | Accepted |
| [0006](0006-v050-run-replay-catalog.md)    | v0.5 run-time argument parsing + replay + skills.json catalog + demo-rehearsal + team-roster | Accepted |
| [0007](0007-v060-report-decision-log.md)   | v0.6 report + decision-log skill + MCP closure + validation hardening                        | Accepted |
| [0008](0008-v070-v080-matcher-backends.md) | v0.7-v0.8 semantic fallback + pluggable backends + validation no-op fix                      | Accepted |

## Adding a new ADR

1. Copy `0000-template.md` to `NNNN-short-title.md`.
2. Fill in the Context, Decision, Consequences.
3. Add a row to the table above.
4. Open a PR; tag `@hackathon-surgeon/core-maintainers`.
