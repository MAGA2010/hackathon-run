#!/usr/bin/env python3
"""
rehearse.py - drive a timed mock-demo rehearsal.

Reads plan.json, prompts the operator to mark each step done with Enter,
records per-segment durations, scores each segment against a budget, and
writes rehearsal.json + a human log.

Usage:
    rehearse.py --cwd .hackathon [--target-total-seconds 180] [--run-number 1]

Reads:
    .hackathon/state/plan.json
Writes:
    .hackathon/state/rehearsal.json
    .hackathon/artifacts/rehearsal-log.md
"""
from __future__ import annotations

VERSION = "1.0"  # contract pin: hackathon validate-skill checks this

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")


def load_demo_path(plan_path: Path):
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    raw = plan.get("demo_path") or []
    path = []
    for i, step in enumerate(raw, 1):
        if isinstance(step, str):
            path.append({"index": i, "name": step, "action": step})
        elif isinstance(step, dict):
            path.append({
                "index": i,
                "name": step.get("name") or f"step-{i}",
                "action": step.get("action") or step.get("name") or f"step-{i}",
            })
        else:
            path.append({"index": i, "name": f"step-{i}", "action": str(step)})
    return path


def score_step(delta_seconds: float) -> int:
    return max(0, 10 - int(abs(delta_seconds) * 2))


def classify(score: int) -> str:
    if score >= 8:
        return "on-time"
    if score >= 5:
        return "drift"
    return "broken"


def main():
    ap = argparse.ArgumentParser(description="Time a mock-demo rehearsal.")
    ap.add_argument("--cwd", default=".", help="repo root (contains .hackathon/state/plan.json)")
    ap.add_argument("--target-total-seconds", type=int, default=180)
    ap.add_argument("--per-step-seconds", type=int, default=None, help="override default budget")
    ap.add_argument("--run-number", type=int, default=1)
    ap.add_argument("--dry-run", action="store_true", help="skip the interactive timer; emit a synthetic 0-duration rehearsal")
    args = ap.parse_args()

    plan_path = Path(args.cwd) / ".hackathon" / "state" / "plan.json"
    if not plan_path.exists():
        sys.stderr.write(f"refuse: plan.json not found at {plan_path}; run scope-knife first\n")
        return 2

    demo_path = load_demo_path(plan_path)
    if not demo_path:
        sys.stderr.write("refuse: plan.json has no demo_path steps; run scope-knife first\n")
        return 2

    per_step = args.per_step_seconds or max(10, args.target_total_seconds // len(demo_path))
    print(f"Rehearsal #{args.run_number} - total budget {args.target_total_seconds}s - {len(demo_path)} steps - start NOW.")

    segments = []
    total = 0.0
    log_lines = [f"# Rehearsal #{args.run_number}", "", f"Total budget: {args.target_total_seconds}s ({len(demo_path)} steps, {per_step}s/step)", ""]
    started_run = time.monotonic()

    for i, step in enumerate(demo_path, 1):
        print(f"[step {i}/{len(demo_path)}] {step['action']}")
        if args.dry_run:
            actual = 0.0
        else:
            step_start = time.monotonic()
            try:
                input("(press Enter when done) ")
            except EOFError:
                actual = 0.0
            else:
                actual = time.monotonic() - step_start
        total = time.monotonic() - started_run if not args.dry_run else total + per_step
        delta = actual - per_step
        s = score_step(delta)
        seg = {
            "index": i,
            "name": step["name"],
            "budget_seconds": per_step,
            "actual_seconds": round(actual, 2),
            "delta_seconds": round(delta, 2),
            "score": s,
            "classification": classify(s),
        }
        segments.append(seg)
        log_lines.append(
            f"- step {i} ({step['name']}): budget {per_step}s, actual {actual:.1f}s, score {s}, {seg['classification']}"
        )

    broken = [s for s in segments if s["classification"] == "broken"]
    drift = [s for s in segments if s["classification"] == "drift"]
    fixes = []
    for s in broken:
        fixes.append({
            "step": s["name"],
            "what_to_cut": f"drop one sentence from step {s['index']}",
            "what_to_keep": "the core action phrase",
            "new_budget_seconds": max(5, s["budget_seconds"] - 5),
        })

    if args.dry_run:
        total_seconds = per_step * len(demo_path)
    else:
        total_seconds = round(time.monotonic() - started_run, 2)

    rec = {
        "version": "1.0",
        "started_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "target_total_seconds": args.target_total_seconds,
        "run_number": args.run_number,
        "total_seconds": total_seconds,
        "within_budget": abs(total_seconds - args.target_total_seconds) <= args.target_total_seconds * 0.15,
        "segments": segments,
        "fixes": fixes,
    }

    out_state = Path(args.cwd) / ".hackathon" / "state"
    out_artifacts = Path(args.cwd) / ".hackathon" / "artifacts"
    out_state.mkdir(parents=True, exist_ok=True)
    out_artifacts.mkdir(parents=True, exist_ok=True)
    (out_state / "rehearsal.json").write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")

    log_lines += [
        "",
        f"**Total**: {total_seconds}s (budget {args.target_total_seconds}s, within +/-15%: {rec['within_budget']})",
        "",
        f"**On-time**: {len(segments) - len(drift) - len(broken)} | **drift**: {len(drift)} | **broken**: {len(broken)}",
        "",
        "## Fix list",
    ]
    if not fixes:
        log_lines.append("- all-green")
    for f in fixes:
        log_lines.append(f"- **{f['step']}**: cut `{f['what_to_cut']}`; keep `{f['what_to_keep']}`; new budget {f['new_budget_seconds']}s")
    (out_artifacts / "rehearsal-log.md").write_text("\n".join(log_lines) + "\n", encoding="utf-8")

    print(f"rehearsal #{args.run_number} done: {total_seconds}s total, {len(broken)} broken step(s)")
    print(f"state:   {out_state / 'rehearsal.json'}")
    print(f"log:     {out_artifacts / 'rehearsal-log.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())