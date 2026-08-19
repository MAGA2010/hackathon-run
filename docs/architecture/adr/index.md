# Architecture Decision Records

This directory contains the ADRs for Hackathon Surgeon. Each captures a
significant architectural choice, its context, and its consequences.

| ID                                    | Title                                                                            | Status   |
| ------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| [0001](0001-skill-format.md)          | Skill format follows `SKILL.md` convention                                       | Accepted |
| [0002](0002-state-filesystem.md)      | State lives in `.hackathon/state/*.json`                                         | Accepted |
| [0003](0003-agent-skills-standard.md) | Skills follow the Agent Skills open standard                                     | Accepted |
| [0004](0004-skill-extensibility.md)   | Skills are extensible via CLI + JSON Schema pairing                              | Accepted |
| [0005](0005-skill-roster-v040.md)     | v0.4 skill roster expansion (time-box, stack-picker, retro) + MCP surface growth | Accepted |

## Adding a new ADR

1. Copy `0000-template.md` to `NNNN-short-title.md`.
2. Fill in the Context, Decision, Consequences.
3. Add a row to the table above.
4. Open a PR; tag `@hackathon-surgeon/core-maintainers`.
