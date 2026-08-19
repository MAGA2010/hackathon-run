"""No-op training script. A real model would fine-tune here.

For the example we just write a tiny eval report so fast-verify can
assert on it.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from .classifier import classify, Label

random.seed(0)

TRAIN = [
    ("do we ship today?", "question"),
    ("ship the demo now.", "command"),
    ("we shipped the demo.", "statement"),
    ("run the verify script.", "command"),
    ("the script ran in 3 seconds.", "statement"),
    ("verify the demo path?", "question"),
    ("cut the search feature.", "command"),
    ("we cut the search feature.", "statement"),
    ("fix the auth bug.", "command"),
    ("the auth bug is fixed.", "statement"),
    ("make a pitch deck.", "command"),
    ("what is the demo goal?", "question"),
    ("the goal is clear.", "statement"),
    ("build the billing flow.", "command"),
    ("billing is half-done.", "statement"),
]


def main() -> int:
    correct = 0
    for text, expected in TRAIN:
        predicted: Label = classify(text)
        if predicted == expected:
            correct += 1
    accuracy = correct / len(TRAIN)
    report_path = Path(__file__).resolve().parent.parent / ".hackathon" / "artifacts" / "eval.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps({"accuracy": accuracy, "n": len(TRAIN)}, indent=2))
    print(f"trained on {len(TRAIN)} examples; accuracy={accuracy:.2%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
