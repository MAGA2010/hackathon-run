// tests/unit/v1217-prize-strategy.test.mjs
// New skill synthesized in v1.2.1.7.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

describe("prize-strategy skill (v1.2.1.7)", () => {
  it("ships SKILL.md and scripts/target.py", () => {
    assert.ok(existsSync(join(ROOT, "skills/prize-strategy/SKILL.md")));
    assert.ok(existsSync(join(ROOT, "skills/prize-strategy/scripts/target.py")));
  });

  it("targets prize-strategy deps on scope-knife and side_effects: prize", () => {
    const skill = readFileSync(join(ROOT, "skills/prize-strategy/SKILL.md"), "utf8");
    assert.match(skill, /dependencies:\s*\[\"scope-knife\"\]/);
    assert.match(skill, /side_effects:\s*\[\"prize\"\]/);
  });

  it("declares trigger phrases for prize intent matching", () => {
    const skill = readFileSync(join(ROOT, "skills/prize-strategy/SKILL.md"), "utf8");
    for (const phrase of ["what prize should we target", "which track should we go for", "how do we position for X prize"]) {
      assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\amp;")), "missing trigger: " + phrase);
    }
  });

  it("target.py defines VERSION = 1.0 and a fit_score function", () => {
    const py = readFileSync(join(ROOT, "skills/prize-strategy/scripts/target.py"), "utf8");
    assert.match(py, /^VERSION = "1\.0"/m);
    assert.match(py, /def fit_score\(prize, project, team_skills\):/);
  });

  it("target.py implements the weighted fit_score formula", () => {
    const py = readFileSync(join(ROOT, "skills/prize-strategy/scripts/target.py"), "utf8");
    assert.match(py, /0\.45 \* criteria_overlap/);
    assert.match(py, /0\.30 \* demo_goal_match/);
    assert.match(py, /0\.15 \* stack_match/);
    assert.match(py, /0\.10 \* team_fit/);
  });

  it("ships a prize.schema.json with required keys", () => {
    const schema = readFileSync(join(ROOT, "src/state/schemas/prize.schema.json"), "utf8");
    const obj = JSON.parse(schema);
    assert.deepEqual(obj.required, ["version", "generated_at", "target_prize", "anti_targets", "positioning"]);
    assert.ok(obj.properties.target_prize.properties.fit_score);
  });

  it("passes validate-skill with 0 errors", () => {
    // validated by the bulk linter in CI; smoke-check the script source
    const py = readFileSync(join(ROOT, "skills/prize-strategy/scripts/target.py"), "utf8");
    assert.match(py, /--prizes/);
    assert.match(py, /--project/);
    assert.match(py, /--team-skills/);
    assert.match(py, /--out-dir/);
  });
});
