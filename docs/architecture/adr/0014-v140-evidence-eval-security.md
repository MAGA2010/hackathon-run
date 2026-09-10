# ADR-0014: Evidence chains, agent evaluation, and skill capability policy

- Status: Accepted
- Date: 2026-09-10
- Deciders: hackathon-run maintainers

## Context

The v1.3 harness closed the plan-to-evaluation loop, but its evidence could
not be checked for tampering or source drift, model-backed evaluation was
not reproducible as a runner mode, and the static skill audit could not
compare declared capabilities with observed script behavior.

## Decision

1. `demo_path[].feature` declares which KEEP feature owns a demo step.
   `scope-knife` assigns the core product steps to the most demo-relevant
   KEEP feature.
2. `fast-verify` synchronizes executable step outcomes into
   `plan.features[].passes`. A feature passes only when every owned step
   passes; failures and skips reset it to false. Auto-generated evidence is
   tagged `source: fast-verify` so later runs replace only their own entries.
3. `sprint review` and `sprint accept` also apply the latest verification
   result, so an existing `verify.json` cannot be ignored during evaluation.
4. State writes use a cross-process lock and atomic rename. Trace events
   carry `event_id`, `seq`, `prev_hash`, and `hash`; `hackathon trace
--verify` validates the chain. Legacy events are normalized and counted,
   while every event appended after the migration remains strict.
5. `verify.json` records a deterministic workspace digest and per-step
   command evidence. Source changes mark the prior result stale and reset
   affected `plan.features[].passes` values.
6. `skill-eval-lab` supports deterministic CLI steps and command-backed
   agent runs. Command mode supports Codex, Claude Code, custom command
   templates, repeated runs, A/B variants, pass@k, confidence intervals,
   latency, token, and cost reporting. Deterministic steps remain the
   default CI gate; model-backed runs are manual or scheduled.
7. Skill frontmatter can declare `capabilities`. The audit compares those
   declarations with observed `fs_read`, `fs_write`, `net`, `exec`, `env`,
   and `mcp` behavior, enforces optional deny-policies, and emits SARIF.
8. `hackathon checkpoint --compress` writes `SESSION.md` as a bounded
   handoff of at most 150 lines. `PROGRESS.md` remains the full checkpoint
   log and `events.jsonl` remains the complete append-only trace.

## Consequences

### Positive

- The demo verifier now closes the plan-to-evidence loop automatically.
- The evaluator sees verification evidence already attached to the feature
  under review instead of reconstructing it by hand.
- Stale evidence cannot silently keep a feature green after its source
  revision changes.
- Trace tampering, deletion, and reordering become machine-detectable.
- Agent evaluations can measure reliability, cost, and A/B deltas without
  making normal CI depend on a model API.
- Third-party skills expose requested capabilities before installation.
- CI prevents the evaluation lab from regressing below grade A.
- A fresh session gets a small handoff without losing raw history.

### Negative

- Plans must assign feature ownership correctly; unowned steps are not used
  to flip a feature.
- Skipped steps deliberately keep a feature in the default-FAIL state, even
  if a human observed the behavior manually.
- The evaluation suite is stricter and takes longer than unit tests alone.
- Legacy trace prefixes cannot prove their original content unless a later
  signed event anchors their synthesized chain.
- Capability declarations describe intended access; they are not a sandbox.
