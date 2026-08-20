# ADR-0010: v1.1 chain execution + per-skill pin + pluggable embedding backend

- Status: Accepted
- Date: 2026-08-20
- Deciders: hackathon-run maintainers

## Context

ADR-0009 introduced Skill Format v2 with `dependencies`, `side_effects`,
and `version` metadata, and explicitly planned two v1.1.0 follow-ups:
`hackathon run --chain` and per-skill version pinning. Two gaps remained:

1. **Chaining was prose-only.** An agent that knew it should run
   `idea-clarify` before `stack-picker` still had to invoke each skill
   manually and remember the order. The `dependencies` field existed but
   nothing consumed it.
2. **Version pinning was pack-level.** `hackathon skills pin` wrote the
   _pack_ version into every entry, so a single skill bump was invisible.
3. **Matching was offline-only.** The token + synonym matcher (ADR-0008)
   is intentionally zero-dep, but some teams wanted true vector similarity
   without giving up the always-available fallback.

## Decision

Ship three additive features in v1.1.0:

- **`hackathon run <skill> --chain`** — resolve the transitive closure of
  `dependencies` with a depth-first topological sort (post-order, deps
  first), then print (or `--apply`) each skill in order. Cycles are
  detected and refused with the cycle path. Unknown dependency names are
  skipped rather than fatal, so a typo does not brick the chain.
- **Per-skill version pin** — `skills pin` records each skill's own
  Format v2 `version` (fallback to pack version when absent). The pin-file
  schema bumps to `1.1`, `skills list` gains a version column, and
  `skills diff` prints a `^ vX -> vY` line when a skill's own version
  changes (folded under the checksum line when both change).
- **Pluggable embedding backend** — `src/harness/embed.ts` reads
  `HACKATHON_EMBED_BACKEND` and, when set, POSTs
  `{ utterance, skills: [{name, description, when_to_use}] }` to the
  endpoint and accepts a ranking back (`best` / `candidates` / `rankings`,
  with tolerant shapes). Any transport or schema failure falls back to the
  local matcher. `HACKATHON_EMBED_TIMEOUT_SECONDS` defaults to 3.
  The MCP `match_skill` tool uses the async matcher; the CLI stays local.

The MCP server loop becomes async with in-flight request tracking so the
embedding fetch can resolve before the stdio process exits, and a 14th
tool `skill_chain` exposes the chain planner over JSON-RPC.

## Consequences

### Positive

- A single `--chain` invocation runs a whole pre-demo pipeline in the
  correct order, reducing the chance of running `scope-knife` after
  `stack-picker`.
- Skill authors get a reason to keep `version` and `dependencies` honest:
  the pin and chain tooling now surface them.
- Teams with a vector backend get semantic matching; everyone else keeps
  the deterministic offline matcher. The fallback is non-negotiable.

### Negative

- The MCP server is no longer purely synchronous; the stdio loop must
  track in-flight requests. The complexity is small but real.
- The embed backend contract is documented, not machine-enforced; a
  misbehaving backend silently degrades to the local matcher (which is
  also the safe default).
- `skills pin` now creates `.hackathon/` if missing, which slightly
  broadens its write surface.

## Alternatives considered

- **In-process vector store (sqlite-vec / hnswlib)** — rejected; it adds
  native deps and violates the zero-dep runtime goal.
- **A `chain` subcommand separate from `run`** — rejected; `--chain` as a
  flag on `run` keeps the UX in one place and reuses `--apply`.
- **Fail on unknown dependency names** — rejected; a hard failure on a
  forward-compatible typo is worse than a warning-level skip during the
  transition to Format v2.

## Follow-ups (planned)

- v1.2.0: optional `homepage` / `repository` / `author` / `license`
  manifest fields for third-party skills.
