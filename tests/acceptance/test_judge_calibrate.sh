#!/usr/bin/env bash
# test_judge_calibrate.sh - exercise judge-calibrate against a real HTTP backend.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

node "$ROOT/scripts/run-judge-calibration.mjs"
echo "ALL judge-calibrate TESTS PASSED"
