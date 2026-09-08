#!/usr/bin/env bash
# test_prize_strategy.sh - exercises prize-strategy against string-style
# criteria plus multiple prizes (the shape real events hand to target.py).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "  PASS $1"; }
fail() { echo "  [ERR] $1 (line $LINENO in test_prize_strategy.sh)"; echo "  last command: $BASH_COMMAND"; exit 1; }
section() { echo; echo "## $1"; }

PY="${PYTHON:-python3}"
if command -v cygpath >/dev/null 2>&1; then
  win() { cygpath -m "$1"; }
else
  win() { printf '%s' "$1"; }
fi

section "Acceptance: picks sustainability for a waste-reduction demo"
cat > "$TMP/prizes.json" <<'EOF'
[
  {"name": "Best Sustainability", "criteria": "reduce waste sustainability impact circular measurable", "weight": 3},
  {"name": "Best AI Use", "criteria": "ai machine learning generative useful model", "weight": 2},
  {"name": "Best UX", "criteria": "design usability delight accessibility", "weight": 1}
]
EOF
cat > "$TMP/plan.json" <<'EOF'
{
  "version": "1.0",
  "demo_goal": "A student sees predicted surplus and prebooks one meal to reduce waste.",
  "features": [
    {"name": "AI Meal Prediction", "classification": "KEEP"},
    {"name": "Order Prebooking", "classification": "KEEP"}
  ],
  "stack": []
}
EOF
"$PY" "$ROOT/skills/prize-strategy/scripts/target.py" \
    --prizes "$TMP/prizes.json" \
    --project "$TMP/plan.json" \
    --team-skills python,javascript,react \
    --out-dir "$TMP/.hackathon" >/dev/null
PRIZE_STATE="$TMP/.hackathon/state/prize.json"
PRIZE_ARTIFACT="$TMP/.hackathon/artifacts/prize-strategy.md"
test -f "$PRIZE_STATE" || fail "prize.json missing"
test -f "$PRIZE_ARTIFACT" || fail "prize-strategy.md missing"
STATE_WIN="$(win "$PRIZE_STATE")"
"$PY" -c "
import json
d = json.load(open(r'$STATE_WIN', encoding='utf-8'))
assert d['target_prize']['name'] == 'Best Sustainability', d['target_prize']['name']
assert len(d['anti_targets']) == 2, len(d['anti_targets'])
assert d['positioning'], d['positioning']
"
pass "Best Sustainability selected and markdown artifact written"

echo
echo "ALL prize-strategy TESTS PASSED"
