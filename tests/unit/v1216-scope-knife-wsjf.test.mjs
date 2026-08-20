// tests/unit/v1216-scope-knife-wsjf.test.mjs
// Verify the v1.2.1.6 WSJF upgrade to scripts/classify.py.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const script = readFileSync(join(ROOT, "skills/scope-knife/scripts/classify.py"), "utf8");

describe("scope-knife WSJF (v1.2.1.6)", () => {
  it("defines a wsjf_score function using cost_of_delay / job_size", () => {
    assert.match(script, /def wsjf_score\(f: dict\) -> float:/);
    assert.match(script, /cost_of_delay\s*=\s*float\(ubv\s*\+\s*tc\s*\+\s*rr\)/);
    assert.match(script, /cost_of_delay\s*\/\s*float\(job\)/);
  });

  it("computes wsjf_score for every feature before classifying", () => {
    assert.match(script, /f\["wsjf_score"\]\s*=\s*wsjf_score\(f\)/);
  });

  it("sorts both keep and defer pools by WSJF desc", () => {
    assert.match(script, /pool\.sort\(key=lambda f: \(-relevance\(f\), -f\["wsjf_score"\]\)\)/);
  });

  it("uses WSJF in pressure-forced CUT: demotes lowest-WSJF non-path KEEP", () => {
    assert.match(script, /victim = min\(candidates, key=lambda f: f\["wsjf_score"\]\)/);
  });

  it("exposes --enable-wsjf CLI flag", () => {
    assert.match(script, /add_argument\('--enable-wsjf', action='store_true'/);
  });

  it("emits WSJF avg of KEEPs as a warning when enabled", () => {
    assert.match(script, /wsjf_avg_keep\s*=/);
    assert.match(script, /WSJF avg of KEEPs/);
  });

  it("sorts final classified output by (KEEP, DEFER, CUT) then WSJF desc", () => {
    assert.match(script, /classified\.sort\(key=lambda f: \(/);
    assert.match(script, /\{"KEEP": 0, "DEFER": 1, "CUT": 2\}/);
  });

  it("scope-knife SKILL.md documents WSJF tie-breaking", () => {
    const skill = readFileSync(join(ROOT, "skills/scope-knife/SKILL.md"), "utf8");
    assert.match(skill, /WSJF tie-breaking/);
    assert.match(skill, /--enable-wsjf/);
    assert.match(skill, /wsjf_score/);
  });
});
