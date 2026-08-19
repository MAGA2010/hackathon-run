#!/usr/bin/env python3
"""
scan_repo.py - inventory a repository's feature surface.

Reads common project files (README, package.json, pyproject.toml, etc.) and
emits a list of candidate features with status inferred from file presence.

Status legend:
    implemented       Code exists, tests pass (or no tests yet - best-effort)
    half-implemented  Code exists but incomplete or tests failing
    unimplemented     Only mentioned in README / plan
    broken            Was working, now failing (heuristic: tests/ exists but
                      no recent green run is detectable)

The output is intentionally heuristic. The classify.py script will turn this
into a KEEP/CUT/DEFER decision via the scope-knife skill.

Improvements over v1:
    - Code structure analysis (function/class names) as primary signal
    - Strict noise filtering (skip links, sentences, prose)
    - Status detection: implemented only when actual code symbols exist
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

# Files that hint at a feature being implemented (subset, not exhaustive).
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
            ".kt", ".swift", ".rb", ".php", ".cs", ".cpp", ".c", ".h"}

# Directories that strongly suggest implemented code.
CODE_DIRS = {"src", "lib", "app", "pkg", "internal", "cmd", "core"}

# Patterns to harvest feature hints from docs / configs.
HINT_PATTERNS = [
    re.compile(r"^#{1,6}\s+(.+)$", re.M),                       # markdown headings
    re.compile(r"^\s*[-*]\s+(.+)$", re.M),                      # bullets
    re.compile(r"\"([^\"]+)\"\s*:\s*\{", re.M),                 # package.json keys
    re.compile(r"^([A-Za-z][\w-]{2,})\s*=", re.M),              # env keys
]

# Symbol patterns inside code.
SYMBOL_PATTERNS = [
    re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)", re.M),
    re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(", re.M),
    re.compile(r"^\s*class\s+(\w+)", re.M),
    re.compile(r"^\s*def\s+(\w+)", re.M),
    re.compile(r"^\s*func\s+(\w+)", re.M),
]

# A short blacklist of non-feature headings.
NOISE = {
    "table of contents", "installation", "license", "contributing",
    "code of conduct", "support", "acknowledgments", "overview",
    "introduction", "getting started", "usage", "configuration",
    "api", "tests", "deployment", "build", "scripts", "dependencies",
    "authors", "version", "changelog", "discord", "twitter", "show hn",
    "product hunt", "stars", "sponsors", "links", "documentation",
    "examples", "community", "star history", "the problem",
    "how it works", "30-second quickstart", "one-time install",
    "inside any hackathon project", "table of contents", "license",
}


def walk(root: Path) -> Iterable[Path]:
    skip = {".git", "node_modules", "dist", "build", "__pycache__",
            ".venv", "venv", ".next", ".cache", ".hackathon", "skills"}
    for p in root.rglob("*"):
        if any(part in skip for part in p.parts):
            continue
        if p.is_file():
            yield p


def extract_code_signals(root: Path) -> set[str]:
    """Return a set of feature names derived from actual code symbols."""
    signals: set[str] = set()
    for p in walk(root):
        if p.suffix.lower() not in CODE_EXT:
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pat in SYMBOL_PATTERNS:
            for m in pat.finditer(text):
                name = m.group(1)
                # skip obvious framework boilerplate
                if name in {"main", "init", "constructor", "render",
                            "__init__", "__str__", "__repr__"}:
                    continue
                if name.startswith("_") and not name.startswith("__"):
                    continue
                signals.add(name)
    return signals


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
                if low in NOISE or len(low) < 3 or len(low) > 80:
                    continue
                # Skip URLs / links / sentences.
                if "http" in low or "](http" in low or "://" in low:
                    continue
                if low.startswith("**") or low.startswith("__"):
                    continue
                if low.endswith((".", "?", "!")):
                    continue
                if len(low.split()) > 8:
                    continue
                if any(len(w) > 12 for w in low.split()):
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
        # Status: implemented if any code signal matches the hint closely.
        status = "unimplemented"
        for sig in code_signals:
            if key in sig.lower() or sig.lower() in key:
                status = "implemented"
                break
            # weak match: any token overlap
            tokens_hint = set(key.split("-"))
            tokens_sig = set(sig.lower().split("_"))
            if tokens_hint & tokens_sig:
                status = "implemented"
                break
        inventory.append({
            "name": h,
            "status": status,
            "time_estimate_minutes": 30 if status == "implemented" else 60,
        })
    # If no hints, fall back to code symbols.
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
    args = ap.parse_args()

    if not args.repo_root.is_dir():
        print(f"error: {args.repo_root} is not a directory", file=sys.stderr)
        return 2

    code_signals = extract_code_signals(args.repo_root)
    hints = harvest_hints(args.repo_root)
    inventory = classify(args.repo_root, hints, code_signals)

    print(json.dumps({"features": inventory}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
