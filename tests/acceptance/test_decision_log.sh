#!/usr/bin/env bash
# test_decision_log.sh — exercises decision-log acceptance criteria.
# Mapped 1:1 to the criteria in skills/decision-log/SKILL.md.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "  [OK] $1"; }
fail() { echo "  [ERR] $1 (line $LINENO in test_decision_log.sh)"; echo "  last command: $BASH_COMMAND"; exit 1; }

section() { echo; echo "## $1"; }

PY="${PYTHON:-python3}"
OUT="$TMP/.hackathon"

section "Acceptance: every entry has at, feature, classification, rationale"
"$PY" "$ROOT/skills/decision-log/scripts/log_decision.py" \
    --feature "Notifications" \
    --classification CUT \
    --rationale "Off demo path; removed for time." \
    --author alice \
    --out-dir "$OUT" > /dev/null
LOG="$OUT/state/decision-log.json"
test -f "$LOG" || fail "decision-log.json missing"
for field in at feature classification rationale; do
    grep -q "\"$field\"" "$LOG" || fail "entry missing required field: $field"
done
pass "entry has all required fields"

section "Acceptance: append mode never replaces existing entries"
"$PY" "$ROOT/skills/decision-log/scripts/log_decision.py" \
    --feature "Auth" \
    --classification KEEP \
    --rationale "Core demo path." \
    --author bob \
    --out-dir "$OUT" > /dev/null
COUNT=$(grep -c '"feature"' "$LOG" || true)
[ "$COUNT" -eq 2 ] || fail "expected 2 entries after two appends, got $COUNT"
pass "append preserved both entries ($COUNT total)"

section "Acceptance: classification is one of KEEP / CUT / DEFER / PIVOT"
grep -q '"classification": "KEEP"' "$LOG" || fail "KEEP entry missing"
grep -q '"classification": "CUT"' "$LOG" || fail "CUT entry missing"
if "$PY" "$ROOT/skills/decision-log/scripts/log_decision.py" \
    --feature "Bad" \
    --classification MAYBE \
    --rationale "not a real class" \
    --out-dir "$OUT" > /dev/null 2>&1; then
    fail "invalid classification should have been rejected"
fi
pass "invalid classification rejected"

section "Acceptance: transcript lists decisions newest-first"
ART="$OUT/artifacts/decision-log.md"
test -f "$ART" || fail "decision-log.md artifact missing"
FIRST=$(grep -m1 '^## ' "$ART")
case "$FIRST" in
    *KEEP*) pass "newest decision (Auth KEEP) listed first" ;;
    *) fail "expected newest decision first, got: $FIRST" ;;
esac

echo
echo "ALL decision-log TESTS PASSED"
