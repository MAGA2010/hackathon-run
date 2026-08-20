# Why Hackathon Run exists

Hackathons are won in the last 4 hours, not the first 4. The teams that
ship clean demos at hour 36 are the teams that **made ruthless cuts at hour
6**.

Most open-source "hackathon tools" are code scaffolds (`sahat/hackathon-starter`,
PurdueHackers' kit). They help you start. They don't help you finish.

Hackathon Run is a **decision system**. It does not help you write code.
It helps you decide:

- Which features to keep (KEEP).
- Which features to remove (CUT).
- Which features to defer (DEFER).

…and then act on those decisions without hesitation when time runs out.

## The design rules

1. **Each skill is independently usable.** A contestant at 2am can invoke
   any skill directly.
2. **State passes through the filesystem.** Skills share context
   cooperatively; nothing is mandatory.
3. **Triggers are explicit.** Every skill lists its trigger scenarios.
4. **Body is execution logic.** No marketing inside skill files.
5. **Tests are acceptance criteria.** Every criterion has a shell test.

## The unfashionable bets

- We bet on **files, not databases**. State lives in JSON you can read.
- We bet on **zero-dep scripts**. Python's stdlib only; no numpy, no
  requests.
- We bet on **shell tests**, not Jest. Hackers know bash.
- We bet on **concrete rejection**. `scope-knife` will refuse to mark
  everything KEEP. `ship-pack` will exit 2 if a secret leaks.

These are deliberate. They make the pack boring to install and easy to trust.
