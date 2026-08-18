# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `0.1.x` | ✅ active development |
| `< 0.1` | ❌ not supported |

## Reporting a vulnerability

**Please do not file a public issue.** Email security@hackathon-surgeon.dev with:

- A clear description of the issue
- Reproduction steps
- Impact assessment

We will respond within 72 hours. Critical issues will be patched in under 14 days.

## Scope

This project ships:

- `SKILL.md` files (prompt content)
- Helper scripts (`Python`, `TypeScript`)
- A CLI that creates `.hackathon/` directories

Vulnerabilities of interest:

- Path traversal in `init`
- Secret leakage in shipped templates or examples
- Arbitrary code execution from untrusted `.hackathon/state/*.json`

## Out of scope

- Issues in upstream dependencies (file with the upstream project)
- Issues in user-supplied `SKILL.md` files in third-party forks
