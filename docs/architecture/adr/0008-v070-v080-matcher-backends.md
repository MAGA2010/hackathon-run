---
id: adr-0008
title: v0.7-v0.8 — semantic fallback matcher + pluggable integration backends + validation no-op fix
status: accepted
date: 2026-08-20
---

## Context

Two consecutive release goals (reach v0.8.0) surfaced three independent
gaps while acting as a professional reviewer:

1. The token matcher could not match valid paraphrases ("who does what"
   -> team-roster, "shorten the roadmap" -> scope-knife) because it only
   considered literal token overlap. The roadmap had tracked an
   embedding-based fallback for this.
2. `judge-sim` and `ship-pack` were fully local; teams could not plug in
   an LLM judge or a team webhook without editing Python.
3. Acceptance tests and the `validate` npm script invoked
   `dist/cli/commands/validate.js` directly, a module with no CLI
   entrypoint. It always exited 0, so schema validation was a no-op. A
   separate real bug in `score.py` emitted only 0-1 `judge_questions`
   for several dimensions, violating `review.schema.json`'s `minItems: 2`.

## Decision

### v0.7: zero-dep semantic fallback

`matchSkill` keeps the primary token scorer unchanged. When the primary
score is 0, it expands the utterance with a hackathon-domain synonym map
(scope, verify, demo, team, retro, stack, decision, recovery, ship,
judge, clarify, time) and re-scores. Gibberish still returns no match.
`MatchResult.fallback` marks the rescued path. A real embedding backend
is deferred as an opt-in future `HACKATHON_EMBED_BACKEND`.

### v0.8: pluggable backends

- `score.py` reads `HACKATHON_JUDGE_BACKEND`. When set, it POSTs the
  state inputs to that URL and uses the returned per-dimension scores;
  any transport or schema failure falls back to the heuristic scorer with
  `judge_source: "heuristic-fallback"`. `HACKATHON_JUDGE_TIMEOUT_SECONDS`
  defaults to 3.
- `audit.py` reads `HACKATHON_SHIP_WEBHOOK`. After writing ship.json it
  POSTs the audit; delivery is non-fatal and only prints a warning on
  failure.

### Validation no-op fix

- `score.py` now guarantees 2-3 `judge_questions` per dimension via a
  `pad_questions()` helper (used by both heuristic and remote paths).
- The `validate` npm script and all shell acceptance/integration checks
  now call `node dist/cli/index.js validate` instead of the module file.
- `review.schema.json` gains optional `judge_source` and `judge_backend`
  fields (backward-compatible widening).

## Consequences

- Paraphrase matching works out of the box with no new dependency; the
  embedding idea stays available as a future opt-in backend.
- Teams can delegate judging to an LLM and receive ship audits in their
  chat tool, while the local heuristic remains a safe default.
- Schema validation in CI now actually runs, and the previously-hidden
  `judge_questions` violation is fixed.
