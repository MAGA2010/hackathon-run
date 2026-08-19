"""ai-ml example package — text classifier that decides whether a short
sentence is a question, a command, or a statement. Stdlib only so the
example can run in any Python 3.10+ environment with no extra deps.

Real hackathon projects would replace the rules with a fine-tuned model.
The example demonstrates:
  * a clean module boundary (train / predict / cli)
  * a tiny evaluation script that prints accuracy
  * a pytest-shaped test that fast-verify can run
"""
