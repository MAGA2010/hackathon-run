/**
 * doctor.ts — self-check the environment and state-file health.
 *
 * What it checks:
 *   - node >= 20.0.0
 *   - python3 on PATH (so the skill scripts can run)
 *   - git available (for shipping / packaging)
 *   - .hackathon/state/ exists and is readable
 *   - every bundled skill parses cleanly (frontmatter + trigger budget)
 *   - every schema file is present and valid JSON
 *   - state JSON files validate against their schemas (if present)
 *
 * Usage:
 *   hackathon doctor
 *   hackathon doctor --json
 *   hackathon doctor --cwd /path/to/repo
 *
 * Exit codes:
 *   0  — no failures (warnings allowed)
 *   1  — at least one failure (env missing OR broken state file)
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import Ajv from "ajv";
import addFormats from "ajv-formats";

import { c } from "../lib/colors.js";
import { loadAllSkills } from "../../harness/loader.js";
import { TRIGGER_BUDGET } from "../../harness/frontmatter.js";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export type Severity = "ok" | "warn" | "fail";

export interface Check {
  name: string;
  severity: Severity;
  message: string;
  detail?: string;
}

export interface DoctorReport {
  cwd: string;
  nodeVersion: string;
  pythonAvailable: boolean;
  gitAvailable: boolean;
  checks: Check[];
  failCount: number;
  warnCount: number;
}

function spawnCapture(cmd: string, args: string[]): { ok: boolean; stdout: string } {
  try {
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    const r = spawnSync(cmd, args, { encoding: "utf-8", timeout: 5000 });
    if (r.status === 0) return { ok: true, stdout: r.stdout.trim() };
    return { ok: false, stdout: r.stdout.trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
}

function parseSemver(v: string): number[] {
  return v.replace(/^v/, "").split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
}

function cmpSemver(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function doctor(opts: { cwd: string; json?: boolean }): number {
  const cwd = resolve(opts.cwd);
  const checks: Check[] = [];
  const nodeVersion = process.version;
  const nodeParts = parseSemver(nodeVersion);
  if (cmpSemver(nodeParts, [20, 0, 0]) >= 0) {
    checks.push({ name: "node", severity: "ok", message: nodeVersion + " (>= 20.0.0 required)" });
  } else {
    checks.push({
      name: "node",
      severity: "fail",
      message: nodeVersion + " is older than required 20.0.0",
      detail: "Upgrade Node before running hackathon skills.",
    });
  }

  // python3 availability
  const py = spawnCapture("python3", ["--version"]);
  if (py.ok) {
    checks.push({ name: "python3", severity: "ok", message: py.stdout });
  } else {
    checks.push({
      name: "python3",
      severity: "warn",
      message: "python3 not found on PATH",
      detail: "Skill scripts require Python 3.11+. Install via your OS package manager or run scripts via uv.",
    });
  }

  // git
  const git = spawnCapture("git", ["--version"]);
  if (git.ok) {
    checks.push({ name: "git", severity: "ok", message: git.stdout });
  } else {
    checks.push({
      name: "git",
      severity: "warn",
      message: "git not found on PATH",
      detail: "Required only for ship-pack packaging. Most skills still run without git.",
    });
  }

  // state dir
  const stateDir = join(cwd, ".hackathon", "state");
  if (existsSync(stateDir)) {
    const entries = readdirSync(stateDir).filter((n) => n.endsWith(".json"));
    checks.push({
      name: "state-dir",
      severity: "ok",
      message: stateDir + " (" + entries.length + " JSON files)",
    });
  } else {
    checks.push({
      name: "state-dir",
      severity: "warn",
      message: ".hackathon/state/ missing",
      detail: "Run `hackathon init` to scaffold state files.",
    });
  }

  // schema files + state JSON validity
  const schemaDir = resolve(cwd, "src/state/schemas");
  const schemas: string[] = existsSync(schemaDir) ? readdirSync(schemaDir).filter((n) => n.endsWith(".schema.json")) : [];
  if (schemas.length === 0) {
    checks.push({
      name: "schemas",
      severity: "fail",
      message: "no schemas found at " + schemaDir,
      detail: "Internal error: bundled schemas are missing. Reinstall the package.",
    });
  } else {
    let badSchema = 0;
    for (const s of schemas) {
      try {
        JSON.parse(readFileSync(join(schemaDir, s), "utf-8"));
      } catch (e) {
        badSchema++;
        checks.push({
          name: "schema:" + s,
          severity: "fail",
          message: "schema is not valid JSON",
          detail: (e as Error).message,
        });
      }
    }
    if (badSchema === 0) {
      checks.push({ name: "schemas", severity: "ok", message: schemas.length + " schema files valid JSON" });
    }
  }
  if (existsSync(stateDir) && schemas.length > 0) {
    let badState = 0;
    for (const s of schemas) {
      const base = s.replace(/\.schema\.json$/, "");
      const target = join(stateDir, base);
      if (!existsSync(target)) continue;
      const schema = JSON.parse(readFileSync(join(schemaDir, s), "utf-8"));
      const validate = ajv.compile(schema);
      const data = JSON.parse(readFileSync(target, "utf-8"));
      if (!validate(data)) {
        badState++;
        const errs = (validate.errors ?? []).slice(0, 3).map((e) => e.instancePath + " " + e.message).join("; ");
        checks.push({
          name: "state:" + base,
          severity: "fail",
          message: "fails schema validation",
          detail: errs,
        });
      }
    }
    if (badState === 0) {
      checks.push({ name: "state-validate", severity: "ok", message: "every state file matches its schema" });
    }
  }

  // skill discovery
  let skills: ReturnType<typeof loadAllSkills> = [];
  try {
    skills = loadAllSkills(cwd);
  } catch (e) {
    skills = [];
    checks.push({
      name: "skills",
      severity: "fail",
      message: "skill loader threw",
      detail: (e as Error).message,
    });
  }
  if (skills && skills.length > 0) {
    const over = skills.filter((s) => s.triggerBudget > TRIGGER_BUDGET);
    if (over.length === 0) {
      checks.push({
        name: "skills",
        severity: "ok",
        message: skills.length + " skills loaded, all within trigger budget " + TRIGGER_BUDGET,
      });
    } else {
      for (const s of over) {
        checks.push({
          name: "skill:" + s.frontmatter.name,
          severity: "fail",
          message: "trigger budget exceeded: " + s.triggerBudget + " / " + TRIGGER_BUDGET,
        });
      }
    }
  } else if (!checks.find((c) => c.name === "skills")) {
    checks.push({
      name: "skills",
      severity: "warn",
      message: "no skills found under skills/",
      detail: "Run from the hackathon-surgeon package root or inside a project that has skills/.",
    });
  }

  const failCount = checks.filter((c) => c.severity === "fail").length;
  const warnCount = checks.filter((c) => c.severity === "warn").length;
  const report: DoctorReport = {
    cwd,
    nodeVersion,
    pythonAvailable: py.ok,
    gitAvailable: git.ok,
    checks,
    failCount,
    warnCount,
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(c.bold("\u{1F489} hackathon doctor \u2014 " + cwd));
    console.log();
    const ICONS: Record<Severity, string> = { ok: "\u2713", warn: "!", fail: "\u2717" };
    const COLOR: Record<Severity, (s: string) => string> = {
      ok: c.green,
      warn: c.yellow,
      fail: c.red,
    };
    for (const ch of checks) {
      const tag = COLOR[ch.severity](ICONS[ch.severity]);
      console.log("  " + tag + " " + ch.name.padEnd(20) + " " + ch.message);
      if (ch.detail) console.log(c.dim("    " + ch.detail));
    }
    console.log();
    console.log(c.bold("Summary: ") + c.green(failCount + " ok / ") + c.yellow(warnCount + " warn / ") + c.red(failCount + " fail"));
    if (failCount > 0) {
      console.log();
      console.log(c.red("[ERR] " + failCount + " check(s) failed. The CLI may misbehave until they are fixed."));
    } else if (warnCount > 0) {
      console.log();
      console.log(c.yellow("[!] " + warnCount + " warning(s). Skills will degrade gracefully but some features may be unavailable."));
    } else {
      console.log();
      console.log(c.green("\u2728 Everything looks healthy."));
    }
  }
  return failCount > 0 ? 1 : 0;
}
