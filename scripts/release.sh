#!/usr/bin/env bash
# release.sh - prepare and tag a Hackathon Surgeon release locally.
#
# The actual npm publish + GitHub release happen in CI (.github/workflows/release.yml)
# once a v* tag is pushed. This script enforces the local preconditions and pushes
# the tag, so the workflow can take over from there.
#
# Usage:
#   bash scripts/release.sh                 # patch bump (e.g. 0.1.0 -> 0.1.1)
#   bash scripts/release.sh --minor        # 0.1.0 -> 0.2.0
#   bash scripts/release.sh --major        # 0.1.0 -> 1.0.0
#   bash scripts/release.sh --version 1.2.3
#   bash scripts/release.sh --dry-run      # do everything except push

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

cd "$ROOT"

step() { printf "\n==> %s\n" "$1"; }
die()  { printf "  ERROR: %s\n" "$1" >&2; exit 1; }

LEVEL="patch"
EXPLICIT=""
DRY_RUN=0
for arg in "$@"; do
    case "$arg" in
        --major) LEVEL="major" ;;
        --minor) LEVEL="minor" ;;
        --patch) LEVEL="patch" ;;
        --version) shift; EXPLICIT="${1:-}"; [ -n "$EXPLICIT" ] || die "--version requires a value" ;;
        --dry-run) DRY_RUN=1 ;;
        --help|-h)
            sed -n '2,18p' "$0"
            exit 0
            ;;
        *) printf "unknown arg: %s\n" "$arg" >&2; exit 2 ;;
    esac
done

step "preconditions"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not a git repo"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "main" ] || die "must be on main (currently on $BRANCH)"
[ -z "$(git status --porcelain)" ] || die "working tree is dirty; commit or stash first"
git fetch --quiet origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] || die "local main ($LOCAL) is behind origin/main ($REMOTE)"
node -v >/dev/null || die "node not found"
[ -f package.json ] || die "package.json missing"

step "compute next version"
CUR=$(node -p "require('./package.json').version")
if [ -n "$EXPLICIT" ]; then
    NEXT="$EXPLICIT"
else
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CUR"
    case "$LEVEL" in
        major) NEXT="$((MAJOR+1)).0.0" ;;
        minor) NEXT="${MAJOR}.$((MINOR+1)).0" ;;
        patch) NEXT="${MAJOR}.${MINOR}.$((PATCH+1))" ;;
    esac
fi
TAG="v${NEXT}"
echo "  $CUR -> $NEXT (tag $TAG)"

step "run tests + lint + build"
npm test
npm run lint
npm run format:check
npm run build

step "write CHANGELOG date placeholder if needed"
if grep -q "2025-XX-XX" CHANGELOG.md; then
    TODAY=$(date -u +%Y-%m-%d)
    if [ "$DRY_RUN" -eq 0 ]; then
        sed -i.bak "s/2025-XX-XX/${TODAY}/" CHANGELOG.md && rm CHANGELOG.md.bak
    fi
    echo "  set 0.1.0 release date to $TODAY"
fi

step "bump package.json version"
if [ "$DRY_RUN" -eq 0 ]; then
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.version = '$NEXT';
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    git add package.json CHANGELOG.md
    git commit -m "chore(release): $NEXT"
    git tag -a "$TAG" -m "$TAG"
fi

[ "$DRY_RUN" -eq 1 ] && {
    echo
    echo "DRY RUN: would push origin main + tag $TAG"
    exit 0
}

step "push main + tag"
git push origin main
git push origin "$TAG"

echo
echo "Released $TAG. CI will now publish to npm and create the GitHub release."