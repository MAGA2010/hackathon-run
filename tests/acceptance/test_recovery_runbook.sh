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

echo
echo "ALL recovery-runbook TESTS PASSED"
