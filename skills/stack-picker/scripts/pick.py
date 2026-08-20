#!/usr/bin/env python3
"""
pick.py - score every viable stack and emit the top recommendation
plus a 30-minute bootstrap walkthrough for it.

Usage:
    pick.py --team-skills python,javascript --time-remaining 480 \
            --demo-format web --prize-category "best new developer tool" \
            --must-integrate stripe --out-dir .hackathon

Writes:
    .hackathon/state/stack.json
    .hackathon/artifacts/stack-bootstrap.md
"""
from __future__ import annotations

VERSION = "1.0"  # contract pin: hackathon validate-skill checks this

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

CANDIDATES = [
    {
        "stack": "next-app-router",
        "needs": ["javascript", "typescript"],
        "formats": ["web"],
        "speed": 0.9,
        "setup_cost": 1,
        "prize_fit": ["best new developer tool", "best ai use"],
        "bootstrap": [
            "npx create-next-app@latest my-app --typescript --eslint --app",
            "cd my-app && npm run dev",
            "open http://localhost:3000",
        ],
    },
    {
        "stack": "vite-react",
        "needs": ["javascript", "typescript"],
        "formats": ["web"],
        "speed": 0.9,
        "setup_cost": 1,
        "prize_fit": ["best new developer tool"],
        "bootstrap": [
            "npm create vite@latest my-app -- --template react-ts",
            "cd my-app && npm install && npm run dev",
            "open http://localhost:5173",
        ],
    },
    {
        "stack": "fastapi",
        "needs": ["python"],
        "formats": ["api", "data", "ml"],
        "speed": 0.85,
        "setup_cost": 1,
        "prize_fit": ["best ai use", "best new developer tool"],
        "bootstrap": [
            "python -m venv .venv && source .venv/bin/activate",
            "pip install fastapi uvicorn",
            "uvicorn app:app --reload  # create app.py with `app = FastAPI()` first",
        ],
    },
    {
        "stack": "flask",
        "needs": ["python"],
        "formats": ["api", "data"],
        "speed": 0.85,
        "setup_cost": 1,
        "prize_fit": ["best ai use"],
        "bootstrap": [
            "python -m venv .venv && source .venv/bin/activate",
            "pip install flask",
            "flask --app app run --reload  # create app.py with `app = Flask(__name__)` first",
        ],
    },
    {
        "stack": "expo-react-native",
        "needs": ["javascript", "typescript", "react-native"],
        "formats": ["mobile"],
        "speed": 0.7,
        "setup_cost": 2,
        "prize_fit": ["best new developer tool"],
        "bootstrap": [
            "npx create-expo-app my-app --template blank-typescript",
            "cd my-app && npx expo start",
            "scan the QR with Expo Go on your phone",
        ],
    },
    {
        "stack": "node-express",
        "needs": ["javascript", "typescript"],
        "formats": ["api", "web"],
        "speed": 0.85,
        "setup_cost": 1,
        "prize_fit": ["best new developer tool"],
        "bootstrap": [
            "npm init -y && npm install express",
            "node server.js  # write `const express = require('express'); const app = express();` first",
            "curl http://localhost:3000",
        ],
    },
    {
        "stack": "streamlit",
        "needs": ["python"],
        "formats": ["data", "ml", "web"],
        "speed": 0.95,
        "setup_cost": 1,
        "prize_fit": ["best ai use", "best sustainability"],
        "bootstrap": [
            "python -m venv .venv && source .venv/bin/activate",
            "pip install streamlit",
            "streamlit run app.py  # write a 1-file app.py with `import streamlit as st`",
        ],
    },
    {
        "stack": "go-http",
        "needs": ["go"],
        "formats": ["api", "cli"],
        "speed": 0.8,
        "setup_cost": 1,
        "prize_fit": ["best new developer tool"],
        "bootstrap": [
            "go mod init myapp",
            "create main.go with a net/http server on :8080",
            "go run main.go && curl http://localhost:8080",
        ],
    },
    {
        "stack": "rust-cargo",
        "needs": ["rust"],
        "formats": ["cli", "api"],
        "speed": 0.6,
        "setup_cost": 2,
        "prize_fit": ["best new developer tool"],
        "bootstrap": [
            "cargo new myapp && cd myapp",
            "cargo run  # prints Hello, world!",
        ],
    },
]


def parse_csv(s):
    return [t.strip() for t in s.split(",") if t.strip()]


def score(c, team, prize):
    overlap = team & set(c["needs"])
    skill_match = len(overlap) / len(c["needs"]) if c["needs"] else 0
    if prize is None:
        prize_fit = 0.5
    elif prize in c["prize_fit"]:
        prize_fit = 1.0
    else:
        prize_fit = 0.1
    s = skill_match * 3 + c["speed"] * 2 + prize_fit * 2 - c["setup_cost"]
    return s, {
        "stack": c["stack"],
        "score": round(s, 2),
        "skill_match": round(skill_match, 2),
        "speed": c["speed"],
        "prize_fit": round(prize_fit, 2),
        "setup_cost": c["setup_cost"],
        "bootstrap": c["bootstrap"],
    }


def main():
    ap = argparse.ArgumentParser(description="Score every viable stack and emit the top pick.")
    ap.add_argument("--team-skills", required=True)
    ap.add_argument("--time-remaining", type=int, required=True)
    ap.add_argument("--demo-format", required=True, choices=["web", "mobile", "desktop", "cli", "api", "data", "ml", "hardware"])
    ap.add_argument("--prize-category", default=None)
    ap.add_argument("--must-integrate", default=None)
    ap.add_argument("--team-size", type=int, default=1)
    ap.add_argument("--out-dir", default=".hackathon")
    args = ap.parse_args()

    team = set(parse_csv(args.team_skills))
    if not team:
        sys.stderr.write("refuse: team_skills is empty; add at least one skill\n")
        return 2

    candidates = [c for c in CANDIDATES if args.demo_format in c["formats"]]
    if not candidates:
        sys.stderr.write(f"refuse: no viable stacks for demo_format={args.demo_format}\n")
        return 2

    scored = [score(c, team, args.prize_category) for c in candidates]
    scored.sort(key=lambda t: t[0], reverse=True)
    top_score, top = scored[0]
    runners = [s[1] for s in scored[1:3]]
    anti_score, anti = scored[-1]

    needs = next(c["needs"] for c in CANDIDATES if c["stack"] == top["stack"])
    matched = len(team & set(needs))

    rec = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "demo_format": args.demo_format,
        "recommendation": {
            "stack": top["stack"],
            "score": top["score"],
            "rationale": (
                f"team has {matched} of {len(needs)} required skills; "
                f"setup_cost={top['setup_cost']}min; speed={top['speed']}"
            ),
        },
        "runners_up": [{"stack": r["stack"], "score": r["score"]} for r in runners],
        "bootstrap": {
            "steps": top["bootstrap"],
            "estimated_minutes": top["setup_cost"] + 25,
        },
    }

    out = Path(args.out_dir)
    state_dir = out / "state"
    artifact_dir = out / "artifacts"
    state_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "stack.json").write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")

    md = [
        f"# Bootstrap for {top['stack']}",
        "",
        f"Estimated total time: ~{top['setup_cost'] + 25} minutes.",
        "",
        "Steps:",
    ]
    for i, step in enumerate(top["bootstrap"], 1):
        md.append(f"{i}. `{step}`")
    md += ["", "## Why this stack", "", f"- Skill match: {top['skill_match']}", f"- Speed ceiling: {top['speed']}", f"- Prize fit: {top['prize_fit']}", f"- Setup cost: {top['setup_cost']} min", "", "## Runners-up", ""]
    for r in runners:
        md.append(f"- {r['stack']} (score {r['score']})")
    md.append("")
    md.append(f"## Anti-recommendation: {anti['stack']} (score {anti['score']})")
    (artifact_dir / "stack-bootstrap.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    print(f"recommendation: {top['stack']} (score {top['score']})")
    print(f"state:   {state_dir / 'stack.json'}")
    print(f"artifact: {artifact_dir / 'stack-bootstrap.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())