#!/usr/bin/env bash
# run-integration.sh — exercises the end-to-end flow against a synthetic repo.
# This is the dogfood test: every skill in sequence.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> integration: full 36h flow on synthetic repo"
mkdir -p "$TMP/proj/src"
cat > "$TMP/proj/README.md" <<'EOF'
# Demo Repo
## Auth
## Profile
## Feed
## Search
## Notifications
## Export
EOF
touch "$TMP/proj/src/auth.ts" "$TMP/proj/src/profile.ts"

INV="$TMP/proj/inv.json"
python3 "$ROOT/skills/scope-knife/scripts/scan_repo.py" "$TMP/proj" > "$INV"

python3 "$ROOT/skills/scope-knife/scripts/classify.py" \
    --inventory "$INV" \
    --demo-goal "user logs in and edits their profile" \
    --time-remaining 360 \
    --out-dir "$TMP/proj/.hackathon" > /dev/null

test -f "$TMP/proj/.hackathon/state/plan.json" \
    || { echo "plan.json missing"; exit 1; }
test -f "$TMP/proj/.hackathon/artifacts/scope-knife-output.md" \
    || { echo "scope-knife-output.md missing"; exit 1; }
echo "  ✓ plan.json + scope-knife-output.md written"
echo "==> integration: PASSED"
