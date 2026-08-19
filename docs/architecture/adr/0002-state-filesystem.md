---
id: adr-0002
title: State lives in `.hackathon/state/*.json`
status: accepted
date: 2025-12-19
---

## Context

Skills need to share context (e.g. `scope-knife` produces a plan that
`fast-verify` reads). Two options: a database, or the filesystem.

## Decision

State lives in `.hackathon/state/<name>.json` as JSON. Each file matches a
published JSON Schema in `src/state/schemas/`. Skills read what they need;
nothing is required.

## Consequences

- No database to install or migrate.
- Hackers can inspect state with any text editor.
- Schemas catch malformed output before downstream skills crash.
- Skills can be run in any order without breaking.

## Alternatives considered

- **SQLite sidecar**: rejected; one more binary to ship and one more way to
  lose user data.
- **In-memory only**: rejected; forces every skill to start from scratch.
