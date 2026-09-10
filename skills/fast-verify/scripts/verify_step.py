#!/usr/bin/env python3
"""
verify_step.py — execute a single verification step.

Each step has a command (string) and an expected outcome pattern. We run
the command with a timeout, capture output, and classify the result.

Usage:
    verify_step.py --command "npm run dev" --expected-outcome "compiled" \
                   --timeout 30
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def run(cmd: str, timeout: int) -> tuple:
    try:
        proc = subprocess.run(
            cmd, shell=True, capture_output=True,
            text=True, timeout=timeout,
        )
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"timeout after {timeout}s"
    except Exception as e:
        return 1, "", f"runner error: {e}"


def expected_is_present(expected: str, stdout: str, stderr: str) -> bool:
    if not expected.strip():
        return True
    haystack = f"{stdout}\n{stderr}".lower()
    return expected.strip().lower() in haystack


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--command", required=True)
    ap.add_argument("--expected-outcome", default="")
    ap.add_argument("--timeout", type=int, default=30)
    args = ap.parse_args()

    started_at = datetime.now(timezone.utc).isoformat()
    start = time.time()
    code, stdout, stderr = run(args.command, args.timeout)
    duration = time.time() - start
    finished_at = datetime.now(timezone.utc).isoformat()
    outcome_present = expected_is_present(args.expected_outcome, stdout, stderr)
    status = "pass" if code == 0 and outcome_present else "fail"
    # Prefer a line that starts with a common error marker.
    sig = ""
    if stderr:
        for line in stderr.strip().splitlines():
            ls = line.strip()
            if ls.startswith(("Error:", "error:", "Traceback", "FATAL", "panic:", "TypeError", "ReferenceError", "SyntaxError")):
                sig = ls[:500]
                break
        if not sig:
            sig = stderr.strip().splitlines()[0][:500]

    result = {
        "status": status,
        "exit_code": code,
        "expected_outcome": args.expected_outcome,
        "outcome_present": outcome_present,
        "duration_seconds": round(duration, 3),
        "actual_outcome": (stdout.strip().splitlines()[-1] if stdout else "")[:200],
        "error_signature": sig,
        "cwd": os.getcwd(),
        "started_at": started_at,
        "finished_at": finished_at,
        "stdout_sha256": sha256_text(stdout),
        "stderr_sha256": sha256_text(stderr),
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0 if status == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
