#!/usr/bin/env python3
"""
scan_repo.py — inventory a repository's feature surface.

Reads common project files (README, package.json, pyproject.toml, etc.) and
emits a list of candidate features with status inferred from file presence.

Status legend:
    implemented      Code exists, tests pass (or no tests yet — best-effort)
    half-implemented Code exists but incomplete or tests failing
    unimplemented    Only mentioned in README / plan
    broken           Was working, now failing (heuristic: tests/ exists but
                     no recent green run is detectable)

The output is intentionally heuristic. The classify.py script will turn this
into a KEEP/CUT/DEFER decision via the scope-knife skill.
"""
from __future__ import annotations
import sys as _sys
_sys.stdout.reconfigure(encoding='utf-8')
_sys.stderr.reconfigure(encoding='utf-8')

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable

# Files that hint at a feature being implemented (subset, not exhaustive).
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
            ".kt", ".swift", ".rb", ".php", ".cs", ".cpp", ".c", ".h"}

# Directories that strongly suggest implemented code.
CODE_DIRS = {"src", "lib", "app", "pkg", "internal", "cmd", "core"}

# Patterns to harvest feature hints from docs / configs.
HINT_PATTERNS = [
    re.compile(r"^#{1,6}\s+(.+)$", re.M),          # markdown headings
    re.compile(r"^\s*[-*]\s+(.+)$", re.M),         # bullets
    re.compile(r"\"([^\"]+)\"\s*:\s*\{", re.M),    # package.json keys
    re.compile(r"^([A-Za-z][\w-]{2,})\s*=", re.M), # env keys
]

# A short blacklist of non-feature headings.
NOISE = {
    "table of contents", "installation", "license", "contributing",
    "code of conduct", "support", "acknowledgments", "overview",
    "introduction", "getting started", "usage", "configuration",
    "api", "tests", "deployment", "build", "scripts", "dependencies",
    "authors", "version", "changelog",
}


def walk(root: Path) -> Iterable[Path]:
    skip = {".git", "node_modules", "dist", "build", "__pycache__",
            ".venv", "venv", ".next", ".cache", ".hackathon", "skills"}
    for p in root.rglob("*"):
        if any(part in skip for part in p.parts):
            continue
        if p.is_file():
            yield p


def has_code_signal(root: Path) -> set[str]:
    """Return set of feature hints with strong code presence."""
    hints: set[str] = set()
    for p in walk(root):
        if p.suffix.lower() in CODE_EXT:
            # Use the file's parent dir as a feature bucket.
            bucket = p.parent.name
            if bucket in CODE_DIRS or bucket.startswith(("test_", "spec_")):
                hints.add(bucket)
            else:
                hints.add(p.stem)
    return hints


def harvest_hints(root: Path) -> list[str]:
    """Pull candidate feature names out of docs and configs."""
    hints: set[str] = set()
    docs = ["README.md", "README.rst", "README.txt", "PLAN.md", "TODO.md",
            "package.json", "pyproject.toml", "Cargo.toml", "go.mod"]
    for name in docs:
        p = root / name
        if not p.exists():
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pat in HINT_PATTERNS:
            for m in pat.finditer(text):
                value = m.group(1).strip()
                if not value:
                    continue
                low = value.lower().strip("#-* ").strip()
                if "http" in low or "](http" in low or "://" in low or low.startswith("**"):
                    continue
                # Skip sentences, not feature names
                if low.endswith((".", "?", "!")):
                    continue
                # Skip overly long phrases
                if len(low.split()) > 8:
                    continue
                # Skip lines that look like prose (multiple long words)
                if any(len(w) > 12 for w in low.split()):
                    continue
                if "http" in low or "](http" in low or "://" in low or low.startswith("**"):
                    continue
                if low in NOISE or len(low) < 3 or len(low) > 80:
                    continue
                hints.add(value)
    return sorted(hints)


def classify(root: Path, hints: list[str], code_signals: set[str]) -> list[dict]:
    """Merge hints with code presence into a feature inventory."""
    inventory: list[dict] = []
    seen: set[str] = set()
    for h in hints:
        key = h.lower().replace(" ", "-")
        if key in seen:
            continue
        seen.add(key)
        status = "unimplemented"
        for sig in code_signals:
            if key in sig or sig in key or any(tok in sig for tok in key.split()):
                status = "implemented"
                break
        inventory.append({
            "name": h,
            "status": status,
            "time_estimate_minutes": 30 if status == "implemented" else 60,
        })
    # If no hints, fall back to directory-based inventory.
    if not inventory:
        for sig in sorted(code_signals)[:20]:
            inventory.append({
                "name": sig,
                "status": "implemented",
                "time_estimate_minutes": 30,
            })
    return inventory


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("repo_root", type=Path,
                    help="Path to the repository root to scan.")
    ap.add_argument("--json", action="store_true",
                    help="Emit JSON to stdout (default).")
    args = ap.parse_args()

    if not args.repo_root.is_dir():
        print(f"error: {args.repo_root} is not a directory", file=sys.stderr)
        return 2

    code_signals = has_code_signal(args.repo_root)
    hints = harvest_hints(args.repo_root)
    inventory = classify(args.repo_root, hints, code_signals)

    if args.json or True:
        print(json.dumps({"features": inventory}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
