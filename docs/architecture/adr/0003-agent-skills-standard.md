---
id: adr-0003
title: Skills follow the Agent Skills open standard
status: accepted
date: 2025-12-19
---

## Context

The Agent Skills specification was published by Anthropic on 2025-10-16 and
released as an open, cross-platform standard on 2025-12-18. Both OpenAI Codex
and Anthropic Claude Code now read the same `SKILL.md` shape. Hackathon
Surgeon must publish skills that load in either runtime without translation.

## Decision

Hackathon Surgeon skills conform to the Agent Skills spec:

- One folder per skill under `skills/`.
- A `SKILL.md` with YAML frontmatter (`name`, `description`, optional
  `when_to_use`, `paths`, `allowed_tools`, `model`).
- Body of `SKILL.md` is execution logic only.
- Optional scripts, templates, references, assets in sibling folders.
- Progressive disclosure: only frontmatter in agent context at startup;
  full body loaded when the skill is invoked; scripts loaded on demand.

We exceed the spec in two ways:

1. We **enforce** a 1536-character trigger budget
   (`description + when_to_use`) via CI. The spec recommends discipline but
   does not enforce.
2. We **publish** a JSON Schema for every state file a skill produces,
   so that cross-skill handoffs are type-checked.

## Consequences

- Skills load identically in Codex, Claude Code, Cursor, and our CLI.
- Contributors can copy a skill to any Agent Skills runtime without changes.
- The trigger-budget guardrail becomes a forcing function for prompt writing.
- We inherit the spec's future evolution; breaking changes upstream will
  require a major version bump.

## References

- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://openai.com/codex (Codex Skills docs)
- This project's own `src/harness/frontmatter.ts` for the parser.

