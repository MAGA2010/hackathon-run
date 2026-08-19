#!/usr/bin/env python3
"""
score.py — produce a 7-dimension scorecard and fix priority list.

Usage:
    score.py --repo-root /path/to/repo --out-dir .hackathon

Reads (if present):
    .hackathon/state/plan.json
    .hackathon/state/demo.json
    .hackathon/state/verify.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


DIMENSIONS = [
    "problem_clarity",
    "originality",
    "completeness",
    "technical_depth",
    "demo_quality",
    "business_value",
    "submission_readiness",
]

DEFAULT_QUESTIONS = {
    "problem_clarity": [
        "What problem does this solve and for whom?",
        "Who is the target user?",
    ],
    "originality": [
        "What is novel compared to existing solutions?",
        "What does this do that existing tools cannot?",
    ],
    "completeness": [
        "Does the demo actually run end-to-end?",
        "Did you run the demo from a clean clone?",
    ],
    "technical_depth": [
        "What was the hardest engineering decision?",
        "What tradeoff did you accept to ship in time?",
    ],
    "demo_quality": [
        "Can you summarize what you built in 30 seconds?",
        "What is the single best moment in the demo?",
    ],
    "business_value": [
        "Who would pay for this and why?",
        "What is the beachhead user segment?",
    ],
    "submission_readiness": [
        "Can a stranger clone and run your project in 5 minutes?",
        "What secrets or keys must not be committed?",
    ],
}

JUDGE_BACKEND_ENV = "HACKATHON_JUDGE_BACKEND"
JUDGE_TIMEOUT_ENV = "HACKATHON_JUDGE_TIMEOUT_SECONDS"


def read_state(path: str) -> dict | None:
    if not os.path.exists(path):
        return None
    try:
        return json.loads(open(path, encoding="utf-8").read())
    except Exception:
        return None


def heuristic_score(dim: str, plan: dict | None, demo: dict | None,
                    verify: dict | None) -> tuple[int, str, list[str], list[str]]:
    """Return (score, deduction_reason, judge_questions, improvements)."""
    # Sensible default score that the user can adjust interactively.
    score = 3
    deduction = ""
    questions: list[str] = []
    improvements: list[str] = []

    if dim == "problem_clarity":
        if demo and demo.get("one_liner"):
            ol = demo["one_liner"]
            if len(ol.split()) <= 12:
                score = 4
            else:
                deduction = "One-liner is too long; tightens poorly."
                improvements.append("Shorten the one-liner to <= 12 words.")
        else:
            deduction = "No one-liner in demo.json; judges will guess the pain."
            questions.append("What problem does this solve and for whom?")
            improvements.append("Run demo-coach and capture a one-liner.")
        questions.append("Who is the target user?")

    elif dim == "originality":
        score = 3
        deduction = "Cannot score without code review; default 3."
        improvements.append("Add a single sentence: 'Unlike X, we Y.'")
        questions.append("What is novel compared to existing solutions?")

    elif dim == "completeness":
        if verify and verify.get("status") == "fail":
            score = 1
            deduction = "verify.json last status is fail; the demo path is broken."
            improvements.append("Run fast-verify and fix the first failure.")
            questions.append("Does the demo actually run end-to-end?")
        elif verify and verify.get("status") == "pass":
            score = 4
            deduction = "Demo path runs; minor gaps remain."
        else:
            score = 2
            deduction = "No verify.json present; completeness is unproven."
            improvements.append("Run fast-verify to record a clean run.")
            questions.append("Did you run the demo from a clean clone?")

    elif dim == "technical_depth":
        score = 3
        deduction = "Heuristic default; reviewer should adjust."
        questions.append("What was the hardest engineering decision?")
        improvements.append("Be ready to explain one non-obvious technical choice in 60 seconds.")

    elif dim == "demo_quality":
        if demo and demo.get("steps"):
            score = 4
            deduction = "demo.json present; rehearse before submission."
            improvements.append("Time the demo with a stopwatch; aim for <= stated budget.")
        else:
            score = 2
            deduction = "No demo.json; pitch is improvised."
            improvements.append("Run demo-coach before the final hour.")
            questions.append("Can you summarize what you built in 30 seconds?")

    elif dim == "business_value":
        score = 3
        deduction = "Cannot score without user interviews; default 3."
        questions.append("Who would pay for this and why?")
        improvements.append("Add one sentence: 'Our beachhead user is X.'")

    elif dim == "submission_readiness":
        score = 2
        deduction = "Heuristic; run ship-pack to verify."
        improvements.append("Run ship-pack before submission.")
        questions.append("Can a stranger clone and run your project in 5 minutes?")

    questions = pad_questions(dim, questions)
    return score, deduction, questions, improvements


def pad_questions(dim: str, questions: list[str]) -> list[str]:
    """Guarantee the review schema's 2..3 question range per dimension."""
    for default in DEFAULT_QUESTIONS.get(dim, []):
        if len(questions) >= 3:
            break
        if default not in questions:
            questions.append(default)
    return questions[:3]


def cap_on_failure(scores: list[dict], failing: bool) -> list[dict]:
    if not failing:
        return scores
    for d in scores:
        if d["score"] > 3:
            d["score"] = 3
            d["deduction_reason"] = (
                "[capped at 3 because verify.json reports fail] "
                + d["deduction_reason"]
            ).strip()
    return scores


def build_fix_priorities(scores: list[dict]) -> dict:
    fix_now: list[str] = []
    fix_last_10min: list[str] = []
    do_not_touch: list[str] = []
    for d in scores:
        for imp in d.get("improvements", []):
            tag = f"[{d['name']}] {imp}"
            if d["score"] <= 2:
                fix_now.append(tag)
            elif d["score"] == 3:
                fix_last_10min.append(tag)
            else:
                do_not_touch.append(tag)
    return {
        "fix_now": fix_now,
        "fix_last_10min": fix_last_10min,
        "do_not_touch": do_not_touch,
    }


def remote_judge(backend: str, plan: dict | None, demo: dict | None,
                 verify: dict | None, failing: bool) -> dict | None:
    """Ask an HTTP LLM judge for scores; return None on any failure.

    The backend contract is intentionally small: POST the state inputs and
    expect a JSON object with a `dimensions` list matching DIMENSIONS order,
    each item carrying `score` (0..5) plus optional rationale fields.
    `overall` is computed from the returned dimensions when omitted.
    """
    payload = {
        "plan": plan,
        "demo": demo,
        "verify": verify,
        "verify_was_failing": failing,
        "dimensions": DIMENSIONS,
    }
    try:
        timeout = float(os.environ.get(JUDGE_TIMEOUT_ENV, "3") or "3")
    except ValueError:
        timeout = 3.0
    request = urllib.request.Request(
        backend,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            if resp.status < 200 or resp.status >= 300:
                return None
            result = json.loads(body)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None

    dims = result.get("dimensions")
    if not isinstance(dims, list) or len(dims) != len(DIMENSIONS):
        return None
    normalized = []
    for i, d in enumerate(dims):
        if not isinstance(d, dict):
            return None
        score = d.get("score")
        if not isinstance(score, (int, float)) or not 0 <= score <= 5:
            return None
        normalized.append({
            "name": DIMENSIONS[i],
            "score": int(score),
            "deduction_reason": str(d.get("deduction_reason") or "LLM judge provided no rationale."),
            "judge_questions": pad_questions(
                DIMENSIONS[i],
                [str(q) for q in d.get("judge_questions", [])],
            ),
            "improvements": [str(i) for i in d.get("improvements", [])],
        })
    overall = result.get("overall")
    if not isinstance(overall, (int, float)):
        overall = round(sum(x["score"] for x in normalized) / len(normalized), 2)
    return {"dimensions": normalized, "overall": round(float(overall), 2)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo-root", required=True)
    ap.add_argument("--out-dir", default=".hackathon")
    args = ap.parse_args()

    state_dir = os.path.join(args.out_dir, "state")
    plan = read_state(os.path.join(state_dir, "plan.json"))
    demo = read_state(os.path.join(state_dir, "demo.json"))
    verify = read_state(os.path.join(state_dir, "verify.json"))

    failing = bool(verify and verify.get("status") == "fail")

    dimensions = []
    for name in DIMENSIONS:
        score, deduction, questions, improvements = heuristic_score(
            name, plan, demo, verify,
        )
        dimensions.append({
            "name": name,
            "score": score,
            "deduction_reason": deduction or "Default score; reviewer should adjust.",
            "judge_questions": questions,
            "improvements": improvements,
        })
    dimensions = cap_on_failure(dimensions, failing)
    overall = round(sum(d["score"] for d in dimensions) / len(dimensions), 2)

    judge_backend = os.environ.get(JUDGE_BACKEND_ENV, "").strip()
    judge_source = "heuristic"
    judge_url = None
    if judge_backend:
        remote = remote_judge(judge_backend, plan, demo, verify, failing)
        if remote is not None:
            dimensions = cap_on_failure(remote["dimensions"], failing)
            overall = remote["overall"]
            judge_source = "llm"
            judge_url = judge_backend
        else:
            print(
                f"warn: LLM judge backend unreachable; using heuristic scores "
                f"(set {JUDGE_BACKEND_ENV} to an HTTP endpoint)",
                file=sys.stderr,
            )
            judge_source = "heuristic-fallback"

    result = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "verify_was_failing": failing,
        "dimensions": dimensions,
        "overall": overall,
        "fix_priorities": build_fix_priorities(dimensions),
        "judge_source": judge_source,
    }
    if judge_url:
        result["judge_backend"] = judge_url

    os.makedirs(state_dir, exist_ok=True)
    artifact_dir = os.path.join(args.out_dir, "artifacts")
    os.makedirs(artifact_dir, exist_ok=True)

    with open(os.path.join(state_dir, "review.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # Render markdown card.
    md = [
        "# Judge Simulation", "",
        f"_Generated: {result['generated_at']}_", "",
        f"**Overall score: {overall} / 5**",
        "",
    ]
    if failing:
        md.append("> :warning: verify.json last status was `fail`. "
                  "Per-dimension scores were capped at 3.")
        md.append("")
    for d in dimensions:
        md.append(f"## {d['name']} - {d['score']}/5")
        md.append("")
        md.append(f"- **Deduction**: {d['deduction_reason']}")
        md.append("- **Likely questions**:")
        for q in d["judge_questions"]:
            md.append(f"  - {q}")
        md.append("- **Improvements**:")
        for imp in d["improvements"]:
            md.append(f"  - {imp}")
        md.append("")

    md.append("## Fix priorities")
    md.append("")
    md.append("### FIX NOW (<30 min, raises score)")
    for x in result["fix_priorities"]["fix_now"]:
        md.append(f"- {x}")
    md.append("")
    md.append("### FIX IN LAST 10 MIN (cosmetic only)")
    for x in result["fix_priorities"]["fix_last_10min"]:
        md.append(f"- {x}")
    md.append("")
    md.append("### DO NOT TOUCH (risks the demo)")
    for x in result["fix_priorities"]["do_not_touch"]:
        md.append(f"- {x}")
    md.append("")

    with open(os.path.join(artifact_dir, "judge-sim-output.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md))

    print(f"wrote {state_dir}/review.json")
    print(f"wrote {artifact_dir}/judge-sim-output.md")
    print(f"overall: {overall}/5")
    return 0


if __name__ == "__main__":
    sys.exit(main())
