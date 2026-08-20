#!/usr/bin/env python3
"""
target.py - pick the best prize to chase and emit positioning notes.

Usage:
    target.py --prizes prizes.json --project plan.json --team-skills python,react --out-dir .hackathon

Writes:
    .hackathon/state/prize.json
    .hackathon/artifacts/prize-strategy.md
"""
from __future__ import annotations

VERSION = "1.0"  # contract pin: hackathon validate-skill checks this

import argparse, json, sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

PRIZE_FIT_TOKENS = {
    "ai-use": ["llm", "openai", "gpt", "transformer", "embedding", "rag", "agent", "claude", "gpt-4", "prompt"],
    "sustainability": ["carbon", "climate", "energy", "recycling", "green", "esg", "renewable"],
    "best-new-developer-tool": ["cli", "ide", "linter", "formatter", "refactor", "compiler", "build", "debug"],
    "best-design": ["ui", "ux", "figma", "animation", "tailwind", "framer", "accessibility"],
    "best-data": ["etl", "pipeline", "warehouse", "lake", "analytics", "dashboard", "sql"],
    "beginner-friendly": ["tutorial", "starter", "boilerplate", "learn", "first-time"],
}

def parse_csv(s): return [t.strip() for t in s.split(',') if t.strip()]

def fit_score(prize, project, team_skills):
    """Compute fit_score in [0, 1]."""
    criteria_words = set()
    for c in prize.get('criteria', []):
        criteria_words.update(w.lower() for w in c.split())
    goal_words = set(project.get('demo_goal', '').lower().split())
    feat_words = set()
    for f in project.get('features', []):
        feat_words.update(w.lower() for w in str(f).split())
    all_words = goal_words | feat_words
    if not criteria_words:
        criteria_overlap = 0.0
    else:
        criteria_overlap = len(criteria_words & all_words) / len(criteria_words)
    if not goal_words or not criteria_words:
        demo_goal_match = 0.0
    else:
        demo_goal_match = len(goal_words & criteria_words) / len(goal_words)
    stack_words = set(s.lower() for s in project.get('stack', []))
    stack_match = 1.0 if (stack_words & criteria_words) else 0.0
    prize_key = prize.get('name', '').lower()
    fit_tokens = set(PRIZE_FIT_TOKENS.get(prize_key, []))
    team_set = set(s.lower() for s in team_skills)
    team_fit = 1.0 if (team_set & fit_tokens) else (0.5 if fit_tokens and (fit_tokens & all_words) else 0.0)
    score = round(0.45 * criteria_overlap + 0.30 * demo_goal_match + 0.15 * stack_match + 0.10 * team_fit, 3)
    return score, {
        'criteria_overlap': round(criteria_overlap, 3),
        'demo_goal_match': round(demo_goal_match, 3),
        'stack_match': stack_match,
        'team_fit': team_fit,
    }

def positioning_notes(prize, project):
    """3-5 concrete actions to position for this prize."""
    notes = []
    notes.append("Lead the first 10 seconds with the " + prize.get("name", "prize") + " angle: name the prize category in your opening line.")
    notes.append("Demo the feature most aligned to the prize criteria FIRST; save nice-to-haves for the end.")
    crit = prize.get('criteria', [])
    if crit:
        notes.append("Mention " + crit[0] + " explicitly during the live demo so judges hear it.")
    notes.append("Update the README headline + first paragraph to mirror the prizes language; judges skim.")
    return notes[:5]

def main():
    ap = argparse.ArgumentParser(description='Pick the best prize to chase.')
    ap.add_argument('--prizes', required=True, help='path to prizes.json (list of {name,criteria,weight})')
    ap.add_argument('--project', required=True, help='path to plan.json')
    ap.add_argument('--team-skills', default='')
    ap.add_argument('--time-remaining', type=int, default=240)
    ap.add_argument('--target-demo-minutes', type=int, default=3)
    ap.add_argument('--previous-prizes', default='', help='comma-separated prize names already won')
    ap.add_argument('--out-dir', default='.hackathon')
    args = ap.parse_args()

    prizes = json.loads(Path(args.prizes).read_text(encoding='utf-8'))
    if not prizes:
        sys.stderr.write('refuse: prizes list is empty')
        return 2
    project = json.loads(Path(args.project).read_text(encoding='utf-8'))
    if not project.get('demo_goal'):
        sys.stderr.write('refuse: project has no demo_goal; run scope-knife first')
        return 2
    team = parse_csv(args.team_skills)
    previous = set(parse_csv(args.previous_prizes))

    scored = []
    for p in prizes:
        s, breakdown = fit_score(p, project, team)
        scored.append({'prize': p, 'score': s, 'breakdown': breakdown})
    scored.sort(key=lambda r: (-r['score'], -r['prize'].get('weight', 1)))

    target = scored[0]
    anti = scored[-2:] if len(scored) >= 2 else []

    rec = {
        'version': '1.0',
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'target_prize': {
            'name': target['prize']['name'],
            'fit_score': target['score'],
            'weight': target['prize'].get('weight', 1),
            'breakdown': target['breakdown'],
            'rationale': 'Best fit across ' + str(len(prizes)) + ' prizes; criteria_overlap=' + str(target['breakdown']['criteria_overlap']) + ' demo_goal_match=' + str(target['breakdown']['demo_goal_match']),
        },
        'anti_targets': [{'name': a['prize']['name'], 'fit_score': a['score'], 'reason': 'lowest fit_score'} for a in anti],
        'positioning': positioning_notes(target['prize'], project),
    }

    out = Path(args.out_dir)
    (out / 'state').mkdir(parents=True, exist_ok=True)
    (out / 'artifacts').mkdir(parents=True, exist_ok=True)
    (out / 'state' / 'prize.json').write_text(json.dumps(rec, indent=2) + ' ', encoding='utf-8')

    md = [
        '# Prize strategy',
        '',
        'Target prize: ' + target['prize']['name'] + ' (fit_score ' + str(target['score']) + ', weight ' + str(target['prize'].get('weight', 1)) + ').',
        '',
        '## Why',
        '',
        '- criteria overlap: ' + str(target['breakdown']['criteria_overlap']),
        '- demo_goal match: ' + str(target['breakdown']['demo_goal_match']),
        '- stack match: ' + str(target['breakdown']['stack_match']),
        '- team fit: ' + str(target['breakdown']['team_fit']),
        '',
        '## Positioning (next 30 minutes)',
        '',
    ]
    for n in rec['positioning']:
        md.append('- ' + n)
    if anti:
        md += ['', '## Skip', '']
        for a in anti:
            md.append('- ' + a['name'] + ' (fit_score ' + str(a['fit_score']) + '): low fit for this project')
    (out / 'artifacts' / 'prize-strategy.md').write_text(' '.join(md) + ' ', encoding='utf-8')

    print('target_prize: ' + target['prize']['name'] + ' (fit_score ' + str(target['score']) + ')')
    print('state:   ' + str(out / 'state' / 'prize.json'))
    print('artifact: ' + str(out / 'artifacts' / 'prize-strategy.md'))
    return 0

if __name__ == "__main__":
    sys.exit(main())

