# judge-sim

Simulate a judge panel across seven dimensions and produce a prioritized fix list.

!!! info "When to invoke"
Run after demo-coach produces a script and fast-verify confirms the demo path.
Repeat after each `fix_now` item is closed.

## Inputs

| Field                        | Type | Required | Description                                       |
| ---------------------------- | ---- | -------- | ------------------------------------------------- |
| `.hackathon/state/demo.json` | file | required | the pitch script under evaluation                 |
| `.hackathon/state/plan.json` | file | required | demo path and KEEP list coverage                  |
| `HACKATHON_JUDGE_BACKEND`    | URL  | optional | typed HTTP LLM judge; heuristic fallback on error |

## Outputs

- `.hackathon/state/review.json` with seven 0-5 dimension scores, overall,
  fix priorities, judge source, protocol, and average confidence when an LLM
  judge is used.
- `.hackathon/artifacts/judge-sim-output.md`.

## LLM judge protocol v2

Requests include an explicit per-dimension rubric, machine evidence, and
constraints. Responses must provide a rationale, confidence, and evidence per
dimension. Use a judge model that is separate from the implementation model.
Older order-based v1 responses remain accepted.

```bash
hackathon judge-calibrate \
  --backend https://judge.example.test \
  --golden tests/fixtures/judge-golden.json
```

## Acceptance criteria

- [ ] Seven dimensions are scored from 0 to 5.
- [ ] Every dimension has a deduction reason and questions.
- [ ] `verify.json.status == "fail"` caps every score at 3.
- [ ] v2 responses include rationale, confidence, and evidence.
- [ ] review.json validates against review.schema.json.
