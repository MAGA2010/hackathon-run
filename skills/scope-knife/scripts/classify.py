#!/usr/bin/env python3
"""

VERSION = "1.0"

classify.py — turn a feature inventory into KEEP/CUT/DEFER decisions under
time pressure.

This is the heart of scope-knife. Given a feature inventory, time remaining,
and a one-sentence demo goal, it forces classification and emits a plan.json
plus a human-readable markdown artifact.

Hard rules (enforced):
- Cannot mark all features as KEEP.
- CUT rate meets or exceeds the pressure threshold for time_remaining_minutes.
- Features off the demo path default to CUT or DEFER.

CLI:
    classify.py --inventory features.json --demo-goal "..." \\
                --time-remaining 180 --out-dir .hackathon
"""
from __future__ import annotations
import sys as _sys
_sys.stdout.reconfigure(encoding='utf-8')
_sys.stderr.reconfigure(encoding='utf-8')

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Pressure thresholds (minimum CUT rate by remaining time).
PRESSURE_TABLE = [
    (360, 0.30),   # > 6h
    (180, 0.50),   # 3-6h
    (60, 0.70),    # 1-3h
    (0, 0.90),     # < 1h
]


def pressure_cut_rate(time_remaining_minutes: int) -> float:
    for threshold, rate in PRESSURE_TABLE:
        if time_remaining_minutes > threshold:
            return rate
    return PRESSURE_TABLE[-1][1]


def classify(features: list[dict], demo_goal: str,
             time_remaining_minutes: int) -> tuple[list[dict], list[str]]:
    """Return (classified_features, warnings)."""
    warnings: list[str] = []
    n = len(features)
    if n == 0:
        warnings.append("No features supplied. Nothing to classify.")
        return [], warnings

    target_cut_rate = pressure_cut_rate(time_remaining_minutes)

    # Step 1: seed by status.
    keep_pool, defer_pool = [], []
    for f in features:
        if f.get("status") == "implemented":
            keep_pool.append(f)
        else:
            defer_pool.append(f)

    demo_keywords = set(demo_goal.lower().split())
    keep_pool.sort(
        key=lambda f: -sum(1 for w in demo_keywords if w in f["name"].lower()),
    )

    required_cuts = max(0, int(round(target_cut_rate * n)))

    # Step 2: classify everything.
    classified: list[dict] = []
    keep_count = 0
    cut_count = 0
    defer_count = 0

    # Pool ordering: keep_pool (best matches first) then defer_pool.
    pool = keep_pool + defer_pool
    for f in pool:
        is_on_path = any(w in f["name"].lower() for w in demo_keywords)
        if is_on_path and keep_count < max(1, int(0.30 * n)):
            f["classification"] = "KEEP"
            f["rationale"] = "Supports the demo path."
            keep_count += 1
        elif cut_count < required_cuts or keep_count >= max(1, n - required_cuts):
            f["classification"] = "CUT"
            f["rationale"] = "Off demo path; removed for time."
            cut_count += 1
        else:
            f["classification"] = "DEFER"
            f["rationale"] = "Valuable post-demo; ship later."
            defer_count += 1
        classified.append(f)

    # Step 3: enforce pressure cut rate (promote low-priority KEEPs to CUT).
    def actual_rate() -> float:
        return cut_count / n if n else 0.0
    while actual_rate() < target_cut_rate and keep_count > 1:
        # find a KEEP with the lowest demo-path relevance
        victim = next(
            (f for f in classified
             if f.get("classification") == "KEEP"
             and not any(w in f["name"].lower() for w in demo_keywords)),
            None,
        )
        if victim is None:
            # nothing to demote further without nuking the demo path
            break
        victim["classification"] = "CUT"
        victim["rationale"] = "Pressure forced cut."
        keep_count -= 1
        cut_count += 1
        warnings.append(
            f"Pressure enforced: CUT rate is now {actual_rate():.0%} "
            f"(threshold {target_cut_rate:.0%})."
        )

    # Step 4: hard rule — never 100% KEEP.
    if keep_count == n and n > 0:
        # promote least-relevant KEEP to CUT.
        victim = next(
            (f for f in classified
             if f.get("classification") == "KEEP"
             and not any(w in f["name"].lower() for w in demo_keywords)),
            classified[1] if len(classified) > 1 else classified[0],
        )
        victim["classification"] = "CUT"
        victim["rationale"] = "Hard rule: not all features can be KEEP."
        keep_count -= 1
        cut_count += 1
        warnings.append("Hard rule enforced: at least one feature was demoted to CUT.")

    return classified, warnings
def build_demo_path(features: list[dict], demo_goal: str) -> list[dict]:
    keep = [f for f in features if f.get("classification") == "KEEP"]
    path = []
    step = 1
    # Step 1: open URL — always the same.
    path.append({"step": step, "action": "Open the demo URL.",
                 "expected_outcome": "App loads without errors."})
    step += 1
    # One step per keep feature (max 4 more).
    for f in keep[:4]:
        path.append({"step": step, "action": f["name"],
                     "expected_outcome": "User sees the feature working."})
        step += 1
    # Closing step.
    path.append({"step": step,
                 "action": f"Connect back to demo goal: {demo_goal}.",
                 "expected_outcome": "Judge understands product value."})
    return path


def build_next_tasks(features: list[dict]) -> list[dict]:
    keep = [f for f in features if f.get("classification") == "KEEP"]
    half = [f for f in features if f.get("classification") == "KEEP"
            and f.get("status") == "half-implemented"]
    tasks: list[dict] = []
    for f in half:
        tasks.append({"priority": "P0", "task": f"Finish {f['name']}.",
                      "estimate_minutes": f.get("time_estimate_minutes", 60)})
    for f in keep:
        if f not in half:
            tasks.append({"priority": "P1",
                          "task": f"Polish {f['name']}.",
                          "estimate_minutes": 20})
    # Always include a P0: verify the demo path is end-to-end runnable.
    tasks.insert(0, {"priority": "P0",
                     "task": "Verify demo path end-to-end.",
                     "estimate_minutes": 30})
    return tasks
def render_markdown(plan: dict, warnings: list[str]) -> str:
    lines = ["# scope-knife output", "",
             f"_Generated: {plan['generated_at']}_", "",
             f"**Demo goal:** {plan['demo_goal']}", "",
             f"**Time remaining:** {plan['time_remaining_minutes']} minutes",
             ""]
    if warnings:
        lines += ["## Warnings", ""]
        for w in warnings:
            lines.append(f"- {w}")
        lines.append("")

    # KEEP / CUT / DEFER sections.
    for cls in ("KEEP", "CUT", "DEFER"):
        items = [f for f in plan["features"]
                 if f.get("classification") == cls]
        if not items:
            continue
        lines.append(f"## {cls} ({len(items)})")
        lines.append("")
        for f in items:
            lines.append(f"- **{f['name']}** — {f.get('rationale', '')}")
        lines.append("")

    # Demo path.
    lines.append("## Demo path")
    lines.append("")
    for s in plan["demo_path"]:
        lines.append(f"{s['step']}. {s['action']} — _expected: {s['expected_outcome']}_")
    lines.append("")

    # Next tasks.
    lines.append("## Next steps")
    lines.append("")
    for t in plan["next_tasks"]:
        lines.append(f"- **[{t['priority']}]** {t['task']} _(~{t['estimate_minutes']}m)_")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--inventory", type=Path, required=True,
                    help="Path to JSON inventory from scan_repo.py.")
    ap.add_argument("--demo-goal", required=True,
                    help="One-sentence demo goal.")
    ap.add_argument("--time-remaining", type=int, required=True,
                    help="Estimated minutes remaining.")
    ap.add_argument("--out-dir", type=Path, default=Path(".hackathon"),
                    help="Output directory.")
    ap.add_argument("--force", action="store_true",
                    help="Skip user confirmation step.")
    args = ap.parse_args()

    if not args.inventory.exists():
        print(f"error: inventory not found: {args.inventory}", file=sys.stderr)
        return 2

    raw = json.loads(args.inventory.read_text(encoding="utf-8"))
    features = raw.get("features", [])

    classified, warnings = classify(features, args.demo_goal, args.time_remaining)
    demo_path = build_demo_path(classified, args.demo_goal)
    next_tasks = build_next_tasks(classified)

    plan = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "demo_goal": args.demo_goal,
        "time_remaining_minutes": args.time_remaining,
        "features": classified,
        "demo_path": demo_path,
        "next_tasks": next_tasks,
    }

    state_dir = args.out_dir / "state"
    artifact_dir = args.out_dir / "artifacts"
    state_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    (state_dir / "plan.json").write_text(
        json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    (artifact_dir / "scope-knife-output.md").write_text(
        render_markdown(plan, warnings), encoding="utf-8")

    print(f"wrote {state_dir / 'plan.json'}")
    print(f"wrote {artifact_dir / 'scope-knife-output.md'}")
    print()
    print("summary:")
    for cls in ("KEEP", "CUT", "DEFER"):
        n = sum(1 for f in classified if f.get("classification") == cls)
        print(f"  {cls}: {n}")
    for w in warnings:
        print(f"  warn: {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
