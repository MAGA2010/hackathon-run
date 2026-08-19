# Example: Web App (Next.js SaaS)

A complete example showing Hackathon Surgeon applied to a 36-hour build of a
Next.js + Postgres SaaS app.

## Project structure

```
examples/web-app/
├── README.md
├── package.json
├── src/
│   ├── auth/
│   ├── billing/
│   ├── dashboard/
│   └── api/
└── .hackathon/
    ├── state/
    │   ├── plan.json
    │   ├── verify.json
    │   ├── demo.json
    │   ├── review.json
    │   └── ship.json
    └── artifacts/
        ├── scope-knife-output.md
        ├── demo-script.md
        ├── judge-sim-output.md
        └── ship-pack-output.md
```

## What the pack produced

### Plan (`plan.json`)

`scope-knife` was invoked at hour 0 with 36 hours remaining. After scanning,
it classified the features:

| Feature | Status | Decision |
|---|---|---|
| Auth (sign up / login) | implemented | KEEP |
| Notes CRUD | implemented | KEEP |
| Search | unimplemented | CUT |
| Dark mode | unimplemented | DEFER |
| Billing (Stripe) | half-implemented | KEEP (P0 polish) |
| Notifications | unimplemented | CUT |

### Demo script (`demo.json`)

A 60-second pitch built by `demo-coach`:

1. Opening (8s): team + project
2. Pain (10s): writers lose notes across apps
3. Product (10s): "Markdown notes that sync, in 3 seconds"
4. Core action (22s): create a note, see it appear
5. Result (6s): 1 metric, no other numbers
6. Close (4s): thank you

### Review (`review.json`)

`judge-sim` scored the project 3.7/5 with these priorities:

- **FIX NOW**: complete Stripe webhook handler (4 hours)
- **FIX LAST 10 MIN**: trim README to 1 page
- **DO NOT TOUCH**: the auth flow

### Ship audit (`ship.json`)

`ship-pack` produced:

- README: 7/7 sections present
- Secret scan: clean
- Checklist: 6/8 passed (missing demo video, screenshots)
- Reproducible: yes
- Packaging command: `tar czf submit.tar.gz --exclude=...`

## How to reproduce

```bash
cd examples/web-app
npm install
hackathon init --force
# Walk through each skill with the values from .hackathon/state/*.json
hackathon run scope-knife    # reads demo_goal from artifacts
hackathon run fast-verify
hackathon run demo-coach
hackathon run judge-sim
hackathon run ship-pack
```

## Lessons learned

- We CUT 8 features by hour 6. Saved ~12 hours.
- The `judge-sim` "do not touch" list saved the demo from a 2am refactor.
- `ship-pack` caught one leaked API key in the demo video link.
