# ADR-0013: v1.3 routing, skill security audit, and typed LLM judge

- Status: Accepted
- Date: 2026-09-10
- Deciders: hackathon-run maintainers

## Context

Evaluation showed the matcher was still mostly lexical and the LLM judge
backend accepted underspecified 0-5 scores. Research on Agent Skills also
shows that third-party skills are a real supply-chain risk.

## Decision

1. Route skills with a zero-dependency local BM25 index over description,
   `when_to_use`, tags, and trigger phrases. Exact triggers remain strongest,
   and the embedding backend remains an opt-in reranker.
2. Ship a 36-case routing golden set. CI enforces 95% precision and recall
   with zero false positives.
3. Add `hackathon skills audit` for prompt injection, shell/network risk,
   embedded credentials, destructive paths, and capability mismatches.
4. Define judge protocol v2 with a rubric, evidence, and per-dimension
   rationale/confidence. Accept legacy v1 responses.
5. Add `hackathon judge-calibrate` to measure a backend against a golden set.

## Consequences

### Positive

- Routing decisions are reproducible and regression-tested.
- Third-party skills receive a security review before use.
- LLM judge outputs can be validated and calibrated instead of trusted
  blindly.

### Negative

- BM25 increases local matching cost slightly.
- Static security rules can produce false positives and require review for
  legitimate bundled scripts.
- Protocol v2 adds requirements for backend providers.
