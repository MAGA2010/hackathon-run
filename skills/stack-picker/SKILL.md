---
name: stack-picker
description: Recommends a tech stack when the team has no preference, the prize category biases a stack, or time pressure forces the simplest viable choice. Use at the start of a hackathon before any code is written.
when_to_use: |
Trigger when the user says "what should we build with", "we don't know the stack", "what language for a hackathon", or after idea-clarify surfaces a domain that maps cleanly to a known stack. Do not invoke when the user has already chosen a stack or has prior art in another language.


version: 1.0
category: scoping
tags: ["tech-stack", "bootstrap", "30-min"]
dependencies: ["idea-clarify", "scope-knife"]
side_effects: ["stack"]
triggers: ["what stack should we use", "tech stack", "how do we bootstrap", "pick the framework", "recommended stack"]
---

# stack-picker

Choosing a stack under pressure is the single highest-leverage decision
in the first hour. Wrong stack = 4 hours of yak-shaving instead of
building. Right stack = an MVP by midnight.

## Input contract

Required:

- `team_skills`: list of strings (`"python" | "javascript" | "typescript" | "react" | "react-native" | "swift" | "kotlin" | "rust" | "go" | "java" | "ruby" | "elixir" | ...`)
- `time_remaining_minutes`: integer >= 0
- `demo_format`: one of `web | mobile | desktop | cli | api | data | ml | hardware`

Optional:

- `prize_category`: free text (`"best ai use" | "best sustainability" | "best new developer tool" | ...`)
- `must_integrate`: list of external APIs or services the project must touch
- `team_size`: integer >= 1 (default 1)

## Execution

### 1. Filter viable stacks

For each entry in the candidate table, the stack is viable iff:

- All required team skills are present in `team_skills`, OR
- The team has at least one generalist (`javascript` + `python` both count)

### 2. Score each viable stack

`score = skill_match * 3 + speed * 2 + prize_fit * 2 - setup_cost`

| Component     | Range | Definition                                             |
| ------------- | ----- | ------------------------------------------------------ |
| `skill_match` | 0 – 1 | fraction of required skills the team has               |
| `speed`       | 0 – 1 | how fast a competent team can hit MVP (<= 1h = 1.0)    |
| `prize_fit`   | 0 – 1 | match between stack and `prize_category`               |
| `setup_cost`  | 0 – 3 | minutes to a hello-world (0 for browser, 3 for native) |

### 3. Recommend top 1 + runners-up

Output:

- `recommendation`: the top-scored stack, with a one-line rationale
- `runners_up`: next 2 stacks, with the tradeoff each one buys
- `anti_recommendation`: the worst-scored viable stack, with the failure mode

### 4. Emit the 30-minute setup

For the recommended stack, emit a step-by-step 30-minute bootstrap:

1. Install / clone / scaffold command
2. One minimal "hello world" file path + content
3. The single command that proves it works (browser URL, CLI exit, curl)

## Helper

The skill ships scripts/pick.py which implements the scoring algorithm above end-to-end and writes both .hackathon/state/stack.json and .hackathon/artifacts/stack-bootstrap.md. Run it with:

`python3 skills/stack-picker/scripts/pick.py \
    --team-skills python,javascript \
    --time-remaining 240 \
    --demo-format web \
    --out-dir .hackathon`

## Output contract

Files written:

- `.hackathon/state/stack.json` (NEW schema)
- `.hackathon/artifacts/stack-bootstrap.md` (30-min setup walkthrough)

## Acceptance criteria

- [ ] Outputs exactly one `recommendation` from the viable set.
- [ ] Each recommendation has a one-line rationale.
- [ ] Recommendation stack is reachable inside `setup_cost` minutes.
- [ ] `anti_recommendation` is named and the failure mode is concrete.
- [ ] Bootstrap walkthrough is runnable end-to-end in <= 30 minutes.

## Failure modes

| Mode                             | Behavior                                        |
| -------------------------------- | ----------------------------------------------- |
| No viable stacks                 | Refuse; suggest adding a generalist to the team |
| `team_skills` empty              | Refuse; ask the user for at least one skill     |
| `must_integrate` has unknown API | Warn; suggest a 30-min spike first              |
| Two stacks tie                   | Prefer the one with lower `setup_cost`          |

## Trigger phrases (for agent intent matching)

- "what should we build with"
- "what language for a hackathon"
- "we need to pick a stack"
- "best stack for X"
- "what framework"
