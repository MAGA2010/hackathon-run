# Quickstart (5 minutes)

Goal: by the end of this page you will have initialized `.hackathon/` and run
your first skill.

## 1. Initialize

Inside your hackathon project:

```bash
hackathon init
```

This creates `.hackathon/{skills,state,artifacts}/` and copies the bundled
skills into `.hackathon/skills/`.

## 2. Cut scope

```bash
hackathon run scope-knife
```

The agent will ask:

- What should judges see at the end of this demo? (your demo_goal)
- How many minutes remain? (your time_remaining_minutes)

Output:
- `.hackathon/state/plan.json` — the machine-readable plan
- `.hackathon/artifacts/scope-knife-output.md` — human-readable summary

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

That is the whole loop. Run each skill when you need it; skip what you
already know.

## What is `.hackathon/`?

A hidden directory in your project. It contains:

- `skills/` — copies of the bundled skills
- `state/` — JSON files produced by each skill (`plan.json`, `verify.json`, ...)
- `artifacts/` — human-readable markdown files

You commit `.hackathon/` (or not — your choice). The skills read state but
never require state to exist.
