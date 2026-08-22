# Installation

> **Status:** `Option A` (npm global install) requires `@maga2010/hackathon-run` to be published on the npm registry.
> Until then, use `Option B` (run from source) or run `npx @maga2010/hackathon-run init` directly in any project — no install required.

## Option A — npm global install (recommended, post-publish)

```bash
npm install -g @maga2010/hackathon-run
```

Requires Node.js 20+ (LTS).

## Option B — Run from source

```bash
git clone https://github.com/MAGA2010/hackathon-run
cd hackathon-run
npm install
npm run build
node dist/cli/index.js init
```

## Option C — Use individual skills directly

You don't need the CLI to use a skill. Each skill is a folder with a
`SKILL.md` (read by your agent) and scripts you can call directly:

```bash
python3 skills/scope-knife/scripts/scan_repo.py .
python3 skills/scope-knife/scripts/classify.py \
    --inventory features.json \
    --demo-goal "user signs up" \
    --time-remaining 360 \
    --out-dir .hackathon
```

## Verify install

```bash
hackathon --version
hackathon list
hackathon doctor
```

You should see fifteen skills listed with their trigger phrase budgets.

> Note: after install, the CLI command is `hackathon` (not `hackathon-run`).
> The package name is `@maga2010/hackathon-run`; the binary is `hackathon`.
