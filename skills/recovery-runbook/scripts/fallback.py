#!/usr/bin/env python3
"""
fallback.py - generate an emergency runbook for a live demo failure.

Usage:
    fallback.py --failure "API timed out" --severity P1 \\
                --out-dir .hackathon
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


FALLBACKS = {
    "P0": {
        "default": "video_recording",
        "do": "Switch to the pre-recorded demo video IMMEDIATELY.",
        "say": "The live demo hiccuped; here is what we built.",
        "not": "Do not debug on stage. Do not apologize for more than 5 seconds.",
    },
    "P1": {
        "default": "screenshots",
        "do": "Switch to curated screenshots and walk through them verbally.",
        "say": "The live API is timing out; I have screenshots showing the working flow.",
        "not": "Do not retry the API call. Do not blame the network.",
    },
    "P2": {
        "default": "skip_step",
        "do": "Skip the failing step, narrate the rest of the demo.",
        "say": "I will skip that step and show you the core result instead.",
        "not": "Do not show the failing screen. Do not dwell.",
    },
    "P3": {
        "default": "acknowledge",
        "do": "Acknowledge, smile, continue.",
        "say": "Small typo; moving on.",
        "not": "Do not stop the demo for cosmetic issues.",
    },
}


RECOVERY_STEPS = [
    "Check `lsof -i :<port>` or `netstat -ano | findstr :<port>` - is the server alive?",
    "Tail the last 50 lines of the dev log.",
    "Check `.env` - is the API key present and valid?",
    "Check the upstream service status page (status.openai.com, status.stripe.com, etc.).",
    "Restart the dev server. If still failing, switch to the fallback.",
]


SCRIPT_BY_SEVERITY = {
    "P0": [
        ("acknowledge", 5, "The live demo is having trouble. Here's the recorded version."),
        ("switch", 10, "Pulls up the pre-recorded demo video."),
        ("show", 10, "Video plays through the core flow."),
        ("close", 5, "This is what we built. Thank you."),
    ],
    "P1": [
        ("acknowledge", 5, "The API is timing out; I have screenshots of the working flow."),
        ("switch", 10, "Switches to a screenshot carousel."),
        ("narrate", 10, "Walks through the screenshots pointing at the key features."),
        ("close", 5, "We built a working system. Thank you."),
    ],
    "P2": [
        ("skip", 5, "I'll skip that step and show the result."),
        ("continue", 20, "Continues the rest of the demo as planned."),
        ("close", 5, "This is what we built. Thank you."),
    ],
    "P3": [
        ("acknowledge", 3, "Small typo; moving on."),
        ("continue", 25, "Continues the demo."),
        ("close", 2, "Thank you."),
    ],
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--failure", required=True)
    ap.add_argument("--severity", required=True, choices=["P0", "P1", "P2", "P3"])
    ap.add_argument("--out-dir", default=".hackathon")
    args = ap.parse_args()

    fallback = FALLBACKS[args.severity]
    script = SCRIPT_BY_SEVERITY[args.severity]

    artifact = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "failure": args.failure,
        "severity": args.severity,
        "fallback": fallback,
        "recovery_steps": RECOVERY_STEPS,
        "script": [{"step": i + 1, **dict(zip(("phase", "max_seconds", "line"), s))}
                   for i, s in enumerate(script)],
    }

    state_dir = os.path.join(args.out_dir, "state")
    artifact_dir = os.path.join(args.out_dir, "artifacts")
    os.makedirs(state_dir, exist_ok=True)
    os.makedirs(artifact_dir, exist_ok=True)

    with open(os.path.join(artifact_dir, "recovery-runbook.md"), "w", encoding="utf-8") as f:
        md = [
            "# Recovery Runbook", "",
            f"_Generated: {artifact['generated_at']}_", "",
            f"**Failure**: {args.failure}",
            f"**Severity**: {args.severity}",
            "",
            "## The next 30 seconds",
            "",
            f"- **DO**: {fallback['do']}",
            f"- **SAY**: {fallback['say']}",
            f"- **NOT**: {fallback['not']}",
            "",
            "## Script",
            "",
        ]
        for s in artifact["script"]:
            md.append(f"{s['step']}. ({s['max_seconds']}s, {s['phase']}) {s['line']}")
        total = sum(s["max_seconds"] for s in artifact["script"])
        md.append("")
        md.append(f"**Total: {total}s**")
        md.append("")
        md.append("## Off-stage recovery steps")
        md.append("")
        for s in RECOVERY_STEPS:
            md.append(f"- {s}")
        md.append("")
        f.write("\n".join(md))

    with open(os.path.join(state_dir, "recovery.json"), "w", encoding="utf-8") as f:
        json.dump(artifact, f, ensure_ascii=False, indent=2)

    print(f"wrote {state_dir}/recovery.json")
    print(f"wrote {artifact_dir}/recovery-runbook.md")
    print(f"script total: {sum(s['max_seconds'] for s in artifact['script'])}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())