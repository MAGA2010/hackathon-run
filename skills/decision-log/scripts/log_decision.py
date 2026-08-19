#!/usr/bin/env python3
"""
log_decision.py - append a scope decision to .hackathon/state/decision-log.json.

The decision log is the team's shared memory: every KEEP / CUT / DEFER /
PIVOT decision gets recorded with its rationale, author, and timestamp so
the retro (and the next hackathon) can learn from what was actually decided.

Reads:
  - .hackathon/state/decision-log.json (optional; created on first run)

Writes:
  - .hackathon/state/decision-log.json (matches decision-log.schema.json)
  - .hackathon/artifacts/decision-log.md (human-readable transcript)

Usage:
  python3 log_decision.py --feature "Notifications" --classification CUT \\
      --rationale "Off demo path; removed for time." --author alice \\
      --out-dir .hackathon
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VERSION = "1.0"

CLASSIFICATIONS = ("KEEP", "CUT", "DEFER", "PIVOT")


def load_log(out_dir: Path) -> dict[str, Any]:
    state_path = out_dir / "state" / "decision-log.json"
    if not state_path.exists():
        return {
            "version": VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "entries": [],
        }
    raw = json.loads(state_path.read_text(encoding="utf-8"))
    if raw.get("version") != VERSION:
        raise ValueError(
            f"existing decision-log.json has version {raw.get('version')!r}, expected {VERSION!r}"
        )
    return raw


def render_markdown(log: dict[str, Any]) -> str:
    lines = ["# Decision log", ""]
    entries = log.get("entries", [])
    if not entries:
        lines.append("_No decisions recorded yet._")
        lines.append("")
        return "\n".join(lines)
    for e in reversed(entries):
        author = f" — {e.get('author', 'unknown')}" if e.get("author") else ""
        relates = f" (relates to {e.get('relates_to', '?')})" if e.get("relates_to") else ""
        lines.append(f"## {e['classification']} {e['feature']} - {e['at']}{author}{relates}")
        lines.append("")
        lines.append(e["rationale"])
        lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(f"_{len(entries)} decisions recorded_")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--feature", required=True, help="Feature or decision subject (e.g. Notifications).")
    ap.add_argument(
        "--classification",
        required=True,
        choices=CLASSIFICATIONS,
        help="KEEP, CUT, DEFER, or PIVOT.",
    )
    ap.add_argument("--rationale", required=True, help="Why was this decided? One sentence is enough.")
    ap.add_argument("--author", default="", help="Who made the call (name or handle).")
    ap.add_argument("--relates-to", default="plan.json", help="State file this decision relates to.")
    ap.add_argument("--out-dir", type=Path, default=Path(".hackathon"), help="Output directory.")
    args = ap.parse_args()

    if not args.rationale.strip():
        print("error: --rationale cannot be empty", file=sys.stderr)
        return 2

    log = load_log(args.out_dir)
    entry = {
        "at": datetime.now(timezone.utc).isoformat(),
        "feature": args.feature,
        "classification": args.classification,
        "rationale": args.rationale.strip(),
    }
    if args.author:
        entry["author"] = args.author
    if args.relates_to:
        entry["relates_to"] = args.relates_to
    log["entries"].append(entry)
    log["generated_at"] = datetime.now(timezone.utc).isoformat()

    state_dir = args.out_dir / "state"
    artifact_dir = args.out_dir / "artifacts"
    state_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    (state_dir / "decision-log.json").write_text(
        json.dumps(log, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (artifact_dir / "decision-log.md").write_text(
        render_markdown(log),
        encoding="utf-8",
    )

    print(f"wrote {state_dir / 'decision-log.json'}")
    print(f"wrote {artifact_dir / 'decision-log.md'}")
    print()
    print(f"logged {args.classification} {args.feature}: {args.rationale.strip()}")
    print(f"({len(log['entries'])} decisions total)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
