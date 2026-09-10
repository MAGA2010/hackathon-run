# MCP protocol

Hackathon Run exposes the same 25 tools over MCP as the v1.5 CLI lifecycle.
The transport is line-delimited JSON-RPC 2.0 over stdio:

```bash
hackathon mcp
```

## Request flow

1. The client sends `tools/call` with a tool `name` and an `arguments`
   object.
2. The server looks up the advertised JSON Schema and validates the
   arguments with Ajv.
3. The tool dispatches to the matching typed CLI result function.
4. The server returns the result as MCP content plus structured content.

Human CLI commands and MCP tools share the same result-producing functions,
so they execute the same validation and state-write logic. The MCP server
does not capture or parse `console.log`.

## Response envelope

Successful tool results contain both a text fallback and a structured object:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"exitCode\": 0,\n  \"verdict\": \"pass\"\n}"
    }
  ],
  "structuredContent": {
    "exitCode": 0,
    "verdict": "pass"
  }
}
```

The text block is JSON for backward compatibility. `structuredContent` is
the authoritative machine-readable form for new clients.

## Failure semantics

- Invalid arguments return a tool result with `isError: true`, the tool
  name, and an `issues` array.
- Expected command failures such as a missing state file, failed sprint
  acceptance, or a skill validation error return `isError: true` with the
  command payload and `exitCode`.
- Unknown tools and unknown JSON-RPC methods return JSON-RPC errors because
  no tool invocation occurred.
- Uncaught implementation errors are converted to a tool result with
  `isError: true` and an error message.

## State writes

`apply_skill_advice` is the only MCP tool that writes arbitrary state advice.
It accepts `plan`, `verify`, `review`, `demo`, `ship`, and `recovery`, applies
optional deep merge, validates the final object against the matching state
schema, then writes through the shared cross-process lock and atomic rename
path. A rejected payload never replaces the current file.
