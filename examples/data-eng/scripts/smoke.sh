#!/usr/bin/env bash
# Smoke-test the data-eng demo path.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=$(mktemp)
python3 src/etl.py --in data/sample.csv --out "$OUT"
echo "smoke ok: output at $OUT"
wc -l "$OUT"
