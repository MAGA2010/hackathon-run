#!/usr/bin/env python3
"""
classify.py — turn a feature inventory into KEEP/CUT/DEFER decisions under
time pressure, with optional WSJF scoring (SAFe) for tie-breaking among
non-demo-path features (v1.2.1.6).

WSJF (Weighted Shortest Job First):
  cost_of_delay = user_business_value + time_criticality + risk_reduction
  wsjf_score    = cost_of_delay / job_size

Features with higher WSJF are kept (or DEFERred) over features with lower
WSJF. Demo-path relevance always wins over WSJF.

Hard rules (enforced):
- Cannot mark all features as KEEP.
- CUT rate meets or exceeds the pressure threshold for time_remaining_minutes.
- Features off the demo path default to CUT or DEFER.

CLI:
    classify.py --inventory features.json --demo-goal "..." \\
                --time-remaining 180 --enable-wsjf --out-dir .hackathon
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

VERSION = "1.0"

PRESSURE_TABLE = [
    (360, 0.30),
    (180, 0.50),
    (60, 0.70),
    (0, 0.90),
]


def pressure_cut_rate(time_remaining_minutes: int) -> float:
    for threshold, rate in PRESSURE_TABLE:
        if time_remaining_minutes > threshold:
            return rate
    return PRESSURE_TABLE[-1][1]


def wsjf_score(f: dict) -> float:
    """Return the WSJF score for a feature, defaulting to a neutral 3.0 when
    the feature lacks the required fields. Required fields: ubv, tc, rr, job."""
    ubv = f.get("user_business_value", 5)
    tc = f.get("time_criticality", 5)
    rr = f.get("risk_reduction", 5)
    job = f.get("job_size", 5)
    if not isinstance(job, (int, float)) or job <= 0:
        job = 5
    cost_of_delay = float(ubv + tc + rr)
    return round(cost_of_delay / float(job), 2)


def classify(features: list[dict], demo_goal: str,
             time_remaining_minutes: int,
             enable_wsjf: bool = False) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []
    n = len(features)
    if n == 0:
        warnings.append("No features supplied. Nothing to classify.")
        return [], warnings

    target_cut_rate = pressure_cut_rate(time_remaining_minutes)

    # Compute WSJF for every feature up front so the rationale includes it.
    for f in features:
        f["wsjf_score"] = wsjf_score(f)
        f["cost_of_delay"] = f["user_business_value"] + f["time_criticality"] + f["risk_reduction"] if enable_wsjf else None

    # Bucket: implemented-vs-not.
    keep_pool, defer_pool = [], []
    for f in features:
        (keep_pool if f.get("status") == "implemented" else defer_pool).append(f)

    # Sort each pool: demo-path relevance, then WSJF desc.
    demo_keywords = set(demo_goal.lower().split())
    def relevance(f):
        return sum(1 for w in demo_keywords if w in f["name"].lower())
    for pool in (keep_pool, defer_pool):
        pool.sort(key=lambda f: (-relevance(f), -f["wsjf_score"]))

    required_cuts = max(0, int(round(target_cut_rate * n)))

    classified: list[dict] = []
    keep_count = cut_count = defer_count = 0

    pool = keep_pool + defer_pool
    for f in pool:
        is_on_path = relevance(f) > 0
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
            f["rationale"] = f"Off demo path; WSJF {f['wsjf_score']} below threshold; ship later."
            defer_count += 1
        classified.append(f)

    # Enforce pressure cut rate.
    def actual_rate():
        return cut_count / n if n else 0.0
    while actual_rate() < target_cut_rate and keep_count > 1:
        # demote the lowest-WSJF non-demo-path KEEP
        candidates = [f for f in classified
                     if f.get("classification") == "KEEP" and relevance(f) == 0]
        if not candidates:
            break
        victim = min(candidates, key=lambda f: f["wsjf_score"])
        victim["classification"] = "CUT"
        victim["rationale"] = f"Pressure forced cut (WSJF {victim['wsjf_score']})."
        keep_count -= 1
        cut_count += 1
        warnings.append(
            f"Pressure enforced: CUT rate {actual_rate():.0%} "
            f"(threshold {target_cut_rate:.0%}); demoted {victim['name']!r}."
        )

    # Final sort: KEEPs by WSJF desc, then DEFERs, then CUTs.
    classified.sort(key=lambda f: (
        {"KEEP": 0, "DEFER": 1, "CUT": 2}[f["classification"]],
        -f["wsjf_score"],
    ))

    if enable_wsjf:
        wsjf_avg_keep = (
            round(sum(f["wsjf_score"] for f in classified if f["classification"] == "KEEP")
                  / max(1, keep_count), 2)
            if keep_count else 0.0
        )
        warnings.append(f"WSJF avg of KEEPs: {wsjf_avg_keep}")

    return classified, warnings
if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Classify features into KEEP / CUT / DEFER.')
    ap.add_argument('--inventory', required=True)
    ap.add_argument('--demo-goal', required=True)
    ap.add_argument('--time-remaining', type=int, required=True)
    ap.add_argument('--out-dir', default='.hackathon')
    ap.add_argument('--enable-wsjf', action='store_true', help='WSJF tie-breaking among off-demo-path features')
    args = ap.parse_args()
    feats = json.loads(open(args.inventory, encoding='utf-8').read())
    classified, warns = classify(feats, args.demo_goal, args.time_remaining, enable_wsjf=args.enable_wsjf)
    out = Path(args.out_dir)
    (out / 'state').mkdir(parents=True, exist_ok=True)
    plan = {
        'version': '1.0',
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'demo_goal': args.demo_goal,
        'time_remaining_minutes': args.time_remaining,
        'wsjf_enabled': args.enable_wsjf,
        'features': classified,
        'warnings': warns,
    }
    (out / 'state' / 'plan.json').write_text(json.dumps(plan, indent=2) + '
', encoding='utf-8')
    keep = sum(1 for f in classified if f['classification'] == 'KEEP')
    cut = sum(1 for f in classified if f['classification'] == 'CUT')
    defer = sum(1 for f in classified if f['classification'] == 'DEFER')
    print(f'KEEP={keep} CUT={cut} DEFER={defer} warnings={len(warns)}')
    for w in warns:
        print(f'warn: {w}')
