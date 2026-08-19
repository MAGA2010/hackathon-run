# decision-log

**One-line summary:** Writes every KEEP/CUT/DEFER/PIVOT scope decision into an append-only team log with rationale, author, and timestamp. Use after scope-knife or any time the team changes direction.

## What it does

The retro can only teach you what the team remembers, and the team forgets by minute 90. decision-log makes the memory durable: every scope decision is appended with its rationale so the "why" survives to the retrospective and the next hackathon.

## When to invoke

- The user says "log the decision", "record the cut", or "why did we cut X"
- Right after scope-knife classifies a feature
- Any time the team changes direction mid-build

Do not invoke before scope-knife; without a decision there is nothing to log.

## Input contract

| Field            | Type   | Required | Notes                                            |
| ---------------- | ------ | -------- | ------------------------------------------------ |
| `feature`        | string | yes      | feature or subject being decided                 |
| `classification` | enum   | yes      | `KEEP`, `CUT`, `DEFER`, or `PIVOT`               |
| `rationale`      | string | yes      | one sentence explaining why                      |
| `author`         | string | no       | who made the call                                |
| `relates_to`     | string | no       | state file this relates to (default `plan.json`) |
| `out_dir`        | path   | no       | where `.hackathon/` lives                        |

## Output contract

- `.hackathon/state/decision-log.json` — append-only record (matches `decision-log.schema.json`)
- `.hackathon/artifacts/decision-log.md` — human-readable transcript, newest-first

## Execution

When scope-knife emits a classification, or the team changes direction, ask: what is the feature, which classification, and what is the one-sentence rationale? Then append:

```bash
python3 skills/decision-log/scripts/log_decision.py \
  --feature "Notifications" \
  --classification CUT \
  --rationale "Off demo path; removed for time." \
  --author alice
```

The script never overwrites: it reads the existing log, appends, and writes it back.

## Acceptance criteria

- Every entry has `at`, `feature`, `classification`, and `rationale`.
- `classification` is one of KEEP / CUT / DEFER / PIVOT.
- Append mode never replaces existing entries.
- `decision-log.json` validates against `decision-log.schema.json`.
- Transcript lists decisions newest-first.

## Failure modes

- `rationale` empty -> refuse; a decision without a reason is not a decision.
- `classification` not in enum -> refuse; ask for KEEP/CUT/DEFER/PIVOT.
- Existing log with mismatched `version` -> refuse; do not clobber a newer log.
- Nothing to log (no decision made) -> suggest scope-knife first.

## See also

- [scope-knife](scope-knife.md) — makes the decision; decision-log records it
- [retro](retro.md) — reads the log to explain the journey
- [team-roster](team-roster.md) — assigns who is accountable for each decision
