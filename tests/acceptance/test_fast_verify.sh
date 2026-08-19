#!/usr/bin/env bash
# test_fast_verify.sh — exercises fast-verify acceptance criteria.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PY="${PYTHON:-python3}"

pass() { echo "  [OK] $1"; }
fail() { echo "  [ERR] $1"; exit 1; }
section() { echo; echo "## $1"; }

section "Acceptance: verify_step.py classifies a passing command"
OUT=$("$PY" "$ROOT/skills/fast-verify/scripts/verify_step.py" --command "echo hello" 2>&1 || true)
echo "$OUT" | grep -q '"status": "pass"' || fail "echo should pass"
pass "echo classified as pass"

section "Acceptance: verify_step.py classifies a failing command"
OUT=$("$PY" "$ROOT/skills/fast-verify/scripts/verify_step.py" --command "exit 1" 2>&1 || true)
echo "$OUT" | grep -q '"status": "fail"' || fail "exit 1 should fail"
pass "exit 1 classified as fail"

section "Acceptance: verify_step.py captures error signature"
TMPJS="$(mktemp --suffix=.js)"; echo "throw new Error(\"Cannot find module foo\");" > "$TMPJS"; OUT=$("$PY" "$ROOT/skills/fast-verify/scripts/verify_step.py" --command "node $TMPJS" 2>&1 || true); rm -f "$TMPJS"
echo "$OUT" | grep -q "Cannot find module" || fail "did not capture signature"
pass "error signature captured"

section "Acceptance: diagnose.py matches connection refused"
OUT=$("$PY" "$ROOT/skills/fast-verify/scripts/diagnose.py" --signature "curl: (7) Failed to connect to localhost port 3000" 2>&1)
echo "$OUT" | grep -q "Dev server not started" || fail "diagnose missed connection-refused"
pass "connection-refused diagnosed"

section "Acceptance: diagnose.py handles unknown pattern"
OUT=$("$PY" "$ROOT/skills/fast-verify/scripts/diagnose.py" --signature "completely novel error xyz123" 2>&1)
echo "$OUT" | grep -q "Unknown failure pattern" || fail "should return generic for unknown"
pass "unknown pattern returns generic"

section "Acceptance: timeout returns non-zero"
OUT=$("$PY" "$ROOT/skills/fast-verify/scripts/verify_step.py" --command "sleep 5" --timeout 1 2>&1 || true)
echo "$OUT" | grep -q '"status": "fail"' || fail "timeout should be failure"
pass "timeout classified as fail"

echo
echo "ALL fast-verify TESTS PASSED"
