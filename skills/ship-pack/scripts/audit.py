#!/usr/bin/env python3
"""
audit.py — submit-readiness audit for a repo.

Walks the project, checks README, scans for secrets, validates the
submission checklist, and emits a safe packaging command.

Usage:
    audit.py --repo-root /path/to/repo [--out-dir .hackathon]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|token|password|private[_-]?key)\s*=\s*[\"''][^\"''\n]+[\"'']"),
    re.compile(r"AKIA[0-9A-Z]{16}"),                                # AWS access key
    re.compile(r"-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----"),
    re.compile(r"ghp_[A-Za-z0-9]{30,}"),                            # GitHub PAT
    re.compile(r"sk-[A-Za-z0-9]{20,}"),                            # OpenAI-style key
    re.compile(r"eyJ[A-Za-z0-9_=-]+\.eyJ[A-Za-z0-9_=-]+"),        # JWT shape
]


SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__",
             "dist", "build", "coverage", ".cache", ".next", ".turbo",
             ".hackathon", "skills"}


README_SECTIONS = [
    ("name",      [r"^#\s+\S", r"^<title>", r"<h1"]),
    ("one_liner", [r"^>\s*\*\*.+\*\*", r"^>\s+.+"]),
    ("install",   [r"(?i)install", r"(?i)getting started", r"(?i)setup"]),
    ("run",       [r"(?i)run", r"(?i)start", r"(?i)usage", r"(?i)npm (run )?start", r"(?i)uvicorn"]),
    ("env",       [r"\.env", r"(?i)environment variables?", r"(?i)config"]),
    ("demo",      [r"(?i)demo", r"(?i)how to"]),
    ("stack",     [r"(?i)tech stack", r"(?i)built with", r"(?i)libraries?"]),
]


CHECKLIST_FILES = {
    "source_code":      ["src/", "lib/", "app/", "package.json", "pyproject.toml"],
    "readme":           ["README.md", "README.rst", "README.txt"],
    "demo_video_or_link": ["demo.mp4", "demo.gif", "demo/"],
    "screenshots":      ["screenshots/", "images/", "docs/assets/"],
    "deployment_link":  [],  # checked by env instead
    "env_docs":         [".env.example", "ENV.md"],
    "dep_files":        ["package.json", "requirements.txt", "pyproject.toml", "Cargo.toml"],
    "run_docs":         ["README.md"],
}


def find_readme(repo: str) -> str | None:
    for name in ("README.md", "README.rst", "README.txt"):
        p = os.path.join(repo, name)
        if os.path.exists(p):
            return p
    return None


def check_readme(repo: str) -> dict:
    path = find_readme(repo)
    if not path:
        return {"present": [], "missing": [s for s, _ in README_SECTIONS]}
    text = open(path, encoding="utf-8", errors="ignore").read()
    present, missing = [], []
    for section, patterns in README_SECTIONS:
        if any(re.search(p, text, re.M) for p in patterns):
            present.append(section)
        else:
            missing.append(section)
    return {"present": present, "missing": missing}


def scan_secrets(repo: str) -> dict:
    findings: list[dict] = []
    for root, dirs, files in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, repo)
            # Skip .env.example on purpose
            if rel.endswith(".env.example"):
                continue
            if rel.startswith(".env") or "/.env" in rel:
                findings.append({"file": rel, "pattern": ".env file", "line": 1})
                continue
            if not fn.endswith((".py", ".js", ".ts", ".tsx", ".jsx", ".go",
                                ".rs", ".java", ".json", ".yaml", ".yml",
                                ".toml", ".md", ".env", ".txt", ".sh")):
                continue
            try:
                lines = open(full, encoding="utf-8", errors="ignore").read().splitlines()
            except OSError:
                continue
            for i, line in enumerate(lines, 1):
                for pat in SECRET_PATTERNS:
                    if pat.search(line):
                        findings.append({"file": rel, "pattern": pat.pattern[:40], "line": i})
    return {"clean": len(findings) == 0, "findings": findings}


def check_checklist(repo: str) -> dict:
    passed, failed = [], []
    for label, paths in CHECKLIST_FILES.items():
        ok = any(os.path.exists(os.path.join(repo, p)) for p in paths) if paths else True
        # Deployment link has no file; mark passed if README mentions deploy.
        if label == "deployment_link":
            readme = find_readme(repo)
            ok = bool(readme and re.search(r"(?i)(deploy|url|live|hosted)", open(readme, encoding="utf-8", errors="ignore").read()))
        if ok:
            passed.append(label)
        else:
            failed.append(label)
    return {"passed": passed, "failed": failed}


def check_reproducible(repo: str) -> dict:
    has_pkg = os.path.exists(os.path.join(repo, "package.json"))
    has_pyproj = os.path.exists(os.path.join(repo, "pyproject.toml"))
    has_reqs = os.path.exists(os.path.join(repo, "requirements.txt"))
    has_readme = bool(find_readme(repo))
    has_env_example = os.path.exists(os.path.join(repo, ".env.example"))
    if has_readme and (has_pkg or has_pyproj or has_reqs):
        return {"ok": True, "reason": "README + dep file present."}
    return {"ok": False, "reason": "Missing README or dependency manifest."}


def packaging_command(repo: str) -> str:
    excludes = [
        "--exclude=node_modules",
        "--exclude=.venv",
        "--exclude=venv",
        "--exclude=__pycache__",
        "--exclude=.env",
        "--exclude=.env.*",
        "--exclude=.cache",
        "--exclude=.next",
        "--exclude=dist",
        "--exclude=build",
        "--exclude=coverage",
        "--exclude=.git",
    ]
    return f"tar czf submit.tar.gz {' '.join(excludes)} ."


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo-root", required=True)
    ap.add_argument("--out-dir", default=".hackathon")
    args = ap.parse_args()

    repo = os.path.abspath(args.repo_root)
    result = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "readme": check_readme(repo),
        "secret_scan": scan_secrets(repo),
        "checklist": check_checklist(repo),
        "reproducible": check_reproducible(repo),
        "packaging_command": packaging_command(repo),
    }

    state_dir = os.path.join(args.out_dir, "state")
    artifact_dir = os.path.join(args.out_dir, "artifacts")
    os.makedirs(state_dir, exist_ok=True)
    os.makedirs(artifact_dir, exist_ok=True)
    with open(os.path.join(state_dir, "ship.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    md = ["# Ship Pack Audit", "",
          f"_Generated: {result['generated_at']}_", ""]

    md.append("## README")
    md.append("")
    md.append(f"- present: {', '.join(result['readme']['present']) or '(none)'}")
    md.append(f"- missing: {', '.join(result['readme']['missing']) or '(none)'}")
    md.append("")

    md.append("## Secret scan")
    md.append("")
    if result["secret_scan"]["clean"]:
        md.append("clean: yes")
    else:
        md.append("clean: NO")
        for f in result["secret_scan"]["findings"]:
            md.append(f"- {f['file']}:{f['line']} ({f['pattern']})")
    md.append("")

    md.append("## Submission checklist")
    md.append("")
    for x in result["checklist"]["passed"]:
        md.append(f"- [x] {x}")
    for x in result["checklist"]["failed"]:
        md.append(f"- [ ] {x}")
    md.append("")

    md.append("## Reproducibility")
    md.append(f"- ok: {result['reproducible']['ok']}")
    md.append(f"- reason: {result['reproducible']['reason']}")
    md.append("")

    md.append("## Packaging command")
    md.append("")
    md.append("```")
    md.append(result["packaging_command"])
    md.append("```")
    md.append("")

    with open(os.path.join(artifact_dir, "ship-pack-output.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md))

    print(f"wrote {state_dir}/ship.json")
    print(f"wrote {artifact_dir}/ship-pack-output.md")
    print(f"secret_scan: clean={result['secret_scan']['clean']}")
    print(f"reproducible: {result['reproducible']['ok']}")
    return 0 if result["secret_scan"]["clean"] else 2


if __name__ == "__main__":
    sys.exit(main())