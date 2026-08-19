#!/usr/bin/env bash
# test_demo_coach.sh
# Use cygpath -w so Python (which sees Windows paths) can find files
# written by the same Python invoked from this Bash script.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PY="${PYTHON:-python3}"
pass() { echo "  PASS $1"; }
fail() { echo "  FAIL $1"; exit 1; }
section() { echo; echo "## $1"; }

BASH_TMP="$(mktemp -d)"
if command -v cygpath >/dev/null 2>&1; then
  WIN_TMP="$(cygpath -w "$BASH_TMP")"
else
  WIN_TMP="$BASH_TMP"  # POSIX path on Linux CI
fi
trap "rm -rf $BASH_TMP" EXIT

run_coach() {
  local dur="$1"
  local bash_out="$BASH_TMP/dc-$dur"
  local win_out="$WIN_TMP\\dc-$dur"
  mkdir -p "$bash_out"
  "$PY" "$ROOT/skills/demo-coach/scripts/coach.py" \
    --demo-goal "user signs up" --duration "$dur" \
    --out-dir "$bash_out" >/dev/null
  # echo the bash path; tests use cygpath-wrapped paths for Python.
  echo "$bash_out|$win_out"
}

section "Acceptance: fits within specified duration"
for d in 30 60 90; do
  pair=$(run_coach "$d")
  win_path="${pair##*|}"
  win_path="${win_path}\\state\\demo.json"
  python3 -c "
import json
d = json.load(open(r'$win_path'))
budget = {30: 30, 60: 60, 90: 90}[$d]
total = sum(s['max_seconds'] for s in d['steps'])
assert total <= budget, f'{total} > {budget}'
"
done
pass "all durations fit"

section "Acceptance: each step has SAY/CLICK/SHOW/NOT"
pair=$(run_coach 60)
win_path="${pair##*|}\\state\\demo.json"
python3 -c "
import json
d = json.load(open(r'$win_path'))
for s in d['steps']:
    for k in ('say','click','show','not'):
        assert k in s and s[k], f'missing {k} in {s[\"name\"]}'
"
pass "every step has SAY/CLICK/SHOW/NOT"

section "Acceptance: emits 6 canonical steps in order"
python3 -c "
import json
d = json.load(open(r'$win_path'))
names = [s['name'] for s in d['steps']]
assert names == ['opening','pain','product','core_action','result','close'], names
"
pass "6 canonical steps in order"

section "Acceptance: one-liner is <= 21 words"
python3 -c "
import json
d = json.load(open(r'$win_path'))
n = len(d['one_liner'].split())
assert n <= 21, f'one-liner too long: {n} words'
"
pass "one-liner length bounded"

section "Acceptance: risks array present on every step"
python3 -c "
import json
d = json.load(open(r'$win_path'))
for s in d['steps']:
    assert isinstance(s['risks'], list)
"
pass "risks array on every step"

section "Acceptance: demo.json validates against schema"
# Use the bash path so validate.js (Node) can find it too.
node "$ROOT/dist/cli/commands/validate.js" "${pair%%|*}/state" >/dev/null
[ $? -eq 0 ] || fail "schema validation"
pass "schema validation passes"

section "Acceptance: emits a printable markdown card"
test -f "${pair%%|*}/artifacts/demo-script.md" || fail "demo-script.md missing"
grep -q "Demo script" "${pair%%|*}/artifacts/demo-script.md" || fail "markdown missing header"
pass "printable markdown card written"

echo
echo "ALL demo-coach TESTS PASSED"