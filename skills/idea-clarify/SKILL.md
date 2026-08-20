---
name: idea-clarify
description: Surfaces what the user actually wants when the repo is empty or the request is one paragraph of vibes. Use before scope-knife on empty repos or vague briefs; do not invoke after a plan exists.
when_to_use: |
  Trigger when scope-knife refuses to run because the repo is empty, the
  idea is too vague, or the user gave a one-paragraph brief. Run as a
  pre-step to scope-knife. Do not invoke once scope-knife has produced
  a plan; switch to scope-knife directly.

version: 1.0
category: scoping
tags: ['empty-repo', 'vague-brief', 'pre-scope']
dependencies: ['scope-knife']
triggers:
  ['we have no idea', 'what are we building', 'empty repo', 'vague brief', 'scope is unclear']
---

# idea-clarify

When a team shows up with an empty repo and a sentence, the problem is
not "we have no features". It's "we have no shared picture of what
we're building." This skill forces that picture into the open.

## Input contract

Required:

- `user_brief`: the raw one-paragraph description from the user
- `audience`: who the demo is for (judges, customers, internal team)

Optional:

- `time_remaining_minutes`: integer >= 0 (default 36 * 60)
- `prior_artifacts`: list of any pre-existing notes, sketches, links

## Execution

### 1. Surface the problem

Ask the user the four canonical questions:

| #   | Question                                                          | Why it matters            |
| --- | ----------------------------------------------------------------- | ------------------------- |
| 1   | Who is the user and what are they trying to do?                   | defines the value prop    |
| 2   | What does success look like at the demo?                          | locks the demo_path later |
| 3   | What's the smallest thing we can show that proves the idea works? | prevents over-building    |
| 4   | What's the one thing we cannot ship without?                      | forces a hard priority    |

Refuse to proceed until each answer is at least one concrete sentence.

### 2. Detect contradictions

If two answers contradict (e.g. "we want ML" + "no ML allowed"),
surface the contradiction. Do not silently pick one. The agent must
resolve it before scope-knife runs.

### 3. Emit a one-page brief

Write `.hackathon/artifacts/idea-brief.md` with:

- the four answers verbatim
- any contradictions + how the agent resolved them
- a one-line `demo_goal` candidate
- a one-line `mvp_axis` (the smallest axis along which the MVP can grow)

## Output contract

Files written:

- `.hackathon/artifacts/idea-brief.md` (human-readable, one page)

This skill does NOT write to `.hackathon/state/*.json` directly.
It is a pre-scope-knife step; `scope-knife` reads the brief and writes
`plan.json` from it.

## Acceptance criteria

- [ ] The four canonical questions are asked exactly once.
- [ ] Contradictions are surfaced, not silently resolved.
- [ ] `demo_goal` is a single sentence (max 20 words).
- [ ] `mvp_axis` is a single noun phrase.
- [ ] `.hackathon/artifacts/idea-brief.md` exists and is <= 1 page.

## Failure modes

| Mode                       | Behavior                                    |
| -------------------------- | ------------------------------------------- |
| User gives one-word answer | Ask again, refuse to guess                  |
| User refuses to answer     | Surface as contradiction; refuse to proceed |
| Contradiction detected     | Block until resolved                        |
| Time < 1h                  | Skip step 1 questions; ask 3 + 4 only       |

## Trigger phrases (for agent intent matching)

- "we have an empty repo"
- "what should we build"
- "the brief is one paragraph"
- "we have an idea but no plan"
- "idea is too vague"
