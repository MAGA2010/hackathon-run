# 🔪 Hackathon Surgeon

> **Ship the demo, not the dream.**

A decision-making and execution system for hackathon teams operating under time pressure. Six skills, one workflow: **scope, verify, demo, judge, ship, recover.**

[![CI](https://img.shields.io/github/actions/workflow/status/MAGA2010/hackathon-run/ci.yml?branch=main&label=CI)](https://github.com/MAGA2010/hackathon-run/actions)
[![Version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/MAGA2010/hackathon-run/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2)](https://discord.gg/hackathon-surgeon)
[![Stars](https://img.shields.io/github/stars/MAGA2010/hackathon-run?style=social)](https://github.com/MAGA2010/hackathon-run)

<p align="center">
  <img src="docs/assets/images/hero.svg" alt="Hackathon Surgeon hero" width="800">
</p>

---

## The problem

A hackathon is not a coding problem. It is a **time-pressure, decision-making, execution** problem.

- 23 hours in, you have 8 unfinished features.
- The demo crashes on stage and you have 60 seconds to recover.
- A judge asks "what's novel here?" and you have no answer.
- Your README references API keys that you cannot ship.
- Your teammate has been debugging the wrong thing for 4 hours.

**Hackathon Surgeon does not help you write code faster.** It helps you **make the right cut, at the right time, every time**.

---

## How it works

Six skills, mapped to the hackathon lifecycle:

`
   scope-knife ─► fast-verify ─► demo-coach ─► judge-sim ─► ship-pack
        │              │              │             │            │
        └──────────────┴──────────────┴─────────────┴────────────┘
                                       │
                              recovery-runbook (anytime)
`

| Skill | When | Output |
|---|---|---|
| **scope-knife** | Too many ideas, no MVP consensus, clock shrinking | KEEP/CUT/DEFER classification + demo path |
| **ast-verify** | "Will this demo work?" | Step-by-step verification, stops at first failure |
| **demo-coach** | 30/60/90-second pitch, no clear narrative | Flow script + risk flags |
| **judge-sim** | Pre-submission self-review | 0-5 rating across 7 dimensions + fix priorities |
| **ship-pack** | Submitting now, worried about secrets | README check, secret scan, packaging command |
| **ecovery-runbook** | Demo fails on stage | P0-P3 severity, fallback strategy, 30-second script |

Each skill is **independently invokable**. You can run any of them at any time without running the others.

---

## 30-second quickstart

`ash
# One-time install
npm install -g @maga2010/hackathon-surgeon

# Inside any hackathon project
cd my-hackathon-project
hackathon init                  # creates .hackathon/ in your repo
hackathon run scope-knife       # forces a KEEP/CUT/DEFER decision
hackathon run fast-verify       # verifies the demo path
hackathon run demo-coach        # drafts the pitch
hackathon run judge-sim         # self-reviews before submitting
hackathon run ship-pack         # packages and checks for leaks
`

Each command is interactive. State is saved to .hackathon/state/ and is never required by the next step.

---

## The design rules (non-negotiable)

1. **Each skill is independently usable.** No forced flow. Run any skill at 2am without reading the docs first.
2. **State lives in the filesystem** (.hackathon/state/*.json), readable, never blocking.
3. **Trigger phrases in every description** so the agent can match intent without ambiguity.
4. **Body = execution logic only.** No backstory, no changelogs inside skill files.
5. **v1 ships 6 skills done well**, not 100 stubs.
6. **Acceptance criteria live in the skill file** and are wired to shell tests.

---

## Documentation

Full docs at [maga2010.github.io/hackathon-run](https://maga2010.github.io/hackathon-run/) or in [docs/](docs/index.md).

- [Getting Started](docs/getting-started/installation.md)
- [36-Hour Walkthrough](docs/guides/36-hour-walkthrough.md)
- [Skill Reference](docs/skills/scope-knife.md)
- [Architecture](docs/architecture/overview.md)
- [Contributing](docs/contributing/contributing.md)

---

## Examples

Three real-style projects that use the pack end-to-end:

- [xamples/web-app](examples/web-app/) — Next.js SaaS in 36 hours
- [xamples/ai-ml](examples/ai-ml/) — FastAPI + LLM app
- [xamples/mobile](examples/mobile/) — React Native client

Each example includes the full .hackathon/ directory with state and artifacts from a real run.

---

## Contributing

We welcome skill proposals, bug fixes, and docs improvements. See [CONTRIBUTING.md](CONTRIBUTING.md).

The [skill template](docs/contributing/skill-template.md) is the source of truth for adding new skills.

---

## Community

- **Discord:** [discord.gg/hackathon-surgeon](https://discord.gg/hackathon-surgeon)
- **Discussions:** [GitHub Discussions](https://github.com/MAGA2010/hackathon-run/discussions)
- **Twitter:** [@HackathonSurgeon](https://twitter.com/HackathonSurgeon)

---

## License

[MIT](LICENSE) — © 2025 Hackathon Surgeon Contributors

---

## Star history

<a href="https://star-history.com/#MAGA2010/hackathon-run&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=MAGA2010/hackathon-run&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=MAGA2010/hackathon-run&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=MAGA2010/hackathon-run&type=Date" />
  </picture>
</a>
