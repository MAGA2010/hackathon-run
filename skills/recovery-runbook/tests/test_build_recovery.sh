#!/usr/bin/env bash
# Acceptance test for the build_recovery.py writer.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/skills/recovery-runbook/scripts/build_recovery.py"

if [ ! -f "$SCRIPT" ]; then
  echo "FAIL: missing script $SCRIPT"
  exit 1
fi

if ! command -v python3 >/dev/null; then
  echo "skip: python3 not on PATH"
  exit 0
fi

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/repo/.hackathon/state"

cat > "$TMP/repo/.hackathon/state/plan.json" <<'JSON'
{
  "version": "1.0",
  "generated_at": "2026-01-01T00:00:00Z",
  "demo_goal": "demo",
  "time_remaining_minutes": 60,
  "features": [],
  "demo_path": [
    {"step": 1, "action": "Open the app", "expected_outcome": "loads"}
  ],
  "next_tasks": []
}
JSON

python3 "$SCRIPT" --repo-root "$TMP/repo" --failure "API times out on submit" --severity P0 >/dev/null

if [ ! -f "$TMP/repo/.hackathon/state/recovery.json" ]; then
  echo "FAIL: did not write recovery.json"
  exit 1
fi

if [ ! -f "$TMP/repo/.hackathon/artifacts/recovery-runbook-output.md" ]; then
  echo "FAIL: did not write artifact"
  exit 1
fi

SCHEMA="$ROOT/src/state/schemas/recovery.schema.json"
STATE="$TMP/repo/.hackathon/state/recovery.json"
node --input-type=module -e "
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
const ajv = new Ajv({strict:false});
addFormats(ajv);
const schema = JSON.parse(readFileSync(process.argv[1], 'utf-8'));
const data = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
const v = ajv.compile(schema);
if (!v(data)) { console.error(JSON.stringify(v.errors,null,2)); process.exit(1); }
" "$SCHEMA" "$STATE"

echo "OK: recovery-runbook build_recovery acceptance test passed"
