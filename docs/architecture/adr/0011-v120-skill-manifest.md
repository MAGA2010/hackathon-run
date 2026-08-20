# ADR-0011: v1.2 optional third-party skill manifest fields

- Status: Accepted
- Date: 2026-08-20
- Deciders: hackathon-run maintainers

## Context

Skill Format v2 (ADR-0009) gives every skill discovery metadata
(`version`, `category`, `tags`, `dependencies`, `side_effects`,
`triggers`) but has no way to record _who made the skill, where it lives,
or what license it carries_. For first-party bundled skills that is fine,
but v1.2.0 is where third-party skills can start shipping a complete
manifest.

The [Agent Skills open standard](https://agentskills.io/specification)
defines optional frontmatter for exactly this purpose:

- `license` — a license name or a reference to a bundled license file.
- `compatibility` — a short (max 500 chars) environment/requirements note.
- `metadata` — an arbitrary map from string keys to string values, where
  the community commonly puts `author`, `homepage`, and `repository`.

Our hand-rolled frontmatter parser (ADR-0001, ADR-0009) is deliberately
flat and zero-dependency; it does not parse nested mappings.

## Decision

Add five optional top-level frontmatter fields in v1.2.0:

- `license` (string)
- `compatibility` (string, warn if > 500 chars)
- `author` (string)
- `homepage` (string, warn unless it looks like a URL)
- `repository` (string, warn unless it looks like a URL or `owner/repo`)

We flatten the Agent Skills `metadata` convention into first-class fields
(`author`, `homepage`, `repository`) instead of adding nested-map parsing.
First-class fields are validated and surfaced by `skills search` /
`find_skills` better than an opaque map, which matches the Format v2
philosophy. `license` and `compatibility` use the standard's own names.

All checks are WARN-only: a missing manifest is a quality signal for
third-party distribution, not a correctness failure for bundled skills.

## Consequences

### Positive

- A third-party skill can now be self-describing: author, source, license,
  and environment requirements travel with the SKILL.md.
- `skills search --json` and `find_skills` expose the fields for tooling
  (catalogs, license scanners, installers).
- The parser stays flat and dependency-free; no js-yaml, no nested-map
  special case.

### Negative

- `validate-skill` output gets up to four new WARN lines for every bundled
  skill that omits the manifest, adding noise until teams opt in.
- We intentionally do not implement the standard's `metadata` map, so a
  SKILL.md that nests `author:` under `metadata:` will have that value
  ignored by our parser. Authors should use the flattened fields.

## Alternatives considered

- **Full `metadata` map support** — rejected; it would require nested-map
  parsing in a hand-rolled parser and gives less validation/surface value
  than typed fields.
- **Hard-error on missing manifest** — rejected; bundled skills are
  first-party and should not be forced to carry third-party metadata.
- **Reuse `tags` for license/author** — rejected; tags are free-form and
  do not signal the same contract to tooling.

## Follow-ups (planned)

- v1.3.0: typed LLM judge protocol for `HACKATHON_JUDGE_BACKEND` (ROADMAP).
