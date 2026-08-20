---
name: scope-knife
description: Forces a KEEP, CUT, or DEFER decision on every feature when scope is too large, no MVP consensus exists, or time is running out. Use for producing the minimum demo path and a next-steps task list.
when_to_use: |
  Trigger when the user has too many ideas, the feature list is long, the
  team has no MVP consensus, time is running out, or any skill invocation
  fails because scope is undefined. Apply before any other skill if scope is
  ambiguous. Do not invoke when scope is already agreed and stable.

version: 1.0
category: scoping
tags: ['keep-cut-defer', 'mvp', 'demo-path']
dependencies: ['idea-clarify', 'team-roster', 'time-box']
side_effects: ['plan']
triggers:
  [
    'scope is too big',
    'too many features',
    'no MVP consensus',
    'time is running out',
    'trim the scope',
  ]
---

# scope-knife

## Input contract

Required:

- `repo_root`: path to current project root
- `time_remaining_minutes`: integer (>= 0)
- `demo_goal`: one-sentence string ("what should judges see at the end?")

Optional:

- `.hackathon/state/plan.json` (load if exists)
- `features`: array (else inferred from repo scan)

## Execution

### 1. Scan repo

Run `scripts/scan_repo.py <repo_root>` to produce a feature inventory:

| Status             | Meaning                                     |
| ------------------ | ------------------------------------------- |
| `implemented`      | Code present, tests pass                    |
| `half-implemented` | Code exists but incomplete or tests failing |
| `unimplemented`    | In README/plan only                         |
| `broken`           | Was working, now failing                    |

### 2. Compute pressure

Based on `time_remaining_minutes`:

| Time left | Minimum CUT rate                  |
| --------- | --------------------------------- |
| `> 6h`    | warn if `< 30%`                   |
| `3–6h`    | enforce `>= 50%`                  |
| `1–3h`    | enforce `>= 70%`                  |
| `< 1h`    | enforce `>= 90%` (demo path only) |

### 3. Force classification

For every feature: KEEP / CUT / DEFER.

Hard rules:

- Cannot mark all features as KEEP.
- Features off the demo path default to CUT or DEFER.
- If user insists all-KEEP, refuse, output pressure calc, ask again.

### 4. Demo path

Linear sequence: `open URL → trigger core action → see result → understand value`.

### 5. Task list

Priorities:

1. **P0**: critical path (cannot demo without)
2. **P1**: demo polish
3. **P2**: nice-to-haves (skip if time runs out)

## Output contract

Files written:

- `.hackathon/state/plan.json` (matches `src/state/schemas/plan.schema.json`)
- `.hackathon/artifacts/scope-knife-output.md` (human-readable)

## Acceptance criteria

- [ ] Outputs KEEP/CUT/DEFER classification for every input feature.
- [ ] Outputs a demo path with at most 5 steps.
- [ ] Outputs a next-steps task list with priorities.
- [ ] Refuses to mark all features as KEEP.
- [ ] CUT rate at least meets the pressure threshold for `time_remaining_minutes`.
- [ ] `plan.json` validates against `plan.schema.json`.

## Failure modes

| Mode                  | Behavior                                    |
| --------------------- | ------------------------------------------- |
| Empty repo            | Suggest running `idea-clarify` first        |
| Missing `demo_goal`   | Ask once, refuse to guess                   |
| User rejects all cuts | Output pressure calc, ask once more         |
| Schema mismatch       | Fail loud with diff, do not silently coerce |

## Trigger phrases (for agent intent matching)

- "I have too many ideas"
- "the feature list is huge"
- "no MVP consensus"
- "what should we cut"
- "running out of time"
- "what should judges see"
