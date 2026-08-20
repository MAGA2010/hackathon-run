---
name: fast-verify
description: Verifies the demo path runs end-to-end by executing each step in order, recording the actual outcome, and stopping at the first failure with a diagnostic. Use before any demo or submission to catch breakage under time pressure.
when_to_use: |
  Trigger when the user is unsure if the demo will run, just changed code,
  is about to present, or asks "will this work". Do not invoke for unit
  tests, code review, or static analysis. Apply after scope-knife so the
  demo path is known.

version: 1.0
category: verifying
tags: ['smoke-test', 'cross-platform', '30-second']
dependencies: ['scope-knife']
side_effects: ['verify']
triggers: ['verify it works', 'smoke test', 'does it run', 'quick check', 'fast verify']
---

# fast-verify

## Input contract

Required:

- `repo_root`: project root
- `demo_path`: ordered list of steps (from `.hackathon/state/plan.json` or user-supplied)

Optional:

- `.hackathon/state/verify.json` (previous run, for diff)
- `time_budget_minutes`: stop verifying after this elapses (default 10)

## Execution

### 1. Load the demo path

If `plan.json` exists, take `plan.demo_path`. Otherwise, prompt the user
for a list of demo steps.

### 2. Run each step in order

For each step:

1. Determine the verification command (see `scripts/verify_step.py`).
2. Capture stdout, stderr, exit code.
3. Classify outcome:
   - `PASS`: exit code 0 and expected outcome met
   - `FAIL`: exit code != 0 OR expected outcome missing
   - `SKIP`: verification command not applicable (e.g. no browser available)
4. Record attempt, expected, actual, status, duration.

**Hard rule: stop at the first FAIL.** Do not pretend later steps passed.

### 3. Diagnose the first failure

If a step fails, run `scripts/diagnose.py`:

- Extract the error signature (last 5 lines of stderr).
- Match against known patterns in `references/error-patterns.md`.
- Suggest a one-line minimal fix.
- Provide a re-verification command.

### 4. Write outputs

- `.hackathon/state/verify.json` (matches `verify.schema.json`)
- `.hackathon/artifacts/fast-verify-output.md` (human-readable run log)

## Output contract

Files written:

- `.hackathon/state/verify.json` (matches `src/state/schemas/verify.schema.json`)
- `.hackathon/artifacts/fast-verify-output.md` (human-readable run log)

## Acceptance criteria

- [ ] Verifies in demo-path order.
- [ ] Records actual outcome per step.
- [ ] Stops at first failure.
- [ ] Cannot mark unverified items as PASS.
- [ ] Emits a one-line fix suggestion for the failing step.

## Failure modes

| Mode                              | Behavior                                              |
| --------------------------------- | ----------------------------------------------------- |
| Demo path empty                   | Refuse; ask user to run `scope-knife` first           |
| Step 1 already fails              | Stop, do not run step 2; report exact failing step    |
| No `plan.json` and no `demo_path` | Refuse; cannot verify without a path                  |
| Verification command missing      | Mark step `SKIP`; do not pretend it passed            |
| Diagnose regex finds no match     | Emit raw stderr signature + suggest a generic rebuild |

## Trigger phrases

- "will it work"
- "test the demo"
- "smoke test"
- "does it still run"
- "verify the path"
