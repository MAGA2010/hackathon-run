#!/usr/bin/env bash
# test_v16_pulse.sh - v1.6 time awareness + rehearsal evidence loop.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PY="${PYTHON:-python3}"
pass() { echo "  PASS $1"; }
fail() { echo "  [ERR] $1 (line $LINENO in test_v16_pulse.sh)"; exit 1; }

section() { echo; echo "## $1"; }

TMP="$(mktemp -d)"
trap "rm -rf $TMP" EXIT
if command -v cygpath >/dev/null 2>&1; then
  win() { cygpath -m "$1"; }
else
  win() { printf '%s' "$1"; }
fi

mkdir -p "$TMP/.hackathon/state"
cat > "$TMP/.hackathon/state/plan.json" <<'EOF'
{
  "version": "1.0",
  "generated_at": "2026-10-04T00:00:00Z",
  "demo_goal": "sign in and save a note",
  "time_remaining_minutes": 240,
  "features": [],
  "demo_path": [
    {"step": 1, "action": "open app", "expected_outcome": "landing page"},
    {"step": 2, "action": "save note", "expected_outcome": "note saved"}
  ],
  "next_tasks": []
}
EOF

section "v1.6: time-box emits a live, schema-valid schedule"
"$PY" "$ROOT/skills/time-box/scripts/compute.py" \
  --time-remaining 240 --team-size 4 --current-stage build \
  --elapsed 20 --buffer 90 --out-dir "$TMP/.hackathon" >/dev/null
node "$ROOT/dist/cli/index.js" validate "$TMP/.hackathon/state" >/dev/null
TIME_WIN="$(win "$TMP/.hackathon/state/time-box.json")"
"$PY" -c "
import json
d = json.load(open(r'$TIME_WIN'))
assert d['deadline_at'] > d['generated_at']
assert d['current_stage_budget_minutes'] > 0
assert d['schedule'][0]['alarm_at_minutes']
"
pass "live deadline and alarms written"

section "v1.6: rehearsal writes schema-valid risk evidence"
"$PY" "$ROOT/skills/demo-rehearsal/scripts/rehearse.py" \
  --cwd "$TMP" --target-total-seconds 60 --dry-run >/dev/null
node "$ROOT/dist/cli/index.js" validate "$TMP/.hackathon/state" >/dev/null
REHEARSAL_WIN="$(win "$TMP/.hackathon/state/rehearsal.json")"
"$PY" -c "
import json
d = json.load(open(r'$REHEARSAL_WIN'))
risks = {r['step']: r for r in d['risks']}
assert 'step 1' in risks[1]['recommendation']
assert 'step 2' in risks[2]['recommendation']
assert risks[1]['recommendation'] != risks[2]['recommendation']
"
pass "rehearsal evidence validates"

section "v1.6: status exposes the combined pulse"
node "$ROOT/dist/cli/index.js" status --json -C "$TMP" > "$TMP/status.json"
STATUS_WIN="$(win "$TMP/status.json")"
"$PY" -c "
import json
d = json.load(open(r'$STATUS_WIN'))
p = d['pulse']
assert p['available'] is True
assert p['stage']['stage'] == 'build'
assert p['rehearsal']['available'] is True
assert p['rehearsal']['broken_steps'] > 0
assert p['recovery_evidence']['suggested_severity'] == 'P2'
"
pass "pulse combines time, rehearsal, and recovery risk"

echo
echo "ALL v1.6 pulse TESTS PASSED"
