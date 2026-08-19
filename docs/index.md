# Hackathon Surgeon

> **Ship the demo, not the dream.**

A decision-making and execution system for hackathon teams operating under
time pressure. Six skills, one workflow: scope, verify, demo, judge-sim,
ship, recover.

![Hero](assets/images/hero.svg)

## The problem

A hackathon is not a coding problem. It is a **time-pressure, decision-making,
execution** problem.

- 23 hours in, you have 8 unfinished features.
- The demo crashes on stage and you have 60 seconds to recover.
- A judge asks "what's novel here?" and you have no answer.

Hackathon Surgeon does not help you write code faster. It helps you **make the
right cut, at the right time, every time**.

## Quick start

```bash
npm install -g @maga2010/hackathon-surgeon
cd my-hackathon-project
hackathon init
hackathon run scope-knife
```

## The six skills

| Skill                                          | When                       | Output                               |
| ---------------------------------------------- | -------------------------- | ------------------------------------ |
| [scope-knife](https://github.com/MAGA2010/hackathon-run/blob/main/skills/scope-knife/SKILL.md)           | Too many ideas, no MVP     | KEEP/CUT/DEFER + demo path           |
| [fast-verify](https://github.com/MAGA2010/hackathon-run/blob/main/skills/fast-verify/SKILL.md)           | "Will it demo?"            | Step-by-step verification log        |
| [demo-coach](https://github.com/MAGA2010/hackathon-run/blob/main/skills/demo-coach/SKILL.md)             | 30/60/90s pitch            | Flow script with SAY/CLICK/SHOW/NOT  |
| [judge-sim](https://github.com/MAGA2010/hackathon-run/blob/main/skills/judge-sim/SKILL.md)         | Pre-submission self-review | 7-dimension scoring + fix priorities |
| [ship-pack](https://github.com/MAGA2010/hackathon-run/blob/main/skills/ship-pack/SKILL.md)               | Submitting now             | README check, secret scan, packaging |
| [recovery-runbook](https://github.com/MAGA2010/hackathon-run/blob/main/skills/recovery-runbook/SKILL.md) | Live demo fails            | P0–P3 fallback + 30s script          |

## Where to go next

- [Installation](getting-started/installation.md)
- [Quickstart](getting-started/quickstart.md)
- [36-hour walkthrough](guides/36-hour-walkthrough.md)
- [Architecture overview](architecture/overview.md)
- [Contributing](contributing/contributing.md)
