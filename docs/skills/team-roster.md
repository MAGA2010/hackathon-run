# team-roster

**One-line summary:** Assigns each teammate a role + current task + blocker status, then surfaces the critical-path bottleneck. Use at the start of build and any time the team feels stuck.

## What it does

A 4-person team with no roles is 4 solo developers. A 4-person team with roles is a build crew. team-roster forces the assignment into the open so the bottleneck is visible by minute 30 of the build, not by minute 30 of the 9th hour.

## When to invoke

- The user says "who is doing what", "assign roles", "who is free", "who is blocked"
- After `scope-knife` emits a plan with more than 2 KEEP features
- Any time a teammate asks "what should I focus on?"

Do not invoke before `scope-knife`; without a plan, role assignment is guessing.

## Input contract

| Field               | Type   | Required | Notes                                             |
| ------------------- | ------ | -------- | ------------------------------------------------- |
| `team_size`         | int    | yes      | >= 1                                              |
| `plan_features`     | array  | yes      | KEEP list from `.hackathon/state/plan.json`       |
| `team_members`      | array  | yes      | list of names or handles                          |
| `skills_per_member` | object | no       | map of name -> [skill strings] (default empty)    |
| `timezone_offsets`  | object | no       | map of name -> hours from UTC (for async overlap) |
| `blockers`          | array  | no       | list of {member, blocker_text, since_minutes}     |

## Output contract

- `.hackathon/state/roster.json` — role assignments + bottleneck detection (matches `roster.schema.json`)
- `.hackathon/artifacts/roster.md` — human-readable board

## Role rules

Default role by skill match:

| Role            | When to assign                                                    |
| --------------- | ----------------------------------------------------------------- |
| **PM / driver** | if no one has PM / lead / manager skill: pick the longest-tenured |
| **Frontend**    | has react / vue / svelte / typescript                             |
| **Backend**     | has python / node / go / rust / java                              |
| **AI / ML**     | has pytorch / tensorflow / llm / openai                           |
| **Data**        | has sql / pandas / etl / spark                                    |
| **Design**      | has figma / css / design / ux                                     |
| **Hardware**    | has arduino / esp32 / raspi                                       |
| **QA / verify** | anyone not yet assigned; rotation role                            |
| **Wildcard**    | last-resort assignment; helps whoever is blocked                  |

If no skill match, assign PM to member #1 and Wildcard to the rest.

## Feature assignment

Greedy assignment: sort `plan_features` by `time_estimate_minutes` desc. For each role, assign the top remaining feature whose role-skill matches until capacity is hit (1 P0 + 1 P1 max, unless `team_size >= 4` then +1 P2).

## Bottleneck detection

For each member:

- count assigned P0 tasks
- if any blocker older than 60 min -> flag `stuck`
- if assigned zero tasks -> flag `free`

The bottleneck is the longest-stuck P0. The free member is the rescuer.

## Acceptance criteria

- Every `team_member` has exactly one role.
- Every KEEP feature is assigned to exactly one member.
- `bottleneck` section names the oldest-blocked P0 (or `null` when none).
- `free_members` lists at least one member when any P0 is stuck.
- Output `roster.json` validates against `roster.schema.json`.

## Failure modes

- `team_size = 0` -> refuse; ask for at least one member.
- `plan_features` empty -> refuse; run `scope-knife` first.
- All members have identical skills -> assign PM to #1, rotate the rest.
- Single member -> assign all roles to them, flag "solo: consider merging with another team".

## See also

- [scope-knife](scope-knife.md) — produces `plan_features`
- [time-box](time-box.md) — sizes the schedule the roster works against
- [recovery-runbook](recovery-runbook.md) — when the bottleneck cannot be unblocked
