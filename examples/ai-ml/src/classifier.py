"""A tiny rule-based text classifier used as the ai-ml demo model.

Predicts one of: question, command, statement.

The classifier is intentionally trivial — the goal of the example is to
show the shape of an ml project, not to ship a real model. A real
hackathon would replace this with scikit-learn / transformers.
"""
from __future__ import annotations

import re
from typing import Literal

Label = Literal["question", "command", "statement"]

_QUESTION_END = re.compile(r"\?\s*$")
_IMPERATIVE_STARTS = ("do ", "make ", "run ", "build ", "ship ", "cut ", "verify ", "fix ")


def classify(text: str) -> Label:
    """Classify a single text into question / command / statement."""
    s = text.strip().lower()
    if not s:
        raise ValueError("text must not be empty")
    if _QUESTION_END.search(s):
        return "question"
    if s.startswith(_IMPERATIVE_STARTS):
        return "command"
    return "statement"


def classify_batch(texts: list[str]) -> list[Label]:
    return [classify(t) for t in texts]
