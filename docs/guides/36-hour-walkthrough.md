# 36-Hour Walkthrough

A typical hackathon is 36 hours. Here's how to use Hackathon Surgeon across
the timeline. Times are relative to start (T+0).

## T+0 — Ideation

```bash
hackathon init
hackathon run scope-knife
```

Decide the **demo goal** before touching code. "User signs up and saves their
first note" beats "a notes app with auth and profiles".

## T+2h — Plan + commit

- Read `.hackathon/state/plan.json`.
- Open a fresh git repo. First commit is `hackathon init` + `plan.json`.
- Add CI that runs `npm run test:all` and `hackathon validate`.

## T+6h — First checkpoint

```bash
hackathon run scope-knife   # re-run; pressure now is < 50% cut
hackathon run fast-verify   # verify the demo path
```

Cut anything that isn't on the demo path. Half-implemented is fine; missing
is not.

## T+18h — Polish

```bash
hackathon run demo-coach --duration 60
hackathon rehearse <demo.json>      # timed run-through
```

Rehearse in front of a teammate. Time it. Cut anything over budget.

## T+30h — Pre-submission self-review

```bash
hackathon run judge-sim
```

Read the **FIX NOW** list. Implement one item per remaining hour.

## T+34h — Final cut + backup

```bash
hackathon run scope-knife   # last cut: 90%+ pressure
hackathon run ship-pack
git archive --format=tar.gz -o submit.tar.gz HEAD
```

`ship-pack` will refuse if a secret is committed. Listen to it.

## T+35h — Demo rehearsal

```bash
hackathon run recovery-runbook --severity P1
```

Generate the fallback script. Memorize the 30-second recovery.

## T+35.5h — Rest

No code. Eat. Hydrate. The 30 minutes before the demo are sacred.

## T+36h — Demo

Run the script. When it works: take the win. When it doesn't:
`recovery-runbook`.
