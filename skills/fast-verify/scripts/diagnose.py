#!/usr/bin/env python3
"""
diagnose.py - given a failed step's error signature, propose a one-line fix.

Usage:
    diagnose.py --signature "curl: (7) Failed to connect to localhost port 3000"
"""
from __future__ import annotations

VERSION = "1.0"  # contract pin: hackathon validate-skill checks this

import argparse
import json
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


DIAGNOSES = [
    (re.compile(r"connection refused", re.I), {
        "likely_cause": "Dev server not started or wrong port.",
        "minimal_fix": "Start the dev server (npm run dev / python -m uvicorn app:app).",
        "re_verify_command": "curl -fsS http://localhost:<port>",
    }),
    (re.compile(r"failed to connect", re.I), {
        "likely_cause": "Dev server not started or wrong port.",
        "minimal_fix": "Start the dev server (npm run dev / python -m uvicorn app:app).",
        "re_verify_command": "curl -fsS http://localhost:<port>",
    }),
    (re.compile(r"enoent.*package\.json", re.I), {
        "likely_cause": "Wrong directory; no package.json found.",
        "minimal_fix": "cd into the project root before running.",
        "re_verify_command": "ls package.json",
    }),
    (re.compile(r"cannot find module", re.I), {
        "likely_cause": "Dependencies not installed.",
        "minimal_fix": "npm install / pip install -r requirements.txt",
        "re_verify_command": "ls node_modules | head",
    }),
    (re.compile(r"port.*already in use", re.I), {
        "likely_cause": "Port collision; another process is listening.",
        "minimal_fix": "Kill the process on that port or change the dev server port.",
        "re_verify_command": "lsof -i :<port> (or netstat on Windows)",
    }),
    (re.compile(r"eaddrinuse", re.I), {
        "likely_cause": "Port already bound.",
        "minimal_fix": "Stop the conflicting process or use a different port.",
        "re_verify_command": "netstat -ano | findstr :<port>",
    }),
    (re.compile(r"modulenotfound", re.I), {
        "likely_cause": "Python module not in PYTHONPATH.",
        "minimal_fix": "pip install -r requirements.txt",
        "re_verify_command": "python -c 'import <module>'",
    }),
    (re.compile(r"unauthorized|401|403", re.I), {
        "likely_cause": "Missing or invalid API key.",
        "minimal_fix": "Set the required env var from .env.example.",
        "re_verify_command": "echo $API_KEY | head -c 8",
    }),
    (re.compile(r"timeout", re.I), {
        "likely_cause": "Network call exceeded the wait window.",
        "minimal_fix": "Increase timeout, or check upstream service status.",
        "re_verify_command": "ping -c 1 <host>",
    }),
]


def diagnose(signature: str) -> dict:
    for pat, diag in DIAGNOSES:
        if pat.search(signature):
            return diag
    return {
        "likely_cause": "Unknown failure pattern.",
        "minimal_fix": "Read the full stderr; check recent code changes.",
        "re_verify_command": "<re-run the failing command>",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--signature", required=True)
    args = ap.parse_args()
    result = diagnose(args.signature)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())