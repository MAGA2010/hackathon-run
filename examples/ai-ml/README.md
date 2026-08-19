# Example: AI/ML (text classifier)

A 36-hour-build example: a tiny rule-based text classifier wrapped in the
shape of a real ML project (package, CLI, eval report). The classifier
itself is intentionally trivial — the goal of the example is to show the
_shape_ of an ML project that a hackathon team would actually ship.

## Project structure

```
examples/ai-ml/
├── README.md
├── requirements.txt    # commented-out real deps; example runs on stdlib only
├── .env.example        # OPENAI_API_KEY template
├── src/
│   ├── __init__.py
│   ├── classifier.py   # rule-based classifier (question / command / statement)
│   └── train.py        # writes an eval.json artifact for fast-verify
└── scripts/
    └── smoke.sh        # imports sanity check + eval report
```

## Quick start

```bash
cd examples/ai-ml
bash scripts/smoke.sh
```

The smoke script:

1. imports the classifier and asserts three golden examples,
2. runs `python -m src.train` which writes
   `.hackathon/artifacts/eval.json`,
3. asserts the eval.json file exists.

## What the pack produced

### Plan (`plan.json`)

A 36-hour MVP focused on shipping the demo path. The model itself is a
stretch; the demo path is the live classifier demo.

### Demo script (`demo.json`)

`demo-coach` produced a 60-second script with one `core_action` step
where the user types a sentence and the classifier labels it in <100ms.

### Review (`review.json`)

`judge-sim` recommended:

- **FIX NOW**: add a confidence score to the classifier output
- **FIX LAST 10 MIN**: trim the eval set to 5 examples for the live demo

### Ship audit (`ship.json`)

`ship-pack` flagged that `.env.example` contains an OPENAI key slot —
acceptable as long as the real key is never committed.

## Lessons learned

- Keep the model explainable; the rule-based version was demo-safe and
  faster to ship than fine-tuning a transformer.
- The eval.json artifact pattern makes fast-verify able to assert on
  accuracy, not just on whether the script ran.
