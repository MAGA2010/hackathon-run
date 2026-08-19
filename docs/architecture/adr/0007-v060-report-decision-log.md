---
id: adr-0007
title: v0.6 — hackathon report + decision-log skill + MCP closure + validation hardening
status: accepted
date: 2026-08-19
---

## Context

After v0.5.0 shipped `run --apply`, `replay`, and the skills catalog,
an internal audit (acting as a professional reviewer) found three
categories of gaps:

1. **No post-hackathon deliverable.** `replay` produced a timeline but
   there was no single artifact a team could drop into a README or blog
   post that combined timeline, scope, judge scores, ship audit, and
   retro ratios into a verdict.
2. **Decisions evaporated.** `scope-knife` wrote the current plan, but
   the "why" behind every KEEP/CUT/DEFER was not accumulated anywhere.
   The retro could only reconstruct the journey from memory.
3. **Validation had a blind spot.** `validate-skill` accepted a
   `VERSION = "1.0"` "pin" written _inside a docstring_ because the
   regex only checked the start of any line. The v0.5 fix commit had
   actually pinned the version inside the module docstring of
   `classify.py`, so the constant did not exist at runtime.

## Decision

v0.6.0 ships four changes.

### 1. `hackathon report`

A new command that reads every state file under `.hackathon/state/`,
reuses `replay`'s timeline collector, and renders:

- meta + demo goal + a computed **verdict** (SHIP READY / NEEDS WORK /
  BLOCKED ON SECRETS / UNVERIFIED)
- team roster and scope summary (KEEP / CUT / DEFER counts)
- a chronological timeline table
- stage-by-stage sections (verify, demo, review, ship, recovery, retro,
  roster, rehearsal, time-box, stack)

`--out <file>` writes a markdown report; `--json` emits the machine
payload. The command is the pack's "what did we actually do" artifact.

### 2. `decision-log` skill (14th skill)

An append-only decision record at `.hackathon/state/decision-log.json`
(schema `decision-log.schema.json`) plus `scripts/log_decision.py` and a
human-readable transcript. Every entry has `at`, `feature`,
`classification` (KEEP/CUT/DEFER/PIVOT), and `rationale`, with optional
`author` and `relates_to`. It pairs: scope-knife decides, decision-log
records, retro learns.

### 3. MCP closure

The MCP server grows from 8 to 12 tools: `replay`, `report`,
`skills_pin`, and `skills_diff`, so an agent can run the whole loop
(match → run → replay → report) over stdio.

### 4. Validation hardening + CLI consistency

- `validate-skill` now strips the leading module docstring before
  checking `VERSION`, so prose "pins" fail and real module-level pins
  pass; the CLI-argument check accepts any `--flag`.
- `classify.py`'s `VERSION = "1.0"` moved out of the docstring to real
  module scope.
- `hackathon run` and `hackathon list` gained `-C/--cwd`; `list` now
  reports the scripts column truthfully.

## Consequences

- Teams get a shippable report artifact and a durable decision history,
  which makes the retro data-driven instead of memory-driven.
- The MCP surface covers the full lifecycle, closing the loop for
  agent-driven hackathons.
- Validation is stricter where it matters (version pins) and more
  lenient where it should be (any declared CLI flag).
- 118 unit tests (was 111) + one new acceptance test keep the surface
  locked down.
