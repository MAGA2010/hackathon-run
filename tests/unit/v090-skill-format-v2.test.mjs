// tests/unit/v090-skill-format-v2.test.mjs
// Tests for Format v2 frontmatter fields + skills search + validate-skill Format v2 rules.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseFrontmatter } from "../../dist/harness/frontmatter.js";
import { SKILL_CATEGORIES, isSkillCategory } from "../../dist/harness/types.js";
import { search as skillsSearch } from "../../dist/cli/commands/skills-search.js";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = HERE.replace(/tests[\\/]unit.*$/, "");

describe("Skill Format v2 parser", () => {
  it("parses version, category, tags, dependencies, side_effects, triggers", () => {
    const md = [
      "---",
      "name: foo",
      "description: A test skill.",
      "version: 1.0",
      "category: scoping",
      "tags: [\"alpha\", \"beta\"]",
      "dependencies: [\"scope-knife\"]",
      "side_effects: [\"plan\"]",
      "triggers: [\"foo the baz\"]",
      "---",
      "body",
    ].join("\n");
    const r = parseFrontmatter(md);
    assert.equal(r.frontmatter.version, "1.0");
    assert.equal(r.frontmatter.category, "scoping");
    assert.deepEqual(r.frontmatter.tags, ["alpha", "beta"]);
    assert.deepEqual(r.frontmatter.dependencies, ["scope-knife"]);
    assert.deepEqual(r.frontmatter.side_effects, ["plan"]);
    assert.deepEqual(r.frontmatter.triggers, ["foo the baz"]);
  });

  it("leaves v2 fields undefined when absent", () => {
    const md = "---\nname: foo\ndescription: A test.\n---\nbody";
    const r = parseFrontmatter(md);
    assert.equal(r.frontmatter.version, undefined);
    assert.equal(r.frontmatter.category, undefined);
    assert.equal(r.frontmatter.tags, undefined);
    assert.equal(r.frontmatter.dependencies, undefined);
    assert.equal(r.frontmatter.side_effects, undefined);
    assert.equal(r.frontmatter.triggers, undefined);
  });
});

describe("SKILL_CATEGORIES", () => {
  it("exposes the 8 lifecycle categories", () => {
    assert.deepEqual([...SKILL_CATEGORIES], [
      "scoping",
      "building",
      "verifying",
      "demoing",
      "judging",
      "shipping",
      "recovering",
      "lifecycle",
    ]);
  });

  it("isSkillCategory guards against typos", () => {
    assert.equal(isSkillCategory("scoping"), true);
    assert.equal(isSkillCategory("Scoping"), false);
    assert.equal(isSkillCategory("nope"), false);
  });
});

describe("skills search", () => {
  it("returns every skill with no filters", () => {
    const captured = [];
    const orig = console.log;
    console.log = (...a) => captured.push(a.join(" "));
    try {
      skillsSearch({ cwd: REPO });
    } finally {
      console.log = orig;
    }
    const header = captured[0] || "";
    const m = header.match(/(\d+)\/(\d+) matched/);
    assert.ok(m);
    assert.equal(Number(m[1]), Number(m[2]));
    assert.ok(Number(m[2]) >= 14);
  });

  it("filters by category", () => {
    const captured = [];
    const orig = console.log;
    console.log = (...a) => captured.push(a.join(" "));
    try {
      skillsSearch({ cwd: REPO, category: "scoping" });
    } finally {
      console.log = orig;
    }
    const header = captured[0] || "";
    assert.match(header, /\d+\/\d+ matched \(filters: category=scoping\)/);
    const stripped = captured.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    const dataLines = stripped.filter((l) => /^(idea-clarify|pivot|scope-knife|stack-picker|team-roster|time-box|fast-verify|demo-coach|demo-rehearsal|judge-sim|ship-pack|recovery-runbook|decision-log|retro)\b/.test(l));
    // We expect 6 scoping skills.
    assert.equal(dataLines.length, 6);
  });

  it("filters by tag", () => {
    const captured = [];
    const orig = console.log;
    console.log = (...a) => captured.push(a.join(" "));
    try {
      skillsSearch({ cwd: REPO, tag: "mvp" });
    } finally {
      console.log = orig;
    }
    const header = captured[0] || "";
    assert.match(header, /\d+\/\d+ matched \(filters: tag=mvp\)/);
  });

  it("filters by side_effects (--writes)", () => {
    const captured = [];
    const orig = console.log;
    console.log = (...a) => captured.push(a.join(" "));
    try {
      skillsSearch({ cwd: REPO, writes: "review" });
    } finally {
      console.log = orig;
    }
    const stripped = captured.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    const dataLines = stripped.filter((l) => /judge-sim\s+1\.0/.test(l));
    assert.equal(dataLines.length, 1);
  });

  it("filters by dependencies (--depends-on)", () => {
    const captured = [];
    const orig = console.log;
    console.log = (...a) => captured.push(a.join(" "));
    try {
      skillsSearch({ cwd: REPO, dependsOn: "scope-knife" });
    } finally {
      console.log = orig;
    }
    const dataLines = captured.filter((l) => /(idea-clarify|pivot|stack-picker|team-roster|time-box|fast-verify|demo-coach|demo-rehearsal|judge-sim|ship-pack|recovery-runbook|decision-log|retro|scope-knife)\s+1\.0/.test(l));
    // After v1.0.0 dep-graph cleanup, 4 skills depend on scope-knife.
    assert.equal(dataLines.length, 4);
  });

  it("--json output is valid JSON", () => {
    const captured = [];
    const orig = console.log;
    console.log = (...a) => captured.push(a.join(" "));
    try {
      skillsSearch({ cwd: REPO, json: true, category: "demoing" });
    } finally {
      console.log = orig;
    }
    const json = JSON.parse(captured.join("\n"));
    assert.equal(json.matched, 2);
    assert.ok(json.skills.find((s) => s.name === "demo-coach"));
    assert.ok(json.skills.find((s) => s.name === "demo-rehearsal"));
    assert.equal(json.filters.category, "demoing");
  });
});


describe("validate-skill Format v2 checks", () => {
  it("flags missing version and unknown category", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "hs-v2-"));
    try {
      writeFileSync(
        join(dir, "SKILL.md"),
        [
          "---",
          "name: bad-v2",
          "description: Forces a thing.",
          "category: nosuchcategory",
          "triggers: [\"a\", \"b\"]",
          "---",
          "",
          "# bad-v2",
          "",
          "## Input contract",
          "x",
          "",
          "## Execution",
          "x",
          "",
          "## Output contract",
          "x",
          "",
          "## Acceptance criteria",
          "x",
          "",
          "## Failure modes",
          "x",
          "",
        ].join("\n"),
      );
      const { validateSkill } = await import("../../dist/cli/commands/validate-skill.js");
      const captured = [];
      const orig = console.log;
      console.log = (...a) => captured.push(a.join(" "));
      try {
        validateSkill({ target: dir, cwd: REPO });
      } finally {
        console.log = orig;
      }
      const joined = captured.join("\n");
      assert.match(joined, /missing optional Format v2 field: version/);
      assert.match(joined, /category "nosuchcategory" is not one of/);
      assert.match(joined, /2 explicit trigger phrase/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

