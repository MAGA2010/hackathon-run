#!/usr/bin/env python3
"""
coach.py — emit a structured demo pitch script.

Usage:
    coach.py --demo-goal "users sign up and save their first note" \
             --duration 60 \
             --audience "hackathon judges" \
             --out-dir .hackathon
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


BUDGETS = {
    30: {"opening": 5, "pain": 5, "product": 5, "core_action": 10, "result": 3, "close": 2},
    60: {"opening": 8, "pain": 10, "product": 10, "core_action": 22, "result": 6, "close": 4},
    90: {"opening": 10, "pain": 15, "product": 15, "core_action": 35, "result": 10, "close": 5},
}


def one_liner(demo_goal: str) -> str:
    # Naive lift: split demo_goal into "<verb> <thing>" hints.
    # If the user passed a sentence ending in a period, use it as-is.
    g = demo_goal.strip().rstrip(".")
    if len(g.split()) <= 20:
        return g + "."
    # Trim trailing clauses.
    words = g.split()
    return " ".join(words[:20]).rstrip(",;") + "."


def build_script(demo_goal: str, duration: int, audience: str) -> dict:
    budget = BUDGETS[duration]
    steps = [
        {"name": "opening", "max_seconds": budget["opening"],
         "say": "Hi, I'm with <team>. In the next <N> seconds, I'll show you how we <demo_goal>.",
         "click": "Stand still. Make eye contact with the judges.",
         "show": "Team name and project name on the title slide.",
         "not": "Do not start with 'so' or 'um'. Do not apologize.",
         "risks": ["OVERTIME"] if duration >= 60 else []},
        {"name": "pain", "max_seconds": budget["pain"],
         "say": "Today, <target user> wastes <time> on <pain point>.",
         "click": "None.",
         "show": "A photo or short quote of the user in pain.",
         "not": "Do not lecture. Do not name competitors.",
         "risks": ["EXPLAIN"]},
        {"name": "product", "max_seconds": budget["product"],
         "say": f"We built <product> to fix this. {one_liner(demo_goal)}",
         "click": "Open the app to the home screen.",
         "show": "Branded landing screen.",
         "not": "Do not enumerate features. One sentence only.",
         "risks": ["OVERTIME"]},
        {"name": "core_action", "max_seconds": budget["core_action"],
         "say": "Watch what happens when I <the core action>.",
         "click": "Perform the core action from the demo path.",
         "show": "The product doing its job.",
         "not": "Do not narrate every click. Pause for effect.",
         "risks": ["LAG", "FAIL", "OVERTIME"]},
        {"name": "result", "max_seconds": budget["result"],
         "say": "That saved the user <time/money/effort>.",
         "click": "Show the success state.",
         "show": "Before/after or a single metric.",
         "not": "Do not show 10 metrics. One is enough.",
         "risks": []},
        {"name": "close", "max_seconds": budget["close"],
         "say": "We're <team>. Thank you.",
         "click": "Stand still.",
         "show": "Title slide with repo link or contact.",
         "not": "Do not ask the judge to clap. Do not mention prizes.",
         "risks": []},
    ]
    return {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": duration,
        "audience": audience,
        "audience_interest": "both",
        "one_liner": one_liner(demo_goal),
        "steps": steps,
    }


def render_markdown(script: dict) -> str:
    lines = [
        f"# Demo script ({script['duration_seconds']}s)",
        "",
        f"_Generated: {script['generated_at']}_",
        "",
        f"**Audience:** {script['audience']}",
        "",
        f"**One-liner:** {script['one_liner']}",
        "",
        "## Steps",
        "",
    ]
    total = 0
    for s in script["steps"]:
        total += s["max_seconds"]
        risks = ", ".join(s["risks"]) if s["risks"] else "none"
        lines.append(f"### {s['name'].replace('_', ' ').title()} ({s['max_seconds']}s)")
        lines.append(f"- **SAY**: {s['say']}")
        lines.append(f"- **CLICK**: {s['click']}")
        lines.append(f"- **SHOW**: {s['show']}")
        lines.append(f"- **NOT**: {s['not']}")
        lines.append(f"- **RISKS**: {risks}")
        lines.append("")
    lines.append(f"**Total budget: {total}s**")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--demo-goal", required=True)
    ap.add_argument("--duration", type=int, required=True, choices=[30, 60, 90])
    ap.add_argument("--audience", default="hackathon judges")
    ap.add_argument("--out-dir", default=".hackathon")
    args = ap.parse_args()

    script = build_script(args.demo_goal, args.duration, args.audience)
    state_dir = f"{args.out_dir}/state"
    artifact_dir = f"{args.out_dir}/artifacts"
    import os
    os.makedirs(state_dir, exist_ok=True)
    os.makedirs(artifact_dir, exist_ok=True)

    with open(f"{state_dir}/demo.json", "w", encoding="utf-8") as f:
        json.dump(script, f, ensure_ascii=False, indent=2)
    with open(f"{artifact_dir}/demo-script.md", "w", encoding="utf-8") as f:
        f.write(render_markdown(script))

    print(f"wrote {state_dir}/demo.json")
    print(f"wrote {artifact_dir}/demo-script.md")
    print(f"total budget: {sum(s['max_seconds'] for s in script['steps'])}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())