---
name: team-roster
description: Assigns each teammate a role + current task + blocker status, then surfaces the critical-path bottleneck. Use at the start of the build phase and any time the team feels stuck.
when_to_use: |
Trigger when the user says "who is doing what", "assign roles", "who is free", "who is blocked", or after scope-knife emits a plan with > 2 KEEP features. Do not invoke before scope-knife; without a plan, role assignment is guessing.
---

# team-roster

A 4-person team with no roles is 4 solo developers. A 4-person team with roles is a build crew. This skill forces the assignment into the open so the bottleneck is visible by minute 30, not by minute 30-of-9.

## Input contract

Required:

- `team_size`: integer >= 1
- `plan_features`: KEEP list from `.hackathon/state/plan.json`
- `team_members`: list of strings (names or handles)

Optional:

- `skills_per_member`: map of name -> [skill strings] (defaults to empty)
- `timezone_offsets`: map of name -> int (hours from UTC) for async overlap
- `blockers`: list of {member, blocker_text, since_minutes}

## Execution

### 1. Assign roles

For each team_member, default role by skill match:

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

### 2. Assign features

Greedy assignment:

```
remaining = plan_features (sorted by time_estimate_minutes desc)
for each role:
  while role has capacity AND remaining not empty:
    pick the top remaining feature whose role-skill matches
    assign to this member; remove from remaining
```

Capacity per role: 1 P0 + 1 P1 max, unless `team_size >= 4` then +1 P2.

### 3. Detect bottlenecks

For each member:

- count assigned P0 tasks
- if any blocker older than 60 min -> flag "stuck"
- if assigned zero tasks -> flag "free"

The bottleneck is the longest-stuck P0. The free member is the rescuer.

### 4. Emit the board

```
[PM]      alice  -> assign plan roles, coordinate, write README
[FE]      bob    -> KEEP: Auth UI     [stuck 90min: waiting on API key]
[BE]      carol  -> KEEP: Notes API   [ok]
[Wildcard] dave   -> KEEP: Billing    [free: help bob unblock]

Bottleneck: bob (P0 blocked 90min).
```

## Output contract

- `.hackathon/state/roster.json` (NEW schema)
- `.hackathon/artifacts/roster.md` (human-readable board)

## Acceptance criteria

- [ ] Every team_member has exactly one role.
- [ ] Every KEEP feature is assigned to exactly one member.
- [ ] Bottleneck section names the oldest-blocked P0.
- [ ] Free-member section names at least one member when any P0 is stuck.
- [ ] Output `roster.json` validates against `roster.schema.json`.

## Failure modes

- `team_size = 0` -> refuse; ask for at least one member.
- `plan_features` empty -> refuse; run `scope-knife` first.
- All members have identical skills -> assign PM to #1, rotate the rest.
- Single member -> assign all roles to them, flag "solo: consider merging with another team".

## Trigger phrases (for agent intent matching)

- "who is doing what"
- "assign roles"
- "who is free"
- "who is blocked"
- "who is on what"
- "team assignments"
