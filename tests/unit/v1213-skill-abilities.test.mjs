// tests/unit/v1213-skill-abilities.test.mjs
// Regression coverage for the v1.2.1.3 P0 ability fixes:
//   - stack-picker / time-box / demo-rehearsal now ship real Python helpers
//   - coach.py / diagnose.py / score.py pin VERSION = 1.0
// Portable: no Python dependency, just reads scripts and checks shape.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

describe("P0 skill ability fixes (v1.2.1.3)", () => {
  it("stack-picker ships a real scripts/pick.py with VERSION pin", () => {
    const script = "skills/stack-picker/scripts/pick.py";
    assert.ok(existsSync(join(ROOT, script)), script + " missing");
    const body = read(script);
    assert.match(body, /^VERSION = "1\.0"/m, "pick.py must pin VERSION = 1.0");
    assert.match(body, /^#!\/usr\/bin\/env python3/, "shebang required");
    assert.match(body, /--team-skills/);
    assert.match(body, /--demo-format/);
    assert.match(body, /recommendation/);
    assert.match(body, /bootstrap/);
  });

  it("time-box ships a real scripts/compute.py with VERSION pin", () => {
    const script = "skills/time-box/scripts/compute.py";
    assert.ok(existsSync(join(ROOT, script)), script + " missing");
    const body = read(script);
    assert.match(body, /^VERSION = "1\.0"/m);
    assert.match(body, /--time-remaining/);
    assert.match(body, /--team-size/);
    assert.match(body, /--current-stage/);
    assert.match(body, /schedule/);
  });

  it("demo-rehearsal ships a real scripts/rehearse.py with VERSION pin", () => {
    const script = "skills/demo-rehearsal/scripts/rehearse.py";
    assert.ok(existsSync(join(ROOT, script)), script + " missing");
    const body = read(script);
    assert.match(body, /^VERSION = "1\.0"/m);
    assert.match(body, /--dry-run/);
    assert.match(body, /rehearsal\.json/);
    assert.match(body, /classification/);
  });

  it("the 3 originally-missing scripts now pin VERSION = 1.0 outside docstring", () => {
    for (const script of [
      "skills/demo-coach/scripts/coach.py",
      "skills/fast-verify/scripts/diagnose.py",
      "skills/judge-sim/scripts/score.py",
    ]) {
      const body = read(script);
      const stripped = body.replace(/^\s*"""[\s\S]*?"""\s*/m, "");
      assert.match(stripped, /^VERSION = "1\.0"/m, script + " must pin VERSION = 1.0 outside docstring");
    }
  });

  it("stack-picker SKILL.md references its helper", () => {
    assert.match(read("skills/stack-picker/SKILL.md"), /scripts[\\/]pick\.py/);
  });
  it("time-box SKILL.md references its helper", () => {
    assert.match(read("skills/time-box/SKILL.md"), /scripts[\\/]compute\.py/);
  });
  it("demo-rehearsal SKILL.md references its helper", () => {
    assert.match(read("skills/demo-rehearsal/SKILL.md"), /scripts[\\/]rehearse\.py/);
  });
});
