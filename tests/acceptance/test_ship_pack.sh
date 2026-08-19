#!/usr/bin/env bash
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

# Repo A: clean repo with README
REPO_A="$BASH_TMP/clean"
mkdir -p "$REPO_A/src"
cat > "$REPO_A/README.md" <<EOF
# CleanApp
> **A demo that works.**

## Install
npm install
## Run
npm start
## Demo
1. Open
2. Click
## Tech Stack
Node, Postgres
## Environment
cp .env.example .env
EOF
echo '{"name":"clean","version":"1.0.0"}' > "$REPO_A/package.json"
echo "FOO=bar" > "$REPO_A/.env.example"

# Repo B: leaky repo with secrets
REPO_B="$BASH_TMP/leaky"
mkdir -p "$REPO_B/src"
cat > "$REPO_B/README.md" <<EOF
# LeakyApp
Quick start.
EOF
echo "API_KEY=\"sk-deadbeef0123456789abcdef\"" > "$REPO_B/src/config.ts"

section "Acceptance: clean repo yields clean=true"
"$PY" "$ROOT/skills/ship-pack/scripts/audit.py" --repo-root "$REPO_A" --out-dir "$REPO_A/.hackathon" >/dev/null
WIN_A="$WIN_TMP\\clean\\.hackathon\\state\\ship.json"
python3 -c "
import json
d = json.load(open(r'$WIN_A'))
assert d['secret_scan']['clean'] is True
"
pass "clean repo -> clean=true"

section "Acceptance: leaky repo yields clean=false"
# Expect non-zero exit code
if "$PY" "$ROOT/skills/ship-pack/scripts/audit.py" --repo-root "$REPO_B" --out-dir "$REPO_B/.hackathon" >/dev/null 2>&1; then
  fail "leaky repo should exit non-zero"
fi
WIN_B="$WIN_TMP\\leaky\\.hackathon\\state\\ship.json"
python3 -c "
import json
d = json.load(open(r'$WIN_B'))
assert d['secret_scan']['clean'] is False
assert len(d['secret_scan']['findings']) >= 1
"
pass "leaky repo -> clean=false, exit != 0"

section "Acceptance: README checks mark sections present"
python3 -c "
import json
d = json.load(open(r'$WIN_A'))
present = set(d['readme']['present'])
assert 'name' in present
assert 'install' in present
assert 'run' in present
assert 'demo' in present
assert 'env' in present
assert 'stack' in present
"
pass "all README sections detected"

section "Acceptance: checklist has passed and failed entries"
python3 -c "
import json
d = json.load(open(r'$WIN_A'))
assert 'passed' in d['checklist'] and 'failed' in d['checklist']
assert 'readme' in d['checklist']['passed']
"
pass "checklist split into passed/failed"

section "Acceptance: packaging command excludes secrets"
python3 -c "
import json
d = json.load(open(r'$WIN_A'))
cmd = d['packaging_command']
for token in ('.env', 'node_modules', 'dist', '.git', '--exclude'):
    assert token in cmd, f'missing {token}'
assert 'sk-' not in cmd and 'AKIA' not in cmd
"
pass "packaging command excludes secrets and build artifacts"

section "Acceptance: ship.json validates against schema"
node "$ROOT/dist/cli/commands/validate.js" "$REPO_A/.hackathon/state" >/dev/null
pass "schema validation passes"

echo
echo "ALL ship-pack TESTS PASSED"