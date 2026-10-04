#!/usr/bin/env bash
# test_recovery_runbook.sh
# Script argv paths are auto-converted by MSYS. Inline Python -c strings are not, so
# use cygpath -m for paths embedded in inline Python. This keeps the script portable
# and bash on Linux CI.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PY="${PYTHON:-python3}"
pass() { echo "  PASS $1"; }
fail() { echo "  [ERR] $1 (line $LINENO in test_recovery_runbook.sh)"; echo "  last command: $BASH_COMMAND"; exit 1; }

section() { echo; echo "## $1"; }

BASH_TMP="$(mktemp -d)"
trap "rm -rf $BASH_TMP" EXIT
if command -v cygpath >/dev/null 2>&1; then
  win() { cygpath -m "$1"; }
else
  win() { printf '%s' "$1"; }
fi

OUT="$BASH_TMP/out"

section "Acceptance: emits fallback plan per severity"
for sev in P0 P1 P2 P3; do
  "$PY" "$ROOT/skills/recovery-runbook/scripts/fallback.py" \
    --failure "test failure" --severity "$sev" --out-dir "$OUT/$sev" >/dev/null
done
test -f "$OUT/P0/artifacts/recovery-runbook.md" || fail "P0 missing"
test -f "$OUT/P3/artifacts/recovery-runbook.md" || fail "P3 missing"
pass "fallback for every severity"

section "Acceptance: 30-second script fits within 30s + 5s slack"
for sev in P0 P1 P2 P3; do
  md="$OUT/$sev/artifacts/recovery-runbook.md"
  md_win="$(win "$md")"
  "$PY" -c "
import re, sys
text = open(r'$md_win').read()
m = re.search(r'Total: (\d+)s', text)
total = int(m.group(1))
sev = '$sev'
assert total <= 35, f'{sev}: {total}s exceeds budget'
print('  ok ' + sev + '=' + str(total) + 's')
"
done
pass "all severities fit"

section "Acceptance: provides DO / SAY / NOT for the failure"
MD_P0="$OUT/P0/artifacts/recovery-runbook.md"
grep -q "DO\*\*:" "$MD_P0" || fail "missing DO"
grep -q "SAY\*\*:" "$MD_P0" || fail "missing SAY"
grep -q "NOT\*\*:" "$MD_P0" || fail "missing NOT"
pass "DO / SAY / NOT present"

section "Acceptance: includes off-stage recovery steps"
grep -q "lsof" "$MD_P0" || fail "missing port check"
grep -q ".env" "$MD_P0" || fail "missing env check"
pass "recovery steps included"

section "Acceptance: prioritizes demo continuity over debugging"
grep -q "Do not debug" "$MD_P0" || fail "missing anti-debug guidance"
pass "no-live-debugging rule honored"

section "Acceptance: recovery.json is valid JSON"
REC="$OUT/P0/state/recovery.json"
REC_WIN="$(win "$REC")"
"$PY" -c "
import json
d = json.load(open(r'$REC_WIN'))
assert d['severity'] == 'P0'
assert 'fallback' in d
assert 'script' in d
"
pass "recovery.json well-formed"

section "Acceptance: recovery runbook absorbs verify and rehearsal evidence"
EVIDENCE="$BASH_TMP/evidence"
mkdir -p "$EVIDENCE/state"
cat > "$EVIDENCE/state/verify.json" <<'EOF'
{
  "version": "1.0",
  "started_at": "2026-10-04T00:00:00Z",
  "status": "fail",
  "steps": [
    {
      "step": 1,
      "action": "open app",
      "status": "fail",
      "error_signature": "connection refused",
      "diagnosis": {"likely_cause": "server down", "minimal_fix": "npm run dev"}
    }
  ]
}
EOF
cat > "$EVIDENCE/state/rehearsal.json" <<'EOF'
{
  "version": "1.0",
  "started_at": "2026-10-04T00:00:00Z",
  "target_total_seconds": 60,
  "segments": [],
  "risks": [
    {
      "step": 2,
      "action": "save note",
      "class": "broken",
      "overrun_seconds": 12,
      "recommendation": "rewrite the step and cut one sentence"
    }
  ],
  "fixes": []
}
EOF
"$PY" "$ROOT/skills/recovery-runbook/scripts/fallback.py" \
  --failure "test evidence failure" --severity P1 --out-dir "$EVIDENCE" >/dev/null
EVIDENCE_REC="$EVIDENCE/state/recovery.json"
EVIDENCE_REC_WIN="$(win "$EVIDENCE_REC")"
"$PY" -c "
import json
d = json.load(open(r'$EVIDENCE_REC_WIN'))
assert len(d['evidence']) == 2, d
assert d['evidence'][0]['source'] == 'fast-verify'
assert any('open app' in step for step in d['recovery_steps'])
assert any('save note' in step for step in d['recovery_steps'])
"
pass "evidence loop populated recovery steps"

echo
echo "ALL recovery-runbook TESTS PASSED"
