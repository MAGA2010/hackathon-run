# Skills

Each skill is a self-contained `SKILL.md` plus, where helpful, Python scripts and
references. Skills are designed to be invoked by an agent that reads the
SKILL.md, runs the scripts, and writes the state file at the path the contract
specifies.

| Skill                                   | One-line summary                                        | Output state    |
| --------------------------------------- | ------------------------------------------------------- | --------------- |
| [idea-clarify](idea-clarify.md)         | Surface a one-paragraph brief into a concrete demo goal | (artifact only) |
| [scope-knife](scope-knife.md)           | Force a KEEP/CUT/DEFER decision on every feature        | `plan.json`     |
| [fast-verify](fast-verify.md)           | Run each `demo_path` step end-to-end                    | `verify.json`   |
| [demo-coach](demo-coach.md)             | Generate a 30/60/90-second pitch script                 | `demo.json`     |
| [judge-sim](judge-sim.md)               | Simulate a judge panel + score                          | `review.json`   |
| [ship-pack](ship-pack.md)               | Final ship audit (secrets, README, packaging)           | `ship.json`     |
| [recovery-runbook](recovery-runbook.md) | Detect a 2am-class failure and emit a runbook           | `recovery.json` |
| [pivot](pivot.md)                       | Re-run scope-knife after a mid-build direction change   | (artifact only) |

## How to read each page

Every skill page has the same six sections:

1. **Inputs** — required and optional fields, with types
2. **Outputs** — files produced (state + artifacts)
3. **Example** — a concrete input/output pair
4. **Trigger phrases** — utterances that should invoke the skill
5. **Acceptance criteria** — what counts as a successful run
6. **Failure modes** — how the skill reacts to common problems

## State machine

```
   empty ──idea-clarify──> vague ──scope-knife──> scoping ──fast-verify──> verifying
                                                                       │
                                                                 demo-coach
                                                                       │
                                                                       ▼
                                                                 demoing ──judge-sim──> judging
                                                                       │
                                                              ship-pack│
                                                                       ▼
                                                                 complete
                                                                       │
                                                          recovery-runbook (any time)
                                                                       │
                                                                   pivot (any time after plan.json exists)
```

Use [`hackathon status`](../architecture/overview.md) to see where you are in
this state machine, or [`hackathon flow`](../getting-started/quickstart.md) to get the exact commands for the
next stage.
