#!/usr/bin/env bash
# run-acceptance.sh — run every skill's acceptance test in isolation.
# Used by CI and by humans before pushing.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

PASS=0
FAIL=0
FAILED=()

for f in "$HERE/acceptance"/test_*.sh; do
    name=$(basename "$f" .sh)
    echo
    echo "==> $name"
    if bash "$f"; then
        PASS=$((PASS + 1))
    else
        FAIL=$((FAIL + 1))
        FAILED+=("$name")
    fi
done

echo
echo "================================="
echo "acceptance: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
    echo "failed:"
    for n in "${FAILED[@]}"; do echo "  - $n"; done
    exit 1
fi
