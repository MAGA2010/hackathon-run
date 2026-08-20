// tests/unit/v1215-timebox-upgrade.test.mjs
// Verify the v1.2.1.5 time-box compute.py additions: burn-rate, escalation
// alarms, recovery budget, MVD check, --demo-at.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const script = readFileSync(join(ROOT, "skills/time-box/scripts/compute.py"), "utf8");

describe("time-box compute.py v1.2.1.5 upgrade", () => {
  it("accepts --elapsed for burn-rate input", () => {
    assert.match(script, /add_argument\("--elapsed"/);
  });

  it("computes burn_rate = elapsed / current_budget", () => {
    assert.match(script, /burn_rate\s*=\s*round\(args\.elapsed\s*\/\s*current_budget/);
  });

  it("emits three escalating alarms per stage at 50/80/100%", () => {
    assert.match(script, /ALARM_THRESHOLDS = \(0\.5, 0\.8, 1\.0\)/);
    assert.match(script, /escalation_alarms/);
    assert.match(script, /severity.*soft.*firm.*hard/s);
  });

  it("emits a recovery budget when the current stage is over budget", () => {
    assert.match(script, /compute_recovery/);
    assert.match(script, /cut_from_verify/);
    assert.match(script, /cut_from_demo/);
    assert.match(script, /cut_from_ship_buffer/);
  });

  it("checks minimum-viable-demo feasibility against --demo-target-minutes", () => {
    assert.match(script, /--demo-target-minutes/);
    assert.match(script, /minimum_viable_demo_feasible/);
    assert.match(script, /mvd_feasible = future_mins >= args\.demo_target_minutes/);
  });

  it("supports --demo-at HH:MM wall-clock deadline", () => {
    assert.match(script, /--demo-at/);
    assert.match(script, /parse_demo_at/);
  });

  it("mentions the new features in skills/time-box/SKILL.md", () => {
    const skill = readFileSync(join(ROOT, "skills/time-box/SKILL.md"), "utf8");
    assert.match(skill, /burn-rate/);
    assert.match(skill, /--elapsed/);
    assert.match(skill, /--demo-target-minutes/);
    assert.match(skill, /recovery budget/);
  });
});
