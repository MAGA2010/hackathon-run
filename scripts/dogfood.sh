#!/usr/bin/env bash
# dogfood.sh - run Hackathon Surgeon against its own repo.
#
# Usage:
#   bash scripts/dogfood.sh            # full run, exit non-zero on any failure
#   bash scripts/dogfood.sh --plan     # only run scope-knife to update .hackathon/
#
# This is a manual smoke test. CI does not depend on it; it exists so the
# maintainers can verify the skills still work on the canonical example.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PY="${PYTHON:-python3}"

cd "$ROOT"

step() { printf "\n==> %s\n" "$1"; }
fail() { printf "  FAIL: %s\n" "$1" >&2; exit 1; }
pass() { printf "  ok: %s\n" "$1"; }

PLAN_ONLY=0
for arg in "$@"; do
    case "$arg" in
        --plan) PLAN_ONLY=1 ;;
        --help|-h)
            sed -n '2,12p' "$0"
            exit 0
            ;;
        *) printf "unknown arg: %s\n" "$arg" >&2; exit 2 ;;
    esac
done

step "scope-knife on hackathon-surgeon itself"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
INV="$TMP/inv.json"
"$PY" "$ROOT/skills/scope-knife/scripts/scan_repo.py" "$ROOT" > "$INV" \
    || fail "scan_repo.py failed"
"$PY" "$ROOT/skills/scope-knife/scripts/classify.py" \
    --inventory "$INV" \
    --demo-goal "user runs scope-knife end to end" \
    --time-remaining 360 \
    --out-dir "$ROOT/.hackathon" \
    || fail "classify.py failed"
pass "plan.json regenerated"
test -f "$ROOT/.hackathon/state/plan.json" || fail "plan.json missing"
test -f "$ROOT/.hackathon/artifacts/scope-knife-output.md" || fail "scope-knife-output.md missing"

[ "$PLAN_ONLY" -eq 1 ] && exit 0

step "validate generated state against schemas"
npm run --silent build >/dev/null
npm run --silent validate -- ".hackathon/state" \
    || fail "schema validation failed"
pass "schemas valid"

step "trigger match smoke test"
node -e '
    import("./dist/harness/loader.js").then(async ({ loadAllSkills }) => {
        const { matchSkill } = await import("./dist/harness/trigger.js");
        const skills = loadAllSkills(process.cwd());
        const r = matchSkill("we have too many features and the demo is in 2 hours", skills);
        if (!r.skill) { console.error("no skill matched"); process.exit(1); }
        console.log("matched:", r.skill.frontmatter.name, "score=" + r.score);
    }).catch((e) => { console.error(e); process.exit(1); });
' || fail "trigger match smoke failed"

printf "\nALL DOGFOOD CHECKS PASSED\n"