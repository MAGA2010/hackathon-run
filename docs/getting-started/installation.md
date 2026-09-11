# Installation

> **Install:** `npm install -g @hackathon-run/hackathon-run`, or run `npx @hackathon-run/hackathon-run init` in any project without a global install.

## Option A — npm global install (recommended)

```bash
npm install -g @hackathon-run/hackathon-run
```

Requires Node.js 20+ (LTS).

The Python-backed skills resolve Python in this order:

1. `PYTHON`
2. `python3`
3. `python`
4. `py -3` on Windows

Set `PYTHON` to an absolute `python.exe` path when the executable is not on
`PATH`. `hackathon doctor`, `hackathon flow`, and the evaluation lab use the
same resolver, so the selected executable and launcher arguments match across
Windows, Git Bash, WSL, and CI.

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
> The package name is `@hackathon-run/hackathon-run`; the binary is `hackathon`.
