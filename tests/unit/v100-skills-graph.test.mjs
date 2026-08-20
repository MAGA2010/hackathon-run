// tests/unit/v100-skills-graph.test.mjs
// Tests for the skills graph emitter.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { graph as skillsGraph } from "../../dist/cli/commands/skills-graph.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = HERE.replace(/tests[/\\\\]unit.*$/, "");

function capture(fn) {
  const captured = [];
  const orig = console.log;
  console.log = (...a) => captured.push(a.join(" "));
  try { fn(); } finally { console.log = orig; }
  return captured.join("\n");
}

describe("skills graph mermaid", () => {
  it("emits a flowchart with all 14 skill subgraphs", () => {
    const out = capture(() => skillsGraph({ cwd: REPO, format: "mermaid", type: "all" }));
    assert.match(out, /^flowchart LR/m);
    assert.match(out, /subgraph scoping/);
    assert.match(out, /subgraph verifying/);
    assert.match(out, /subgraph demoing/);
    assert.match(out, /subgraph judging/);
    assert.match(out, /subgraph shipping/);
    assert.match(out, /subgraph recovering/);
    assert.match(out, /subgraph lifecycle/);
    for (const skill of [
      "idea-clarify",
      "scope-knife",
      "fast-verify",
      "demo-coach",
      "judge-sim",
      "ship-pack",
      "recovery-runbook",
      "pivot",
      "time-box",
      "stack-picker",
      "retro",
      "demo-rehearsal",
      "team-roster",
      "decision-log",
    ]) {
      assert.ok(out.includes(skill), `mermaid output missing ${skill}`);
    }
  });

  it("emits dependency arrows in --type deps", () => {
    const out = capture(() => skillsGraph({ cwd: REPO, format: "mermaid", type: "deps" }));
    assert.match(out, /scope_knife --> decision_log/);
    assert.match(out, /demo_coach --> judge_sim/);
    assert.match(out, /judge_sim --> ship_pack/);
    // side-effects subgraph must NOT appear in --type deps.
    assert.doesNotMatch(out, /subgraph states/);
  });

  it("emits dashed side-effect arrows in --type effects", () => {
    const out = capture(() => skillsGraph({ cwd: REPO, format: "mermaid", type: "effects" }));
    assert.match(out, /subgraph states/);
    assert.match(out, /state_demo/);
    assert.match(out, /scope_knife -.-> state_plan/);
    // dependency arrows (solid) must NOT appear in --type effects.
    assert.doesNotMatch(out, /scope_knife --> decision_log/);
  });
});

describe("skills graph dot", () => {
  it("emits a digraph", () => {
    const out = capture(() => skillsGraph({ cwd: REPO, format: "dot" }));
    assert.match(out, /^digraph skills/m);
    assert.match(out, /digraph skills {/);
  });
});

describe("skills graph ascii", () => {
  it("emits human-readable adjacency", () => {
    const out = capture(() => skillsGraph({ cwd: REPO, format: "ascii", type: "deps" }));
    assert.match(out, /Skill dependencies/);
    assert.match(out, /decision-log.*->.*scope-knife/);
  });

  it("emits state writes when --type effects", () => {
    const out = capture(() => skillsGraph({ cwd: REPO, format: "ascii", type: "effects" }));
    assert.match(out, /State writes/);
    assert.match(out, /decision-log.*<-.*decision-log/);
  });
});

describe("skills graph md", () => {
  it("wraps mermaid in fenced code blocks", () => {
    const out = capture(() => skillsGraph({ cwd: REPO, format: "md", type: "all" }));
    assert.match(out, /```mermaid/);
    assert.match(out, /flowchart LR/);
    assert.match(out, /## Skill dependency graph/);
    assert.match(out, /## State-file writes/);
  });
});

describe("skills graph cycle detection", () => {
  it("returns 0 when no cycle", () => {
    let code = -1;
    const orig = console.log;
    console.log = () => {};
    try { code = skillsGraph({ cwd: REPO, format: "ascii" }); } finally { console.log = orig; }
    assert.equal(code, 0);
  });
});

