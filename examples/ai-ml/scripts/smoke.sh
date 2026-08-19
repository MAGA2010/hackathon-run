#!/usr/bin/env bash
# Smoke-test the ai-ml example. Runs the classifier + training report.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v python3 >/dev/null; then
  echo "python3 not on PATH; skipping ai-ml smoke test" >&2
  exit 0
fi

echo "-> import sanity"
python3 -c "from src.classifier import classify; assert classify("do we ship?") == "question"; assert classify("ship it.") == "command"; assert classify("we shipped.") == "statement"; print("ok")"

echo "-> training report"
python3 -m src.train
test -f .hackathon/artifacts/eval.json

echo "ALL AI-ML STEPS PASS"
