---
name: decision-log
description: Writes every KEEP/CUT/DEFER/PIVOT scope decision into an append-only team log with rationale, author, and timestamp. Use after scope-knife or any time the team changes direction.
when_to_use: |
Trigger when the user says "log the decision", "record the cut", "why did we cut X", or right after scope-knife classifies a feature. Do not invoke before scope-knife; without a decision there is nothing to log.


version: 1.0
category: lifecycle
tags: ["append-only", "audit-trail", "keep-cut-defer-pivot"]
dependencies: ["scope-knife", "retro"]
side_effects: ["decision-log"]
triggers: ["log a decision", "record what we decided", "decision history", "keep cut defer", "append-only"]
---

# decision-log

The retro can only teach you what the team remembers, and the team forgets by minute 90. decision-log makes the memory durable: every scope decision is appended with its rationale so the "why" survives to the retrospective and the next hackathon.

## Input contract

Required:

- `feature`: string — the feature or subject being decided (e.g. "Notifications")
- `classification`: enum — `KEEP`, `CUT`, `DEFER`, or `PIVOT`
- `rationale`: string — one sentence explaining why

Optional:

- `author`: string — name or handle of whoever made the call
- `relates_to`: string — state file this decision relates to (default `plan.json`)
- `out_dir`: path — where `.hackathon/` lives (default `.hackathon`)

## Execution

### 1. Capture the decision

When scope-knife emits a classification, or the team changes direction mid-build, ask:

- What is the feature or subject?
- Which classification: KEEP, CUT, DEFER, or PIVOT?
- What is the one-sentence rationale?

### 2. Append to the log

```bash
python3 skills/decision-log/scripts/log_decision.py \
  --feature "Notifications" \
  --classification CUT \
  --rationale "Off demo path; removed for time." \
  --author alice
```

The script never overwrites: it reads the existing `decision-log.json`, appends the entry, and writes it back.

### 3. Emit the transcript

The script also writes `.hackathon/artifacts/decision-log.md` with every decision in reverse chronological order, ready to paste into the retro or a handoff doc.

## Output contract

- `.hackathon/state/decision-log.json` — append-only record (matches `decision-log.schema.json`)
- `.hackathon/artifacts/decision-log.md` — human-readable transcript

## Acceptance criteria

- [ ] Every entry has `at`, `feature`, `classification`, and `rationale`.
- [ ] `classification` is one of KEEP / CUT / DEFER / PIVOT.
- [ ] Append mode never replaces existing entries.
- [ ] `decision-log.json` validates against `decision-log.schema.json`.
- [ ] Transcript lists decisions newest-first.

## Failure modes

- `rationale` empty -> refuse; a decision without a reason is not a decision.
- `classification` not in enum -> refuse; ask for KEEP/CUT/DEFER/PIVOT.
- Existing log with mismatched `version` -> refuse; do not clobber a newer log.
- Nothing to log (no decision made) -> suggest `scope-knife` first.

## Trigger phrases (for agent intent matching)

- "log the decision"
- "record the cut"
- "why did we cut X"
- "decision log"
- "add a KEEP"
- "we changed direction"

## See also

- scope-knife (makes the decision; decision-log records it)
- retro (reads the log to explain the journey)
- team-roster (assigns who is accountable for each decision)
