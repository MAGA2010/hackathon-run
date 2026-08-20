# Hackathon Run GitHub Action

Reusable composite action that wraps the `@maga2010/hackathon-run` CLI
for use in any GitHub Actions workflow.

## Usage

```yaml
- uses: actions/checkout@v4
- uses: MAGA2010/hackathon-run/.github/action@main
  with:
    command: validate-skills

# Or to match an utterance to a skill:
- uses: MAGA2010/hackathon-run/.github/action@main
  with:
    command: match
    utterance: 'the demo path is broken'

# Or to scaffold a new skill in the calling repo:
- uses: MAGA2010/hackathon-run/.github/action@main
  with:
    command: new-skill
    skill: my-cool-skill
```

## Inputs

| Input     | Required | Default  | Description                                                                         |
| --------- | -------- | -------- | ----------------------------------------------------------------------------------- |
| command   | yes      | -        | One of: `validate-skills`, `validate-state`, `list`, `status`, `match`, `new-skill` |
| skill     | no       | (empty)  | Skill name for `match` and `new-skill`                                              |
| utterance | no       | (empty)  | Utterance for `match`                                                               |
| cwd       | no       | `.`      | Working directory (defaults to repo root)                                           |
| version   | no       | `latest` | `@maga2010/hackathon-run` version to install                                        |

## Subcommands

### validate-skills

Runs `hackathon validate-skill` against every bundled skill under
`skills/*/`. Exits non-zero if any skill has a contract error.

### validate-state

Runs `hackathon validate` against `.hackathon/state/`. Continues on
error (the schema is intentionally evolving).

### list

Prints every bundled skill name + description. Useful for changelog
generation or matrix builds.

### status

Prints the lifecycle stage across the 5 state files. Useful as a PR
comment bot.

### match

Runs `hackathon match --debug <utterance>` and prints the best skill
plus the candidate scores. Useful for evaluating the matcher's
accuracy against a golden utterance set.

### new-skill

Scaffolds a brand-new skill folder in `skills/<name>/` with SKILL.md,
scripts, references, and (optionally) tests. Designed for use as the
first step of a multi-step workflow that fills in the scaffold.
