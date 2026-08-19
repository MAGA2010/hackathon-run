#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PY="${PYTHON:-python3}"
pass() { echo "  PASS $1"; }
fail() { echo "  [ERR] $1 (line $LINENO in test_recovery_runbook.sh)"; echo "  last command: $BASH_COMMAND"; exit 1; }

section() { echo; echo "## $1"; }

BASH_TMP="$(mktemp -d)"
if command -v cygpath >/dev/null 2>&1; then
  WIN_TMP="$(cygpath -w "$BASH_TMP")"
else
  WIN_TMP="$BASH_TMP"  # POSIX path on Linux CI
fi
trap "rm -rf $BASH_TMP" EXIT

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
  win_md="$WIN_TMP\\out\\$sev\\artifacts\\recovery-runbook.md"
  python3 -c "
import re, sys
text = open(r'$win_md').read()
m = re.search(r'Total: (\d+)s', text)
total = int(m.group(1))
sev = '$sev'
assert total <= 35, f'{sev}: {total}s exceeds budget'
print('  ok ' + sev + '=' + str(total) + 's')
"
done
pass "all severities fit"

section "Acceptance: provides DO / SAY / NOT for the failure"
WIN_P0="$WIN_TMP\\out\\P0\\artifacts\\recovery-runbook.md"
grep -q "DO\*\*:" "$WIN_P0" || fail "missing DO"
grep -q "SAY\*\*:" "$WIN_P0" || fail "missing SAY"
grep -q "NOT\*\*:" "$WIN_P0" || fail "missing NOT"
pass "DO / SAY / NOT present"

section "Acceptance: includes off-stage recovery steps"
grep -q "lsof" "$WIN_P0" || fail "missing port check"
grep -q ".env" "$WIN_P0" || fail "missing env check"
pass "recovery steps included"

section "Acceptance: prioritizes demo continuity over debugging"
grep -q "Do not debug" "$WIN_P0" || fail "missing anti-debug guidance"
pass "no-live-debugging rule honored"

section "Acceptance: recovery.json is valid JSON"
WIN_REC="$WIN_TMP\\out\\P0\\state\\recovery.json"
python3 -c "
import json
d = json.load(open(r'$WIN_REC'))
assert d['severity'] == 'P0'
assert 'fallback' in d
assert 'script' in d
"
pass "recovery.json well-formed"

echo
echo "ALL recovery-runbook TESTS PASSED"
