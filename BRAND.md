# Brand Decisions

> Living document. Decisions here are authoritative unless amended.

## Name

**Hackathon Run** (npm: @hackathon-run/hackathon-run, repo: hackathon-run)

## Tagline

> Ship the demo, not the dream.

## One-liner

A decision-making and execution system for hackathon teams operating under time pressure.

## Identity

- **Persona:** Veteran hackathon coach. Tough-love, plain-spoken, no fluff. Speaks in imperative sentences. "Cut it. Ship the path. Move."
- **Tone:** Confident, slightly urgent, never panicky. Treats the user as a competent adult under pressure.
- **Anti-persona:** Avoid corporate consultant speak, avoid motivational-poster language, avoid emoji-laden cheerleading.

## Visual Identity

### Logo concept

A scalpel drawn as a terminal prompt cursor. Two elements only: the blade and the caret. Vector-first, monospace grid.

### Color tokens

| Token          | Hex     | Usage                               |
| -------------- | ------- | ----------------------------------- |
| --brand-cut    | #FF3B30 | CUT, P0, danger, urgency            |
| --brand-defer  | #FFB800 | DEFER, P2, warning                  |
| --brand-keep   | #00D26A | KEEP, PASS, success                 |
| --brand-ink    | #0A0A0A | Background, primary text on light   |
| --brand-paper  | #F5F5F5 | Light background                    |
| --brand-accent | #5E5CE6 | Links, highlights, framework chrome |

### Typography

- Code / CLI: **JetBrains Mono** (fallback: Menlo, Consolas, monospace)
- Docs prose: **Inter** (fallback: system-ui, -apple-system, sans-serif)

## Naming rules for skills

- Folder name: `kebab-case`, 1-3 words, action verb preferred
- Display name: Title Case (e.g. `Scope Knife`)
- CLI command: `hackathon run <skill-name>`

## Voice rules

- Imperative mood for instructions ("Cut the feature", not "You might consider cutting").
- Numbers beat adjectives ("30 seconds", not "very fast").
- One idea per sentence.
- No emoji in CLI output. Emoji OK in docs (sparingly).

## Decision log

| Date       | Decision                         | Rationale                                                       |
| ---------- | -------------------------------- | --------------------------------------------------------------- |
| 2025-XX-XX | Adopted MIT license              | Maximizes corporate + individual adoption                       |
| 2025-XX-XX | Chose red as primary brand color | Signals urgency; distinguishes from blue-heavy dev tools        |
| 2025-XX-XX | Node.js for CLI scripts          | Zero-install baseline for hackers; aligns with npm distribution |
