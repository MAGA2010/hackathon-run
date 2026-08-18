---
name: ship-pack
description: Audits a project for submission readiness by checking README completeness, scanning for secret leaks, validating the submission checklist, and emitting a safe packaging command. Use immediately before submitting.
when_to_use: |
  Trigger when the user is about to submit, mentions "shipping" or
  "packaging",", or asks "is this safe to commit". Do not invoke during
  development. Apply after judge-sim so submission_readiness is grounded.
---

# ship-pack

## Input contract

Required:
- `repo_root`: project root

## Execution

### 1. README check

For each of the following, mark present / missing:

- Project name
- One-liner description
- Install steps
- Run steps
- Environment variables (with `.env.example`)
- Demo steps
- Tech stack

### 2. Secret scan

Walk the repo (excluding `node_modules`, `.git`, `dist`, `build`, `.hackathon`).

Search for:

- `.env`, `.env.*` (except `.env.example`)
- `API_KEY=`, `SECRET=`, `TOKEN=`, `PASSWORD=`, `PRIVATE_KEY=`
- AWS / GCP / Azure credential patterns
- Hard-coded JWTs (long base64 strings in code)

Emit one line per finding. **Refuse to proceed if a finding exists.**

### 3. Submission checklist

- [ ] Source code committed
- [ ] README present
- [ ] Demo video / link present
- [ ] Screenshots present
- [ ] Deployment link present
- [ ] Env var documentation present
- [ ] Dependency files committed (package.json, requirements.txt, etc.)
- [ ] Run commands documented

### 4. Reproducibility test

The judge must be able to `git clone && <install> && <run>` in < 5 minutes.
Emit `reproducible: yes | no` with a one-line reason.

### 5. Packaging command

Generate a shell command that excludes:

- `node_modules`, `.venv`, `__pycache__`
- `.env`, `.env.*` (except `.env.example`)
- Local caches (`.cache`, `.next`, `.turbo`)
- Build artifacts (`dist`, `build`, `coverage`)

Default output: `tar czf submit.tar.gz --exclude=... .`

## Acceptance criteria

- [ ] Checks for secret leaks (fails if any found).
- [ ] Checks README for required sections.
- [ ] Checks run steps are documented.
- [ ] Checks submission checklist items.
- [ ] Generates a safe packaging command.
- [ ] Never includes real secrets in the submission package.

## Trigger phrases

- "submit"
- "ship it"
- "package for submission"
- "is it safe to commit"
- "secret leak check"
