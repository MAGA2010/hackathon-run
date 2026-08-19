#!/usr/bin/env bash
# test_judge_sim.sh
# All paths are POSIX. Python on Windows accepts forward slashes, so we don't
# need cygpath -w. This keeps the script portable between Git Bash on Windows
# and bash on Linux CI.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PY="${PYTHON:-python3}"
pass() { echo "  PASS $1"; }
fail() { echo "  [ERR] $1 (line $LINENO in test_judge_sim.sh)"; echo "  last command: $BASH_COMMAND"; exit 1; }

section() { echo; echo "## $1"; }

BASH_TMP="$(mktemp -d)"
trap "rm -rf $BASH_TMP" EXIT

REPO="$BASH_TMP/repo"
mkdir -p "$REPO"
echo '{"features":[],"demo_goal":"x","time_remaining_minutes":60,"demo_path":[],"next_tasks":[]}' > "$REPO/plan.json"
echo '{"version":"1.0","duration_seconds":60,"one_liner":"Sign up in 3 seconds.","steps":[]}' > "$REPO/demo.json"

section "Acceptance: provides per-dimension score"
OUT="$BASH_TMP/repo/.hackathon"
"$PY" "$ROOT/skills/judge-sim/scripts/score.py" --repo-root "$REPO" --out-dir "$OUT" >/dev/null
REVIEW="$OUT/state/review.json"
python3 -c "
import json
d = json.load(open(r'$REVIEW'))
assert len(d['dimensions']) == 7, len(d['dimensions'])
for x in d['dimensions']:
    assert 0 <= x['score'] <= 5
"
pass "7 dimensions scored 0-5"

section "Acceptance: deduction_reason present per dimension"
python3 -c "
import json
d = json.load(open(r'$REVIEW'))
for x in d['dimensions']:
    assert x['deduction_reason'], x['name']
"
pass "deduction_reason non-empty"

section "Acceptance: improvement suggestions per dimension"
python3 -c "
import json
d = json.load(open(r'$REVIEW'))
for x in d['dimensions']:
    assert isinstance(x['improvements'], list) and x['improvements'], x['name']
"
pass "improvements array non-empty"

section "Acceptance: fix priorities bucketed"
python3 -c "
import json
d = json.load(open(r'$REVIEW'))
fp = d['fix_priorities']
for k in ('fix_now','fix_last_10min','do_not_touch'):
    assert k in fp and isinstance(fp[k], list), k
"
pass "fix priorities split into 3 buckets"

section "Acceptance: caps dimensions at 3 when verify.json status is fail"
# Inject failing verify.json
VERIFY="$OUT/state/verify.json"
mkdir -p "$OUT/state"
echo '{"version":"1.0","started_at":"2025-01-01T00:00:00Z","status":"fail","steps":[]}' > "$VERIFY"
"$PY" "$ROOT/skills/judge-sim/scripts/score.py" --repo-root "$REPO" --out-dir "$OUT" >/dev/null
python3 -c "
import json
d = json.load(open(r'$REVIEW'))
assert d['verify_was_failing'] is True
for x in d['dimensions']:
    assert x['score'] <= 3, f'{x["name"]}={x["score"]}'
"
pass "all dimensions capped at 3 with failing verify"

section "Acceptance: outputs single overall score"
python3 -c "
import json
d = json.load(open(r'$REVIEW'))
overall = d['overall']
mean = sum(x['score'] for x in d['dimensions']) / len(d['dimensions'])
assert abs(overall - round(mean, 2)) < 0.01, f'{overall} vs {mean}'
"
pass "overall is mean of dimensions"

section "Acceptance: review.json validates against schema"
node "$ROOT/dist/cli/commands/validate.js" "$OUT/state" >/dev/null
pass "schema validation passes"

echo
echo "ALL judge-sim TESTS PASSED"
