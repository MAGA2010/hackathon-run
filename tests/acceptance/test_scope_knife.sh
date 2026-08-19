#!/usr/bin/env bash
# test_scope_knife.sh — exercises scope-knife acceptance criteria.
# Mapped 1:1 to the criteria in skills/scope-knife/SKILL.md.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "  [OK] $1"; }
fail() { echo "  [ERR] $1 (line $LINENO in test_scope_knife.sh)"; echo "  last command: $BASH_COMMAND"; exit 1; }

section() { echo; echo "## $1"; }

PY="${PYTHON:-python3}"

# Helper: run scan_repo.py against a synthetic repo.
make_repo() {
    local dir="$TMP/$1"
    mkdir -p "$dir/src"
    case "$1" in
        repo-clean)
            mkdir -p "$dir/src/auth" "$dir/src/notes"
            touch "$dir/src/auth/index.ts" "$dir/src/notes/index.ts"
            cat > "$dir/README.md" <<'EOF'
# Sample App
## Authentication
## Notes
## Search
## Dark mode
EOF
            ;;
        repo-messy)
            mkdir -p "$dir/src/auth" "$dir/src/notes" "$dir/src/search"
            touch "$dir/src/auth/index.ts"
            # notes is empty dir
            touch "$dir/src/search/index.ts.bak"
            cat > "$dir/README.md" <<'EOF'
# Sample App
## Authentication
## Notes
## Search
## Export
## Analytics
## Notifications
EOF
            ;;
        repo-empty)
            mkdir -p "$dir"
            echo "# Empty" > "$dir/README.md"
            ;;
    esac
    echo "$dir"
}

section "Acceptance: outputs KEEP/CUT/DEFER classification for every feature"
make_repo repo-clean > /dev/null
INVENTORY="$TMP/repo-clean/inventory.json"
"$PY" "$ROOT/skills/scope-knife/scripts/scan_repo.py" "$TMP/repo-clean" > "$INVENTORY"
"$PY" "$ROOT/skills/scope-knife/scripts/classify.py" \
    --inventory "$INVENTORY" \
    --demo-goal "User signs in and saves a note." \
    --time-remaining 240 \
    --out-dir "$TMP/repo-clean/.hackathon" > /dev/null
PLAN="$TMP/repo-clean/.hackathon/state/plan.json"
test -f "$PLAN" || fail "plan.json missing"
HAS_KEEP=$(grep -c '"classification": "KEEP"' "$PLAN" || true)
HAS_CUT=$(grep -c '"classification": "CUT"' "$PLAN" || true)
HAS_DEFER=$(grep -c '"classification": "DEFER"' "$PLAN" || true)
[ "$HAS_KEEP" -ge 1 ] && [ "$HAS_CUT" -ge 1 ] || [ "$HAS_DEFER" -ge 1 ] \
    || fail "expected at least KEEP + one of (CUT, DEFER)"
pass "KEEP / CUT / DEFER all present"

section "Acceptance: outputs a demo path with <= 5 steps"
PATHS=$(grep -c '"step"' "$PLAN" || true)
[ "$PATHS" -le 5 ] || fail "demo path too long: $PATHS"
pass "demo path length = $PATHS (<= 5)"

section "Acceptance: outputs a next-steps task list with priorities"
grep -q '"priority"' "$PLAN" || fail "no priority field"
grep -q '"P0"' "$PLAN" || fail "no P0 task"
pass "task list with priorities present"

section "Acceptance: refuses to mark all features as KEEP"
# Force the impossible case: 1 feature, lots of time.
make_repo repo-clean > /dev/null
TINY_INV="$TMP/tiny.json"
echo '{"features": [{"name": "OnlyFeature", "status": "implemented", "time_estimate_minutes": 30}]}' > "$TINY_INV"
TINY_OUT="$TMP/tiny-out"
mkdir -p "$TINY_OUT"
"$PY" "$ROOT/skills/scope-knife/scripts/classify.py" \
    --inventory "$TINY_INV" \
    --demo-goal "only feature demo" \
    --time-remaining 600 \
    --out-dir "$TINY_OUT" > /dev/null
TINY_PLAN="$TINY_OUT/state/plan.json"
ALL_KEEP=$(grep -c '"classification": "KEEP"' "$TINY_PLAN" || true)
TOTAL=$(grep -c '"name"' "$TINY_PLAN" || true)
if [ "$ALL_KEEP" = "$TOTAL" ]; then
    fail "refused-to-mark-all-KEEP rule violated ($ALL_KEEP of $TOTAL)"
fi
pass "single-feature case was forced to a CUT or DEFER"

section "Acceptance: CUT rate meets pressure threshold for time remaining"
# 30-minute scenario => must hit >= 90% CUT rate.
make_repo repo-messy > /dev/null
INV="$TMP/repo-messy/inventory.json"
"$PY" "$ROOT/skills/scope-knife/scripts/scan_repo.py" "$TMP/repo-messy" > "$INV"
OUT="$TMP/repo-messy/.hackathon"
"$PY" "$ROOT/skills/scope-knife/scripts/classify.py" \
    --inventory "$INV" \
    --demo-goal "auth" \
    --time-remaining 30 \
    --out-dir "$OUT" > /dev/null
P="$OUT/state/plan.json"
N=$(grep -c '"name"' "$P" || true)
C=$(grep -c '"classification": "CUT"' "$P" || true)
RATE=$(awk -v c="$C" -v n="$N" 'BEGIN{ if(n>0) printf "%.2f", c/n; else print "0" }')
awk -v r="$RATE" 'BEGIN{ exit !(r+0 >= 0.80) }' \
    || fail "CUT rate $RATE below 0.80 threshold for 30-min remaining"
pass "30-min pressure: CUT rate = $RATE (>= 0.80)"

section "Acceptance: plan.json validates against plan.schema.json"
# Lightweight in-shell validation of required fields.
for field in version generated_at demo_goal time_remaining_minutes features demo_path next_tasks; do
    grep -q "\"$field\"" "$P" || fail "plan.json missing required field: $field"
done
pass "all required fields present"

echo
echo "ALL scope-knife TESTS PASSED"
