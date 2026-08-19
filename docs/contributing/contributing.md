# Contributing

See the top-level [`CONTRIBUTING.md`](https://github.com/MAGA2010/hackathon-run/blob/main/CONTRIBUTING.md) for the full
guide. Key points:

- Use the [skill template](skill-template.md) when adding a skill.
- Frontmatter `description + when_to_use` <= 1536 chars (CI enforced).
- Add at least one shell test per acceptance criterion.
- Open a draft PR early for design feedback.

## Local development

```bash
nvm use
npm install
./scripts/bootstrap.sh     # one-time
npm run test:all           # everything
npm run build              # rebuild dist/
```

## Adding a new skill — short version

1. Create `skills/<kebab-case-name>/SKILL.md`.
2. Add scripts under `skills/<kebab-case-name>/scripts/`.
3. Add `tests/acceptance/test_<kebab-case-name>.sh` mapping 1:1 to
   acceptance criteria.
4. Run `npm run test:all` and `hackathon list` to verify.
5. Open a PR.
