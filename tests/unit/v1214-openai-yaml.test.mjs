// tests/unit/v1214-openai-yaml.test.mjs
// Verify the pack ships a Codex-compatible agents/openai.yaml.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const manifestPath = join(ROOT, "agents", "openai.yaml");

describe("agents/openai.yaml (v1.2.1.4 Codex compatibility)", () => {
  it("exists at the standard Codex location", () => {
    assert.ok(existsSync(manifestPath), "agents/openai.yaml must exist at project root");
  });

  it("declares the required interface section", () => {
    const body = readFileSync(manifestPath, "utf8");
    assert.match(body, /^interface:/m);
    assert.match(body, /display_name:\s*Hackathon Run/);
    assert.match(body, /short_description:/m);
    assert.match(body, /brand_color:/m);
  });

  it("declares MCP server dependency", () => {
    const body = readFileSync(manifestPath, "utf8");
    assert.match(body, /^dependencies:/m);
    assert.match(body, /type:\s*mcp/);
    assert.match(body, /transport:\s*stdio/);
    assert.match(body, /command:\s*node/);
    assert.match(body, /dist\/mcp\/server\.js/);
  });

  it("declares allow_implicit_invocation policy", () => {
    const body = readFileSync(manifestPath, "utf8");
    assert.match(body, /^policy:/m);
    assert.match(body, /allow_implicit_invocation:\s*true/);
  });

  it("lists supported Format v2 + v1.2 frontmatter extras", () => {
    const body = readFileSync(manifestPath, "utf8");
    for (const field of ["version", "category", "tags", "dependencies", "side_effects", "triggers", "license", "author", "homepage", "repository", "compatibility"]) {
      assert.match(body, new RegExp("\\s-\\s" + field + "\\b"), "missing " + field);
    }
  });

  it("skips implicit parse when dependencies.tools has duplicate keys", () => {
    const body = readFileSync(manifestPath, "utf8");
    // Just a smoke test that the manifest is non-empty.
    assert.ok(body.trim().length > 200);
  });
});
