# Quickstart (5 minutes)

Goal: by the end of this page you will have initialized `.hackathon/` and run
your first skill.

## 1. Initialize

Inside your hackathon project:

```bash
hackathon init
```

This creates `.hackathon/{skills,state,artifacts,traces}/` and copies the
bundled skills into `.hackathon/skills/`. It also seeds
`.hackathon/state/session.json`, `SESSION.md`, and `PROGRESS.md` as the
handoff brief for a fresh agent.

`init` seeds the five canonical flow state files (`plan.json`, `verify.json`,
`demo.json`, `review.json`, `ship.json`). The optional skills create their own
state files on demand, so you will see the full set only after running those
skills.

Verify the install:

```bash
hackathon --version
hackathon list
```

You should see fifteen skills listed with their trigger budgets. Use
`hackathon skills search` to filter them by category, tag, dependency, or
side effect.

## 2. Cut scope

```bash
hackathon run scope-knife
```

The agent will ask:

- What should judges see at the end of this demo? (your `demo_goal`)
- How many minutes remain? (your `time_remaining_minutes`)

Output:

- `.hackathon/state/plan.json` — the machine-readable plan
- `.hackathon/artifacts/scope-knife-output.md` — human-readable summary

`scope-knife` writes every KEEP feature with `passes: false`. This is the
default-FAIL contract: only an evaluator flips it to `true` with evidence.

Resume later with:

```bash
hackathon resume
```

Before building a new feature, read `PROGRESS.md` and git log, start the app,
and smoke-test the demo path. End every session with:

```bash
hackathon checkpoint --summary "what this session changed"
git commit -m "clean state after <feature>"
```

An operator can stop or redirect a long run without restarting it:

```bash
hackathon guard steer "prioritize the browser demo path"
hackathon guard stop "budget ran out"
hackathon guard status
hackathon guard clear
```

## 2.5 Run one sprint

```bash
hackathon sprint new --feature Auth --minutes 45 --max-iterations 3
hackathon sprint approve
hackathon sprint review
```

The generator builds against `sprint.json`; the evaluator fills
`eval.json` with evidence and feedback. Apply the verdict:

```bash
hackathon sprint accept
```

On pass, the feature is flipped to `passes: true` and evidence is written to
`plan.json`. On fail, feedback is written back into `session.json` for the
next generator iteration, along with a strategy:

- `refine` — keep the current approach and fix the feedback
- `pivot` — change direction while keeping the sprint contract
- `replan` — take the feature back to the planner
- `stop` — halt further work on this feature

Inspect the evaluator verdict and rubric score with:

```bash
hackathon eval
```

## 3. Verify the demo path

```bash
hackathon run fast-verify
```

This walks the demo path from `plan.json`, runs each step, and stops at the
first failure.

## 4. Draft your pitch

```bash
hackathon run demo-coach
```

Pick 30, 60, or 90 seconds. Output is `.hackathon/artifacts/demo-script.md` —
a printable card.

## 5. Self-review

```bash
hackathon run judge-sim
```

7-dimension scorecard with a prioritized fix list.

## 6. Ship

```bash
hackathon run ship-pack
```

Checks README, scans secrets, emits a packaging command.

## Optional: chain and inspect

```bash
hackathon run demo-rehearsal --chain   # deps-first: scope-knife -> fast-verify -> demo-coach -> demo-rehearsal
hackathon status                       # current lifecycle stage
hackathon report                       # post-run markdown report
hackathon trace                        # inspect the append-only event log
```

That is the whole loop. Run each skill when you need it; skip what you
already know.

## What is `.hackathon/`?

A hidden directory in your project. It contains:

- `skills/` — copies of the bundled skills
- `state/` — JSON files produced by each skill (`plan.json`, `verify.json`, ...)
- `artifacts/` — human-readable markdown files
- `traces/` — append-only `events.jsonl` harness log
- `SESSION.md` — human-readable handoff summary
- `PROGRESS.md` — agent-maintained progress log
- `AGENT_STOP` / `STEER.md` — operator controls (created on demand)

You commit `.hackathon/` (or not — your choice). The skills read state but
never require state to exist.
