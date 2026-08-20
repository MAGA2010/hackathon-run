# ADR-0009: Skill Format v2 — first-class metadata for discovery

- Status: Accepted
- Date: 2026-08-20
- Deciders: hackathon-surgeon maintainers

## Context

In v0.8.0 the SKILL.md frontmatter only carried `name`, `description`,
`when_to_use`, `paths`, `allowed_tools`, `model`. This was enough to drive the
matcher and the per-skill linter, but it had three concrete gaps:

1. **No version** — every skill was implicitly `0.0.0`; we could not pin or
   compare individual skill versions, only the pack-level package version.
2. **No discovery metadata** — agents and CLI users had to read every
   SKILL.md to learn what each skill wrote or what category it belonged to.
   `find_skills` (MCP) and `skills list` (CLI) could not filter by anything
   beyond name.
3. **No dependency / chain semantics** — the prose under "Pairs with:" in each
   SKILL.md was useful to humans but invisible to tooling; the agent could
   not, e.g., ask "which skills pair with scope-knife?".

By v0.8.0 we had 14 skills, 6 of which pair with each other in non-obvious
ways (idea-clarify → scope-knife → team-roster → time-box → ...). The
documentation was spread across the SKILL.md prose and the docs site; we
needed the metadata to live in the frontmatter itself so it is
authoritative, validatable, and queryable.

## Decision

Adopt **Skill Format v2**, extending the YAML frontmatter with these
optional fields:

- `version` (semver, recommended) — the skill's own version.
- `category` (enum) — one of `scoping | building | verifying | demoing |
judging | shipping | recovering | lifecycle`. Drives `skills search
--category` and `find_skills`.
- `tags` (array of strings) — free-form labels for filtering.
- `dependencies` (array of skill names) — other skills this one pairs
  with or chains to. Validated by `validate-skill` against `skills/*/`.
- `side_effects` (array of state-file stems) — which `.hackathon/state/<x>.json`
  files this skill writes. Validated against `src/state/schemas/`.
- `triggers` (array of strings) — supplementary trigger phrases scored by
  the matcher alongside `description`.

All fields are **optional**. Format v1 SKILL.md files continue to load,
parse, validate (with a one-time `missing optional Format v2 field:
version` warning), and run unchanged. There is no migration deadline.

In the same release we ship:

- `src/cli/commands/skills-search.ts` — `hackathon skills search --tag/--category/--writes/--depends-on [--json]`.
- `find_skills` MCP tool (13th tool) — JSON-RPC counterpart with the same
  filter shape.
- `SKILL_CATEGORIES` + `isSkillCategory` exported from `src/harness/types.ts`
  for programmatic consumers.
- Updated linter rules in `src/cli/commands/validate-skill.ts` so missing
  version, unknown category, and unknown dependencies/side_effects are
  caught at lint time.

All 14 bundled skills ship v2 metadata in this release.

## Consequences

### Positive

- Agents can now ask `find_skills({category: "demoing"})` to narrow the
  catalog to two skills, or `{writes: "review"}` to find the judge.
- `side_effects` makes the state-machine diagram in `docs/skills/index.md`
  mechanically derivable from the frontmatter (a future v1.x could remove
  the hand-maintained diagram).
- `dependencies` unlocks a future `--chain` flag that emits the correct
  order in which to invoke skills (planned for v1.1.0).
- `version` unlocks per-skill pins instead of pack-level pins (planned
  for v1.1.0).
- New skills added in the future ship Format v2 metadata from day one via
  `hackathon new-skill` (which now scaffolds the v2 field set as comments).

### Negative

- The YAML parser is hand-rolled (no `js-yaml`); the v2 additions push it
  past 150 lines and make it harder to read. We accepted this in exchange
  for zero new npm dependencies.
- Authors must now keep frontmatter in sync with body. We mitigate by
  having `validate-skill` print tags / triggers as info findings so a
  reviewer can spot-check.
- 14 SKILL.md files now contain ~7 extra lines each. Trivial overhead.

## Alternatives considered

- **JSON frontmatter (TOML-like)** — rejected; we are committing to YAML
  because every other skill ecosystem (Anthropic, Codex, Cursor) uses
  YAML, and the parser is already hand-rolled for it.
- **Sidecar `metadata.json` next to every SKILL.md** — rejected; it
  creates a synchronization hazard between two files and breaks the
  "one skill = one folder = one source of truth" invariant.
- **Embed metadata in the body under a fenced `## Metadata` block** —
  rejected; the matcher runs before body parsing in some flows, and we
  want the metadata to be available before description scoring.
- **Defer Format v2 until v1.0.0** — rejected; the MCP surface already
  needs the filter shape, and forcing agents to scan every skill defeats
  the purpose of having 14 of them.

## Follow-ups (planned)

- v1.0.0: derive the docs/skills/index.md state diagram from
  `side_effects` + `dependencies`.
- v1.1.0: per-skill version pin in `.hackathon/skills.json`.
- v1.1.0: `hackathon run --chain` that follows `dependencies` to invoke
  multiple skills in order.
- v1.2.0: optional `homepage` / `repository` / `author` / `license`
  fields so third-party skills can ship a complete manifest.
