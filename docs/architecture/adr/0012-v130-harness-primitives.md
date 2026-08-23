# ADR-0012: v1.3 harness primitives (default-FAIL, session, sprint, trace)

- Status: Accepted
- Date: 2026-08-23
- Deciders: hackathon-run maintainers

## Context

The skill pack was strong on discovery and per-skill state, but it was not
yet a harness: agents could invoke skills, yet there was no durable handoff,
no default-FAIL feature ledger, no agreed definition of done per feature,
and no append-only record of what actually happened. Anthropic's long-running
agent harness work identifies structured handoff artifacts, separate
generator/evaluator roles, sprint contracts, and evidence-backed evaluation
as the components that make long-horizon agent work reliable.

## Decision

Add a lightweight harness layer on top of the existing skill protocol:

1. `plan.json` features become default-FAIL contracts. Every KEEP feature
   starts with `passes: false`, `acceptance_criteria`, and an empty
   `evidence` array. Only an evaluator flips `passes` with evidence.
2. `session.json` becomes the durable handoff. `hackathon init` seeds it and
   `hackathon resume` prints the compact brief a fresh agent needs.
3. `sprint.json` becomes the definition of done. `hackathon sprint new`
   derives it from the first unpassed KEEP feature; `approve` locks it;
   `review` emits the evaluator handoff and writes `eval.json`.
4. `eval.json` captures the evaluator verdict and feedback. It is generated
   by `sprint review`, filled by the evaluator, and consumed by the next
   generator iteration.
5. `.hackathon/traces/events.jsonl` is an append-only event log. `hackathon
trace` inspects it; `report` includes it in the generated report.
6. `agents/planner.md`, `agents/generator.md`, and `agents/evaluator.md`
   provide explicit role prompts so Codex / Claude / MCP clients can run the
   loop without inventing roles.

The new CLI surface is additive: `resume`, `sprint`, and `trace`. Four new
MCP tools expose the same primitives: `resume`, `sprint_new`,
`sprint_review`, and `trace`.

## Consequences

### Positive

- A fresh agent can resume a project from a small, structured brief instead
  of replaying a conversation.
- Scope is no longer ambiguous: every feature has a default-FAIL status and
  a path to passing.
- Generator and evaluator are separated by contract, which reduces
  self-evaluation bias.
- Budget gates (time and iteration caps) make long-running loops stoppable.
- Trace makes retro, report, and A/B comparisons possible.

### Negative

- New artifacts add a small amount of state to `.hackathon/`.
- The evaluator is prompt/contract-driven, not a full QA runtime; teams that
  want browser-level QA still need to wire Playwright or another tool.
- Existing plans remain valid (new fields are optional), but teams should
  regenerate plans through `scope-knife` to get the default-FAIL fields.

## Follow-ups (planned)

- Wire `fast-verify` output back into `plan.features[].passes`.
- Add a typed evaluator protocol for `HACKATHON_JUDGE_BACKEND`.
- Add a full browser-based evaluator example.
