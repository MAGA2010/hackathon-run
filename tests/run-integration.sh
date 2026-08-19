#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
BASH_TMP="$(mktemp -d)"
trap "rm -rf $BASH_TMP" EXIT

PY="${PYTHON:-python3}"
pass() { echo "  PASS $1"; }
fail() { echo "  FAIL $1"; exit 1; }
section() { echo; echo "## $1"; }

echo "==> integration: full 36h flow on synthetic repo"
REPO="$BASH_TMP/proj"
mkdir -p "$REPO/src/auth" "$REPO/src/notes"
touch "$REPO/src/auth/index.ts" "$REPO/src/notes/index.ts"
cat > "$REPO/README.md" <<EOF
# Demo Repo
Auth: sign in.
Notes: save a note.
Search: filter.
Export: download.
Notifications: alerts.
EOF

OUT="$REPO/.hackathon"
INV="$REPO/inv.json"
section "scope-knife"
"$PY" "$ROOT/skills/scope-knife/scripts/scan_repo.py" "$REPO" > "$INV"
"$PY" "$ROOT/skills/scope-knife/scripts/classify.py" \
    --inventory "$INV" --demo-goal "user signs in and saves a note" \
    --time-remaining 360 --out-dir "$OUT" >/dev/null
test -f "$OUT/state/plan.json" || fail "plan.json missing"
test -f "$OUT/artifacts/scope-knife-output.md" || fail "scope-knife-output.md missing"
pass "plan.json + scope-knife-output.md written"

section "demo-coach (60s)"
# (removed dead WIN_PLAN/WIN_TMP variables)
"$PY" "$ROOT/skills/demo-coach/scripts/coach.py" \
    --demo-goal "user signs in and saves a note" \
    --duration 60 --out-dir "$OUT" >/dev/null
test -f "$OUT/state/demo.json" || fail "demo.json missing"
pass "demo.json written"

section "judge-sim (uses plan + demo)"
"$PY" "$ROOT/skills/judge-sim/scripts/score.py" \
    --repo-root "$REPO" --out-dir "$OUT" >/dev/null
test -f "$OUT/state/review.json" || fail "review.json missing"
pass "review.json written"

section "ship-pack (final audit)"
"$PY" "$ROOT/skills/ship-pack/scripts/audit.py" \
    --repo-root "$REPO" --out-dir "$OUT" >/dev/null 2>&1 || true
test -f "$OUT/state/ship.json" || fail "ship.json missing"
pass "ship.json written"

section "all state files validate against schemas"
node "$ROOT/dist/cli/commands/validate.js" "$OUT/state"
pass "all schemas valid"

echo
echo "==> integration: PASSED"