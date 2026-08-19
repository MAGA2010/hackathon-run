# Example: Mobile (React Native)

A 24-hour React Native client that talks to a hackathon backend. This example
emphasizes **env-doctor** behavior implicit in ship-pack and **demo-coach** for
a 90-second stage demo where the speaker holds a phone.

## What's interesting here

- The demo path is 4 steps; the rest is mobile-platform fluff.
- `ship-pack` will catch a missing Android signing config in the checklist.
- The recovery-runbook is configured for "phone screen frozen" — a unique
  mobile-stage failure mode.
