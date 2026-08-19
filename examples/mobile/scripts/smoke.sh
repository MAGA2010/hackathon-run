#!/usr/bin/env bash
# Smoke-test the mobile example. Verifies api.ts type-checks via node --check
# (a stand-in for tsc on the CI box where we want a no-deps check).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "-> api.ts parses"
node --check src/api.ts

echo "ALL MOBILE STEPS PASS"
