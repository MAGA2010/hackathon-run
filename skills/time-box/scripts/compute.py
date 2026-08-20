#!/usr/bin/env python3
"""
compute.py - allocate the remaining hackathon clock across build / verify / demo / ship.

v1.2.1.5 adds:
  * burn-rate and alarm escalation at 50% / 80% / 100% of each stage
  * recovery-budget suggestion when build is slipping
  * minimum-viable-demo (MVD) check against --demo-target-minutes
  * optional --demo-at HH:MM wall-clock deadline
  * --elapsed for current-stage minutes already consumed (drives burn-rate)

Usage:
    compute.py --time-remaining 240 --team-size 4 --current-stage build \\
               --elapsed 30 --stage-progress 0.2 --buffer 90 \\
               --demo-target-minutes 180 --out-dir .hackathon
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

# Default split weights when only these stages remain.
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

# Escalation thresholds as a fraction of stage budget consumed.
ALARM_THRESHOLDS = (0.5, 0.8, 1.0)


def parse_demo_at(s):
    """Parse HH:MM 24h clock; return minutes from now. Naive, no timezone math."""
    if not s:
        return None
    h, m = s.split(":")
    now = datetime.now()
    target = now.replace(hour=int(h), minute=int(m), second=0, microsecond=0)
    delta = (target - now).total_seconds() / 60.0
    return int(round(delta))


def allocate(remaining_minutes, current_stage, team_size, buffer_minutes):
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


def escalation_alarms(stage, start, end):
    """Return list of {threshold, minute, severity} for a stage window."""
    window = end - start
    out = []
    for t in ALARM_THRESHOLDS:
        out.append({
            "stage": stage,
            "threshold": t,
            "at_minute": start + round(window * t),
            "severity": "soft" if t <= 0.5 else "firm" if t <= 0.8 else "hard",
        })
    return out


def compute_recovery(stage_budget, consumed, per_person):
    """If we are behind, suggest how many minutes to steal from future windows."""
    deficit = max(0, consumed - stage_budget)
    if deficit == 0:
        return None
    steal = round(deficit)
    return {
        "deficit_minutes": steal,
        "cut_from_verify": round(steal * 0.5),
        "cut_from_demo": round(steal * 0.3),
        "cut_from_ship_buffer": round(steal * 0.2),
        "rationale": "build stage is over-budget; steal verify/demo/ship time proportionally to recover the deadline",
    }


def main():
    ap = argparse.ArgumentParser(description="Allocate remaining hackathon clock + alarms + recovery budget.")
    ap.add_argument("--time-remaining", type=int, required=True, help="minutes left in the hackathon")
    ap.add_argument("--team-size", type=int, required=True)
    ap.add_argument("--current-stage", required=True, choices=STAGES)
    ap.add_argument("--elapsed", type=int, default=0, help="minutes already spent in the current stage")
    ap.add_argument("--stage-progress", type=float, default=0.0)
    ap.add_argument("--buffer", type=int, default=90)
    ap.add_argument("--demo-target-minutes", type=int, default=180, help="min-viable demo length; used for MVD check")
    ap.add_argument("--burn-rate-threshold", type=float, default=0.8, help="alarm when consumed/budget exceeds this")
    ap.add_argument("--demo-at", default=None, help="wall-clock demo time HH:MM; converts to minutes-remaining")
    ap.add_argument("--out-dir", default=".hackathon")
    args = ap.parse_args()

    if args.demo_at and args.time_remaining <= 0:
        parsed = parse_demo_at(args.demo_at)
        if parsed and parsed > 0:
            args.time_remaining = parsed

    if args.time_remaining <= 0:
        sys.stderr.write("refuse: time_remaining_minutes must be > 0; run recovery-runbook instead\n")
        return 2
    if args.team_size <= 0:
        sys.stderr.write("refuse: team_size must be >= 1\n")
        return 2

    future, per_stage, per_person, warnings = allocate(
        args.time_remaining, args.current_stage, args.team_size, args.buffer
    )

    cursor = 0
    schedule = []
    all_alarms = []
    for stage, mins, per in zip(future, per_stage, per_person):
        starts_at = cursor
        ends_at = cursor + mins
        all_alarms.extend(escalation_alarms(stage, starts_at, ends_at))
        schedule.append({
            "stage": stage,
            "starts_at_minute": starts_at,
            "ends_at_minute": ends_at,
            "alarms_at_minute": [a["at_minute"] for a in all_alarms[-len(ALARM_THRESHOLDS):]],
            "per_person_minutes": per,
            "exit_criteria": EXIT_CRITERIA[stage],
        })
        cursor = ends_at

    # Burn-rate analysis for the CURRENT stage.
    idx = STAGES.index(args.current_stage)
    current_budget = (
        per_stage[0] if future else 0
    )
    burn_rate = round(args.elapsed / current_budget, 2) if current_budget > 0 else None
    slipping = (
        args.current_stage == "build"
        and burn_rate is not None
        and burn_rate > 1.0
    )

    recovery = None
    if slipping and current_budget > 0:
        recovery = compute_recovery(current_budget, args.elapsed, per_person[0] if per_person else 0)

    # Minimum-viable demo check: can we still ship a --demo-target-minutes demo?
    future_mins = sum(per_stage)
    mvd_feasible = future_mins >= args.demo_target_minutes + 30  # 30 = slack for stage transitions

    rec = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "time_remaining_minutes": args.time_remaining,
        "team_size": args.team_size,
        "current_stage": args.current_stage,
        "burn_rate": burn_rate,
        "burn_rate_threshold": args.burn_rate_threshold,
        "demo_target_minutes": args.demo_target_minutes,
        "minimum_viable_demo_feasible": mvd_feasible,
        "schedule": schedule,
        "alarms": all_alarms,
        "recovery": recovery,
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
        f"- Demo target: {args.demo_target_minutes} min",
        f"- Burn rate: {burn_rate} ({args.elapsed}/{current_budget} min on current stage)",
        f"- Minimum-viable demo feasible: {mvd_feasible}",
        "",
        "## Schedule",
        "",
        "| Stage | Window (min) | Per-person (min) | Alarms (min from now) | Exit criteria |",
        "| --- | --- | --- | --- | --- |",
    ]
    for item in schedule:
        alarms_str = ", ".join(str(a) for a in item["alarms_at_minute"])
        md.append(
            f"| {item['stage']} | {item['starts_at_minute']}-{item['ends_at_minute']} | "
            f"{item['per_person_minutes']} | {alarms_str} | {item['exit_criteria']} |"
        )
    md += [
        "",
        "## Alarms",
        "",
        "| Stage | Threshold | At minute | Severity |",
        "| --- | --- | --- | --- |",
    ]
    for a in all_alarms:
        md.append(f"| {a['stage']} | {int(a['threshold'] * 100)}% | {a['at_minute']} | {a['severity']} |")
    if recovery:
        md += [
            "",
            "## Recovery budget (slip detected)",
            "",
            f"- Build stage over budget by {recovery['deficit_minutes']} min",
            f"- Steal {recovery['cut_from_verify']} min from verify",
            f"- Steal {recovery['cut_from_demo']} min from demo",
            f"- Steal {recovery['cut_from_ship_buffer']} min from ship buffer",
            "",
            f"> {recovery['rationale']}",
        ]
    elif slipping:
        md.append("")
        md.append("> **Slipping detected**: build is over its stage budget. Run scope-knife CUT pass before next alarm.")
    if warnings:
        md.append("")
        md.append("## Warnings")
        for w in warnings:
            md.append(f"- {w}")
    (artifact_dir / "time-box-schedule.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    print(f"allocated {len(schedule)} stage(s) across {sum(per_stage)} min")
    print(f"burn rate: {burn_rate} | demo feasible: {mvd_feasible}")
    if recovery:
        print(f"recovery: steal {recovery['cut_from_verify']} + {recovery['cut_from_demo']} + {recovery['cut_from_ship_buffer']} = {recovery['deficit_minutes']} min")
    print(f"state:   {state_dir / 'time-box.json'}")
    print(f"artifact: {artifact_dir / 'time-box-schedule.md'}")
    if warnings:
        for w in warnings:
            sys.stderr.write(f"warn: {w}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())