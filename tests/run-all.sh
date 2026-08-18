#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
bash "$HERE/run-acceptance.sh"
echo
bash "$HERE/run-integration.sh"
