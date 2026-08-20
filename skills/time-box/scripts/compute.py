#!/usr/bin/env python3
"""
compute.py - allocate the remaining hackathon clock across build / verify / demo / ship.

Usage:
    compute.py --time-remaining 240 --team-size 4 --current-stage build \\
               --stage-progress 0.2 --buffer 90 --out-dir .hackathon

Writes:
    .hackathon/state/time-box.json
    .hackathon/artifacts/time-box-schedule.md
"""
from __future__ import annotations

VERSION = "1.0"  # contract pin: hackathon validate-skill checks this

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

STAGES = ["build", "verify", "demo", "ship"]

# Split table from SKILL.md. Each row is for the remaining stages after the
# current one. Order matches STAGES-without-current-stage.
SPLIT_TABLE = {
    ("build", "verify", "demo", "ship"): (60, 15, 15, 10),
    ("verify", "demo", "ship"): (40, 40, 20),
    ("demo", "ship"): (50, 50),
    ("ship",): (100,),
}

EXIT_CRITERIA = {
    "build": "demo_path steps compile and the happy path runs locally",
    "verify": "every demo_path step passes; failure modes have runbooks",
    "demo": "3 timed runs in a row under the budget, with recovery-runbook in hand",
    "ship": "README + secret scan + reproducible packaging command all green",
}


def allocate(remaining_minutes: int, current_stage: str, team_size: int, buffer_minutes: int):
    work_budget = max(0, remaining_minutes - buffer_minutes)
    idx = STAGES.index(current_stage)
    future = tuple(STAGES[idx + 1 :])
    weights = SPLIT_TABLE.get(future)
    if weights is None:
        raise SystemExit(f"refuse: current_stage={current_stage!r} is the last stage, nothing to allocate")
    total = sum(weights)
    per_stage = [round(work_budget * w / total) for w in weights]
    per_person = [round(mins / team_size / 15) * 15 for mins in per_stage]
    warnings = []
    for s, mins in zip(future, per_person):
        if mins < 30:
            warnings.append(f"single-person stage: {s} has only {mins}min/person; consider combining roles")
    return future, per_stage, per_person, warnings


def main():
    ap = argparse.ArgumentParser(description="Allocate remaining hackathon clock to upcoming stages.")
    ap.add_argument("--time-remaining", type=int, required=True)
    ap.add_argument("--team-size", type=int, required=True)
    ap.add_argument("--current-stage", required=True, choices=STAGES)
    ap.add_argument("--stage-progress", type=float, default=0.0)
    ap.add_argument("--buffer", type=int, default=90)
    ap.add_argument("--out-dir", default=".hackathon")
    args = ap.parse_args()

    if args.time_remaining <= 0:
        sys.stderr.write("refuse: time_remaining_minutes must be > 0; run recovery-runbook instead\n")
        return 2
    if args.team_size <= 0:
        sys.stderr.write("refuse: team_size must be >= 1\n")
        return 2

    future, per_stage, per_person, warnings = allocate(args.time_remaining, args.current_stage, args.team_size, args.buffer)

    cursor = 0
    schedule = []
    for stage, mins, per in zip(future, per_stage, per_person):
        starts_at = cursor
        ends_at = cursor + mins
        alarm_at = starts_at + max(1, mins // 2)
        schedule.append({
            "stage": stage,
            "starts_at_minute": starts_at,
            "ends_at_minute": ends_at,
            "alarm_at_minute": alarm_at,
            "exit_criteria": EXIT_CRITERIA[stage],
            "per_person_minutes": per,
        })
        cursor = ends_at

    slipping = (
        args.current_stage == "build"
        and args.stage_progress > 0
        and args.stage_progress < 0.5
        and args.time_remaining < 180
    )

    rec = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "time_remaining_minutes": args.time_remaining,
        "team_size": args.team_size,
        "current_stage": args.current_stage,
        "schedule": schedule,
    }

    out = Path(args.out_dir)
    state_dir = out / "state"
    artifact_dir = out / "artifacts"
    state_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "time-box.json").write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")

    md = [
        f"# Time-box schedule from {args.current_stage}",
        "",
        f"- Time remaining: {args.time_remaining} min",
        f"- Team size: {args.team_size}",
        f"- Buffer reserved for ship/demo: {args.buffer} min",
        "",
        "| Stage | Window (min) | Per-person (min) | Alarm at | Exit criteria |",
        "| --- | --- | --- | --- | --- |",
    ]
    for item in schedule:
        md.append(
            f"| {item['stage']} | {item['starts_at_minute']}-{item['ends_at_minute']} | "
            f"{item['per_person_minutes']} | {item['alarm_at_minute']} | {item['exit_criteria']} |"
        )
    md.append("")
    if slipping:
        md.append("> **Slipping detected**: build stage progress is low and time is short. Run a scope-knife CUT pass before the next alarm.")
    if warnings:
        md.append("## Warnings")
        for w in warnings:
            md.append(f"- {w}")
    (artifact_dir / "time-box-schedule.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    print(f"allocated {len(schedule)} stage(s) across {sum(per_stage)} min")
    print(f"state:   {state_dir / 'time-box.json'}")
    print(f"artifact: {artifact_dir / 'time-box-schedule.md'}")
    if warnings:
        for w in warnings:
            sys.stderr.write(f"warn: {w}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())