# ADR-0015: v1.5 MCP structured kernel

- Status: Accepted
- Date: 2026-09-10
- Deciders: hackathon-run maintainers

## Context

The MCP server originally reused CLI commands by temporarily replacing
`console.log`, collecting stdout, and parsing JSON after the fact. That kept
the wrapper small, but it coupled transport to terminal output and created
two correctness risks:

1. Any unrelated log line could corrupt the captured payload.
2. Mutating the global console in a long-lived server can interleave with
   concurrent requests or third-party code.

The MCP surface also accepted unchecked argument objects and returned every
command failure as a successful JSON-RPC tool result.

## Decision

1. CLI modules expose result-producing functions such as `statusResult`,
   `resumeResult`, and `sprintResult`. These return
   `CommandResult<T> = { exitCode, data }` and do not write to stdout.
2. Existing CLI entry points remain unchanged for humans: they call the
   result function and render the same terminal output.
3. The MCP server dispatches directly to result functions. It no longer
   patches `console.log`.
4. Every MCP tool argument object is validated against the tool's JSON
   Schema with Ajv before execution.
5. Every tool response includes `structuredContent` and keeps the text JSON
   content block for backward compatibility.
6. Expected tool failures set `isError: true` and return a structured error,
   while unknown methods and unknown tools remain JSON-RPC errors.
7. `apply_skill_advice` uses `writeState`, giving it schema validation,
   cross-process locking, and atomic rename semantics.
8. The 25 existing MCP tools and their payload field names are preserved.

## Consequences

### Positive

- MCP clients can consume typed fields without parsing human output.
- Schema-invalid requests fail deterministically before side effects.
- Concurrent tool calls cannot corrupt each other through global console
  redirection.
- State advice writes cannot leave truncated JSON or partial merges.
- CLI behavior and MCP behavior stay aligned because both use one result
  layer.

### Negative

- Result-producing functions add a second public surface to maintain.
- Tool schemas and TypeScript option types must stay synchronized.
- Tool errors are now visible in `result.isError`; clients that only inspect
  JSON-RPC `error` values must update their handling.
