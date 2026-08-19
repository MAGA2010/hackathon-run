---
name: demo-coach
description: Drafts a 30, 60, or 90-second pitch script for the demo, structured as opening, pain, product, action, result, close. Use when the demo is rushed, has no clear narrative, or the team cannot agree on what to say.
when_to_use: |
  Trigger when the user has a working demo but no pitch, is short on time,
  has too many features to show, or wants to sharpen the message. Apply
  after fast-verify so the demo path is confirmed runnable. Do not invoke
  if the demo does not yet run.
---

# demo-coach

## Input contract

Required:

- `demo_goal`: what judges should remember
- `duration_seconds`: 30 | 60 | 90

Optional:

- `audience`: default "hackathon judges"
- `audience_interest`: technical | business | both (default both)
- `.hackathon/state/plan.json` (preferred; uses demo_path)

## Execution

### 1. Compute timing budget

| Duration | Opening | Pain | Product | Core action | Result | Close |
| -------- | ------- | ---- | ------- | ----------- | ------ | ----- |
| 30s      | 5       | 5    | 5       | 10          | 3      | 2     |
| 60s      | 8       | 10   | 10      | 22          | 6      | 4     |
| 90s      | 10      | 15   | 15      | 35          | 10     | 5     |

Seconds are maximums. A coach running long on any step gets cut.

### 2. Compose the one-liner

Formula: _"<Verb> for <target user> that <solves pain> in <time/place>."_

Examples:

- "Receipts that parse themselves for freelancers in 3 seconds."
- "Backups for indie hackers when their VPS dies at 3am."

Refuse if the one-liner exceeds 20 words. Tighten.

### 3. Build the demo flow

For each step, output four lines:

- **SAY**: what to say out loud (no more than 2 sentences)
- **CLICK**: which UI element to interact with
- **SHOW**: what the screen should display
- **NOT**: anti-pattern to avoid (e.g. "do not mention pricing")

### 4. Flag risks

For each step, tag risks:

- `LAG` — could be slow on stage wifi
- `FAIL` — known flaky step (check fast-verify history)
- `EXPLAIN` — hard to articulate in < 10s
- `OVERTIME` — likely to exceed budget

### 5. Write the artifact

Output `.hackathon/state/demo.json` (matches `demo.schema.json`) and
`.hackathon/artifacts/demo-script.md` (printable card for the speaker).

## Output contract

Files written:

- `.hackathon/state/demo.json` (matches `src/state/schemas/demo.schema.json`)
- `.hackathon/artifacts/demo-script.md` (human-readable pitch script)

## Acceptance criteria

- [ ] Fits within the specified duration.
- [ ] Revolves around the demo path.
- [ ] Each step has SAY / CLICK / SHOW / NOT.
- [ ] Does not reference unimplemented features.
- [ ] Flags risks per step.

## Failure modes

| Mode                            | Behavior                                         |
| ------------------------------- | ------------------------------------------------ |
| `demo_goal` missing             | Refuse; point to `scope-knife` output            |
| `duration_seconds` invalid      | Refuse anything but 30, 60, or 90                |
| `audience` is a single word     | Ask once for clarification; refuse to guess      |
| `demo_path` longer than 5 steps | Refuse; ask to compress before writing demo.json |

## Trigger phrases

- "write my pitch"
- "what do I say on stage"
- "the demo is too long"
- "I have too many features"
- "30 second pitch"
- "60 second pitch"
