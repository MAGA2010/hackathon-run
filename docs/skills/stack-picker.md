# stack-picker

**One-line summary:** Recommends a tech stack when the team has no preference, the prize category biases a stack, or time pressure forces the simplest viable choice. Use at the start of a hackathon before any code.

## What it does

Choosing a stack under pressure is the single highest-leverage decision in the first hour. Wrong stack = 4 hours of yak-shaving instead of building. Right stack = an MVP by midnight.

## When to invoke

- The user says "what should we build with"
- The team has no shared language preference
- The prize category strongly biases a stack (e.g. "best AI use")

Do not invoke when the user has already chosen a stack.

## Input contract

| Field                    | Type     | Required | Notes                                       |
| ------------------------ | -------- | -------- | ------------------------------------------- |
| `team_skills`            | string[] | yes      | e.g. `["python", "typescript"]`             |
| `time_remaining_minutes` | integer  | yes      | >= 0                                        |
| `demo_format`            | enum     | yes      | web/mobile/desktop/cli/api/data/ml/hardware |
| `prize_category`         | string   | no       | free text                                   |
| `must_integrate`         | string[] | no       | external APIs or services                   |
| `team_size`              | integer  | no       | default 1                                   |

## Output contract

- `.hackathon/state/stack.json` — recommendation + runners-up + bootstrap
- `.hackathon/artifacts/stack-bootstrap.md` — 30-minute setup walkthrough

## Scoring formula

```
score = skill_match * 3 + speed * 2 + prize_fit * 2 - setup_cost
```

## Failure modes

- No viable stacks -> refuse; suggest adding a generalist.
- `team_skills` empty -> refuse; ask the user.
- Two stacks tie -> prefer the one with lower setup_cost.

## See also

- idea-clarify (clarifies the goal first)
- scope-knife (decides what to build with the chosen stack)
- ship-pack (audits the final submission)
