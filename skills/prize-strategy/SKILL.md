---
name: prize-strategy
description: Picks which prize category a hackathon project should chase and how to position the demo around that prizes judging criteria. Use at the start of the build phase once the demo_goal is stable and at least 4 hours remain.
when_to_use: |
  Trigger when the user says what prize should we target, which track should we go for, judges care about X, or right after scope-knife produces a KEEP list. Do not invoke before scope-knife (no KEEPs yet) or in the final hour (too late to reposition).

version: 1.0
category: scoping
tags: ['prize', 'strategy', 'positioning', 'judges']
dependencies: ['scope-knife']
side_effects: ['prize']
triggers:
  - 'what prize should we target'
  - 'which track should we go for'
  - 'how do we position for X prize'
  - 'what do judges want'
  - 'which prize category'
---

# prize-strategy

Most hackathon submissions that lose do not lose because of code; they lose because the team did not consciously pick a prize and did not frame their demo for the judges that award it. This skill forces that decision.

## Input contract

Required:

- `prizes`: list of `{name, criteria: list[str], weight: int}` from the hackathon page (e.g. overall, ai-use, sustainability, newcomer).
- `project`: `{demo_goal: str, features: list[str], stack: list[str]}` from `.hackathon/state/plan.json`.
- `team_skills`: list of strings (e.g. python, react, llm).

Optional:

- `time_remaining_minutes`: integer >= 0 (default 240).
- `target_demo_minutes`: integer (default 3).
- `previous_prizes`: list of prize names the team has won before (default empty).

## Execution

### 1. Score every prize

For each prize, compute:

`fit_score = 0.45 * criteria_overlap + 0.30 * demo_goal_match + 0.15 * stack_match + 0.10 * team_fit`

Where:

- `criteria_overlap` = fraction of prize.criteria words that appear in demo_goal or features (case-insensitive).
- `demo_goal_match` = fraction of demo_goal words that appear in prize.criteria.
- `stack_match` = 1 if any stack element matches any criteria word, 0 otherwise.
- `team_fit` = bonus if team_skills contains common winning tools for the prize (LLMs/transformers for ai-use, etc.).

### 2. Rank and emit target

The highest fit_score wins. Emit a one-line rationale citing the top 3 scoring features and the time needed to reposition.

### 3. Emit positioning notes

For the target prize, list 3-5 things to do in the next 30 minutes that maximize the judges perception:

- What to say in the first 10 seconds (opening hook).
- Which feature to demo first.
- Which technical detail to mention for this prizes judges.
- Which line of the README to highlight.

### 4. Emit anti-targets

For the bottom 1-2 prizes, name them and explain why they are a bad fit (so the team is not tempted by their prize pool).

## Output contract

Files written:

- `.hackathon/state/prize.json` (NEW schema, see `src/state/schemas/prize.schema.json`)
- `.hackathon/artifacts/prize-strategy.md` (human-readable positioning doc)

## Acceptance criteria

- [ ] Exactly one `target_prize` is named.
- [ ] `target_prize.fit_score` is the highest among all prizes.
- [ ] Positioning notes include at least 3 concrete actions.
- [ ] Anti-targets are named with one reason each.
- [ ] Score per prize is reproducible (deterministic, no RNG).

## Failure modes

| Mode                          | Behavior                                                                |
| ----------------------------- | ----------------------------------------------------------------------- |
| `prizes` empty                | Refuse; ask the user for the hackathon page URL or copy the prize list. |
| `demo_goal` empty             | Refuse; run idea-clarify or scope-knife first.                          |
| All prizes tie at fit_score 0 | Default to the prize with the largest `weight`.                         |

## Trigger phrases (for agent intent matching)

- "what prize should we target"
- "which track should we go for"
- "how do we position for X prize"
- "what do judges want"
- "which prize category"

## Helper

The skill ships `scripts/target.py` (Python stdlib only) which implements the fit_score algorithm above end-to-end and writes both `prize.json` and `prize-strategy.md`. Run it with:

    python3 skills/prize-strategy/scripts/target.py --prizes prizes.json --project plan.json --team-skills python,react --out-dir .hackathon

where `prizes.json` is the list of `{name, criteria, weight}` entries.
