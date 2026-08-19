#!/usr/bin/env python3
"""
build_recovery.py - write .hackathon/state/recovery.json from a failure description.

Reads:
  - .hackathon/state/plan.json (for demo_path context, optional)
  - .hackathon/state/verify.json (for last failure signatures, optional)

Writes:
  - .hackathon/state/recovery.json (matches src/state/schemas/recovery.schema.json)
  - .hackathon/artifacts/recovery-runbook-output.md (human-readable)

Severity rules:
  P0  demo entirely broken           -> video recording + verbal narrative
  P1  core action fails              -> swap to a recorded GIF + verbal walkthrough
  P2  polish issue, demo still works -> skip the broken step, narrate around it
  P3  copy-only error                -> apologize, move on

Usage:
  python3 build_recovery.py --failure "API times out on submit" --severity P0
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VERSION = "1.0"

SEVERITY_FALLBACK: dict[str, dict[str, str]] = {
    "P0": {
        "default": "Switch to a 30-second screen recording of the demo, narrate over it.",
        "do":      "Acknowledge the failure within 5 seconds. Smile.",
        "say":     "Let me show you the demo we ran in rehearsal - it captured the full flow.",
        "not":     "Do NOT debug live on stage. Do NOT apologize for more than 10 seconds.",
    },
    "P1": {
        "default": "Swap to a pre-recorded GIF of the broken step; verbal walk through the rest live.",
        "do":      "Cue the GIF on the backup laptop before the demo starts.",
        "say":     "Here is what this screen does in the live build - watch the action happen here.",
        "not":     "Do NOT pretend the broken step worked. Do NOT click 5 times in a row.",
    },
    "P2": {
        "default": "Skip the broken step in the demo_path. Verbal-narrate around it.",
        "do":      "Rehearse the pivot 3 times before going on stage.",
        "say":     "We will skip this polish item and focus on the core flow.",
        "not":     "Do NOT dwell. Do NOT promise to fix it after the demo.",
    },
    "P3": {
        "default": "Acknowledge the copy error, correct it verbally, move on.",
        "do":      "Make the correction quickly and confidently.",
        "say":     "Small wording slip - what I meant was ...",
        "not":     "Do NOT stop the demo for a P3. Do NOT draw attention to it.",
    },
}


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def derive_context(state_dir: Path) -> tuple[list[str], list[str]]:
    plan = load_json(state_dir / "plan.json") or {}
    verify = load_json(state_dir / "verify.json") or {}
    demo_path: list[str] = []
    for step in plan.get("demo_path", []):
        if isinstance(step, dict) and "action" in step:
            demo_path.append(str(step["action"]))
    last_failures: list[str] = []
    for step in verify.get("steps", []):
        if isinstance(step, dict) and step.get("status") == "fail":
            sig = step.get("error_signature")
            if sig:
                last_failures.append(str(sig))
    return demo_path, last_failures


def build_recovery_steps(severity: str, demo_path: list[str], last_failures: list[str]) -> list[str]:
    steps: list[str] = []
    if last_failures:
        steps.append("Identify root cause from verify.json signature: " + last_failures[0])
    if demo_path and severity in ("P0", "P1"):
        steps.append("Open the pre-recorded backup demo file (link in README under /demo/backup).")
    if severity == "P0":
        steps.append("Reset the stage: close all terminals, restart the backup recording.")
        steps.append("Hand the demo to the teammate while you narrate.")
    elif severity == "P1":
        steps.append("Swap to the GIF / recording of the broken step on the backup laptop.")
        steps.append("Continue the live demo from the next demo_path step.")
    elif severity == "P2":
        steps.append("Skip the broken step; rehearse the pivot.")
        steps.append("Mark it in fix_now list during judge-sim next iteration.")
    else:
        steps.append("Acknowledge, correct verbally, continue.")
    return steps


def build_script(severity: str) -> list[dict[str, Any]]:
    if severity == "P0":
        return [
            {"step": 1, "phase": "acknowledge", "max_seconds": 5,  "line": "We hit a live issue - I'll show you the rehearsal recording."},
            {"step": 2, "phase": "playback",   "max_seconds": 20, "line": "(play the 30-second recording; narrate the value prop over it)"},
            {"step": 3, "phase": "results",    "max_seconds": 3,  "line": "That captures the flow we built tonight."},
            {"step": 4, "phase": "close",      "max_seconds": 2,  "line": "Thanks. Questions?"},
        ]
    if severity == "P1":
        return [
            {"step": 1, "phase": "acknowledge", "max_seconds": 3,  "line": "Live demo hiccup on this step - here's the same flow in the rehearsal capture."},
            {"step": 2, "phase": "playback",   "max_seconds": 12, "line": "(play the GIF; verbal walk-through)"},
            {"step": 3, "phase": "continue",   "max_seconds": 10, "line": "Now let me show you the live build of the next step."},
            {"step": 4, "phase": "close",      "max_seconds": 5,  "line": "That's our core flow."},
        ]
    if severity == "P2":
        return [
            {"step": 1, "phase": "pivot",      "max_seconds": 5,  "line": "Skipping this polish item to focus on the core flow."},
            {"step": 2, "phase": "core",       "max_seconds": 20, "line": "(continue live from the next demo_path step)"},
            {"step": 3, "phase": "close",      "max_seconds": 5,  "line": "That's our core flow."},
        ]
    return [
        {"step": 1, "phase": "acknowledge", "max_seconds": 3, "line": "Small wording slip - what I meant was ..."},
        {"step": 2, "phase": "continue",   "max_seconds": 5, "line": "(continue with the rest of the demo)"},
    ]


def render_artifact(state: dict[str, Any]) -> str:
    fb = state["fallback"]
    out = [
        "# Recovery runbook (" + state["severity"] + ")",
        "",
        "**Failure**: " + state["failure"],
        "",
        "## Default fallback",
        "",
        fb["default"],
        "",
        "## What to do",
        "",
        fb["do"],
        "",
        "## What to say",
        "",
        fb["say"],
        "",
        "## What NOT to do",
        "",
        fb["not"],
        "",
    ]
    if state.get("recovery_steps"):
        out.append("## Recovery steps")
        out.append("")
        for i, s in enumerate(state["recovery_steps"], 1):
            out.append(str(i) + ". " + s)
        out.append("")
    out.append("## Script")
    out.append("")
    for line in state["script"]:
        out.append(str(line["step"]) + ". [" + line["phase"] + "] (" + str(line["max_seconds"]) + "s) " + line["line"])
    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="Build a recovery.json from a failure description")
    ap.add_argument("--failure", required=True, help="one-sentence description of what broke")
    ap.add_argument("--severity", required=True, choices=["P0", "P1", "P2", "P3"])
    ap.add_argument("--repo-root", required=True, help="path to current project root")
    args = ap.parse_args()

    state_dir = Path(args.repo_root) / ".hackathon" / "state"
    artifact_dir = Path(args.repo_root) / ".hackathon" / "artifacts"
    state_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    demo_path, last_failures = derive_context(state_dir)
    fallback = SEVERITY_FALLBACK[args.severity]

    state: dict[str, Any] = {
        "version": VERSION,
        "generated_at": _now_iso(),
        "failure": args.failure,
        "severity": args.severity,
        "fallback": {
            "default": fallback["default"],
            "do":      fallback["do"],
            "say":     fallback["say"],
            "not":     fallback["not"],
        },
        "recovery_steps": build_recovery_steps(args.severity, demo_path, last_failures),
        "script": build_script(args.severity),
    }

    out_state = state_dir / "recovery.json"
    out_artifact = artifact_dir / "recovery-runbook-output.md"
    out_state.write_text(json.dumps(state, indent=2), encoding="utf-8")
    out_artifact.write_text(render_artifact(state), encoding="utf-8")
    print("wrote " + str(out_state))
    print("wrote " + str(out_artifact))
    return 0


if __name__ == "__main__":
    sys.exit(main())
