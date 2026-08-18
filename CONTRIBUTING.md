# Contributing to Hackathon Surgeon

> Ship the demo, not the dream. **Including your contributions.**

Thanks for being here. This project is small, opinionated, and only useful if every piece ships in real hackathons. Please read this before opening a PR.

## Code of conduct

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). TL;DR: be kind, assume good faith, no harassment.

## How to contribute

| Contribution type | Where to start |
|---|---|
| Fix a bug | Comment on the issue, then open a PR |
| Add a new skill | Follow the [skill template](docs/contributing/skill-template.md). Open a discussion first. |
| Improve docs | Open a PR directly |
| Add an example | Open a discussion first to align on the project |
| Triage issues | Comment on issues with reproductions, then tag |

## Development environment

Requirements:

- Node.js `^20.0.0` (see `.nvmrc`)
- Python 3.9+ (for `scan_repo.py` and other analysis scripts)
- Bash (for tests)

Setup:

`ash
git clone https://github.com/hackathon-surgeon/hackathon-surgeon
cd hackathon-surgeon
nvm use                        # or fnm use
npm install
./scripts/bootstrap.sh
npm run test:all
`

## The skill contract (non-negotiable)

Every skill must satisfy:

1. `skills/<name>/SKILL.md` with valid YAML frontmatter.
2. `description` + `when_to_use` total length <= **1536 characters**. This is enforced by CI.
3. The first sentence of `description` is a verb phrase that explains the action ("Classifies", "Generates", "Verifies", ...).
4. Trigger scenarios are listed in `description` or `when_to_use`.
5. The body of `SKILL.md` is **execution logic only** — no backstory, no changelog, no marketing.
6. Acceptance criteria are listed in a `## Acceptance Criteria` section.
7. At least one shell test in `tests/<skill>.test.sh` that exercises the acceptance criteria.
8. A JSON state schema in `src/state/schemas/` if the skill produces state.

Use the [skill template](docs/contributing/skill-template.md) as your starting point. The CI will reject PRs that violate the contract.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). Examples:

`
feat(scope-knife): add pressure-aware cut enforcement
fix(demo-coach): clamp 30s scripts to <= 32 lines
docs(readme): clarify init workflow
test(fast-verify): add fixture for half-implemented repo
`

## Pull request process

1. Open a draft PR early to get design feedback.
2. Reference the issue (e.g. Closes #42).
3. Fill out the PR template fully.
4. CI must be green before review.
5. `SKILL.md` changes require **two** reviews (one from a core maintainer).
6. Squash-merge with a Conventional Commit message.

## Release process

Maintainers only. Tag-driven, automated by `.github/workflows/release.yml`:

- Push a `vX.Y.Z` tag
- CI runs full test matrix
- CHANGELOG entry generated from commits since last tag
- npm package published to `@hackathon-surgeon/cli`
- GitHub Release created

## What we will (probably) reject

- New skills that duplicate an existing one.
- Skills without tests.
- `SKILL.md` files over the character limit.
- Marketing copy in skill bodies.
- Dependencies that are not absolutely required.

## What we want

- Bug reports with reproducible steps.
- Tests that fail before the fix.
- Skills with a real hackathon story behind them.
- Docs that explain *why*, not just *what*.

Welcome aboard. 🔪
