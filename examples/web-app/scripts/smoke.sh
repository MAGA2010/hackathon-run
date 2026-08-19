#!/usr/bin/env bash
# Smoke-test the demo_path for the web-app example. Boots the dev server,
# hits each step in the plan, and tears it down.
#
# Requires: node, curl (or `bash` from Git for Windows / WSL / Linux / macOS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3210}"
node src/dev-server.mjs &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT
sleep 1

echo "-> step 1: landing"
curl -fsS "http://localhost:$PORT/" > /dev/null

echo "-> step 2: signup page"
curl -fsS "http://localhost:$PORT/signup" > /dev/null

echo "-> step 3: notes page"
curl -fsS "http://localhost:$PORT/notes" > /dev/null

echo "-> step 4: create a note via API"
curl -fsS -X POST -d "hello from web-app example" "http://localhost:$PORT/api/notes" | grep -q \"body\"

echo "-> health check"
curl -fsS "http://localhost:$PORT/api/health" | grep -q \"ok\":true\"

echo
echo "ALL DEMO STEPS PASS"
