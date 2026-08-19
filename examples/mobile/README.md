# Example: Mobile (React Native)

A 36-hour-build example: a React Native shell app that talks to the
web-app backend over a tiny REST client. Three screens — Login, Notes,
and a placeholder Settings — wired with the minimum state needed to walk
the canonical demo path.

## Project structure

```
examples/mobile/
├── README.md
├── package.json
├── src/
│   ├── api.ts                # ApiClient: health, listNotes, createNote
│   └── screens/
│       ├── Login.tsx
│       └── Notes.tsx
└── scripts/
    └── smoke.sh             # syntax-checks the TS files via node --check
```

## Quick start

A real React Native build needs Xcode / Android Studio / Expo. The example
stops at the source-code level: every file is checked into the repo and
`scripts/smoke.sh` confirms the API client parses cleanly.

```bash
cd examples/mobile
bash scripts/smoke.sh
```

## What the pack produced

### Plan (`plan.json`)

| Feature             | Status        | Decision |
| ------------------- | ------------- | -------- |
| Auth (Login screen) | implemented   | KEEP     |
| Notes (list + add)  | implemented   | KEEP     |
| Push notifications  | unimplemented | CUT      |
| Settings            | unimplemented | DEFER    |

### Demo script (`demo.json`)

`demo-coach` produced a 30-second mobile demo: log in on the phone, create
a note, switch to the web-app tab, see the same note appear.

### Review (`review.json`)

`judge-sim` recommended:

- **FIX NOW**: add a loading state to the "Save note" pressable
- **FIX LAST 10 MIN**: drop the unused Settings screen link from the
  bottom tab bar

### Ship audit (`ship.json`)

`ship-pack` flagged the dev server URL in the README — safe to publish
as long as it's a `localhost` reference.

## Lessons learned

- React Native + REST is a fast MVP combo; Expo would be even faster
  but breaks the canonical Node-based dev server story.
- Keeping `<TextInput>` + `<FlatList>` from the same module let us
  ship two screens in an evening.
