#!/usr/bin/env bash
# test_demo_coach.sh
# Script argv paths are auto-converted by MSYS. Inline Python -c strings are not, so
# use cygpath -m for paths embedded in inline Python. This keeps the script portable
# and bash on Linux CI.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PY="${PYTHON:-python3}"
pass() { echo "  PASS $1"; }
fail() { echo "  [ERR] $1 (line $LINENO in test_demo_coach.sh)"; echo "  last command: $BASH_COMMAND"; exit 1; }

section() { echo; echo "## $1"; }

BASH_TMP="$(mktemp -d)"
trap "rm -rf $BASH_TMP" EXIT
win() { cygpath -m "$1"; }

run_coach() {
  local dur="$1"
  local out_dir="$BASH_TMP/dc-$dur"
  mkdir -p "$out_dir"
  "$PY" "$ROOT/skills/demo-coach/scripts/coach.py" \
    --demo-goal "user signs up" --duration "$dur" \
    --out-dir "$out_dir" >/dev/null
  echo "$out_dir"
}

section "Acceptance: fits within specified duration"
for d in 30 60 90; do
  out_dir=$(run_coach "$d")
  json_path="$out_dir/state/demo.json"
  json_win="$(win "$json_path")"
  python3 -c "
import json
d = json.load(open(r'$json_win'))
budget = {30: 30, 60: 60, 90: 90}[$d]
total = sum(s['max_seconds'] for s in d['steps'])
assert total <= budget, f'{total} > {budget}'
"
done
pass "all durations fit"

section "Acceptance: each step has SAY/CLICK/SHOW/NOT"
out_dir=$(run_coach 60)
json_path="$out_dir/state/demo.json"
  json_win="$(win "$json_path")"
python3 -c "
import json
d = json.load(open(r'$json_win'))
for s in d['steps']:
    for k in ('say','click','show','not'):
        assert k in s and s[k], f'missing {k} in {s["name"]}'
"
pass "every step has SAY/CLICK/SHOW/NOT"

section "Acceptance: emits 6 canonical steps in order"
python3 -c "
import json
d = json.load(open(r'$json_win'))
names = [s['name'] for s in d['steps']]
assert names == ['opening','pain','product','core_action','result','close'], names
"
pass "6 canonical steps in order"

section "Acceptance: one-liner is <= 21 words"
python3 -c "
import json
d = json.load(open(r'$json_win'))
n = len(d['one_liner'].split())
assert n <= 21, f'one-liner too long: {n} words'
"
pass "one-liner length bounded"

section "Acceptance: risks array present on every step"
python3 -c "
import json
d = json.load(open(r'$json_win'))
for s in d['steps']:
    assert isinstance(s['risks'], list)
"
pass "risks array on every step"

section "Acceptance: demo.json validates against schema"
node "$ROOT/dist/cli/index.js" validate "$out_dir/state" >/dev/null
[ $? -eq 0 ] || fail "schema validation"
pass "schema validation passes"

section "Acceptance: emits a printable markdown card"
test -f "$out_dir/artifacts/demo-script.md" || fail "demo-script.md missing"
grep -q "Demo script" "$out_dir/artifacts/demo-script.md" || fail "markdown missing header"
pass "printable markdown card written"

echo
echo "ALL demo-coach TESTS PASSED"
