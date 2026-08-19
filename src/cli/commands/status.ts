/**
 * status.ts — read all 5 state files and print where the team is in the lifecycle.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { c } from "../lib/colors.js";
import { log } from "../lib/logger.js";

const STATE_FILES = ["plan.json", "verify.json", "demo.json", "review.json", "ship.json"] as const;
type FileName = (typeof STATE_FILES)[number];

export interface StatusSummary {
  initialized: boolean;
  stateDir: string;
  files: Partial<Record<FileName, FileSummary>>;
  lifecycle: LifecycleStage;
  nextSuggestion: string | null;
  warnings: string[];
}

interface FileSummary {
  present: boolean;
  size: number;
  age: string | null;
  generatedAt: string | null;
  highlights: string[];
}

type LifecycleStage = "empty" | "scoping" | "verifying" | "demoing" | "judging" | "shipping" | "complete";
const STAGE_ORDER: LifecycleStage[] = ["empty", "scoping", "verifying", "demoing", "judging", "shipping", "complete"];
const NEXT_SUGGESTION: Record<LifecycleStage, string | null> = {
  empty: "hackathon init then hackathon run scope-knife",
  scoping: "hackathon run fast-verify on the demo_path steps",
  verifying: "hackathon run demo-coach --duration 60",
  demoing: "hackathon run judge-sim",
  judging: "address the fix_now list from judge-sim, then hackathon run ship-pack",
  shipping: "tar -xzf with packaging_command from ship.json",
  complete: "ship it -- nothing left to cut",
};

function ageString(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "future";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h " + (minutes % 60) + "m ago";
  const days = Math.floor(hours / 24);
  return days + "d " + (hours % 24) + "h ago";
}

function summarize(file: FileName, raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const d = raw as Record<string, unknown>;
  if (file === "plan.json") {
    const features = Array.isArray(d.features) ? (d.features as Array<Record<string, unknown>>) : [];
    const keep = features.filter((f) => f.classification === "KEEP").length;
    const cut = features.filter((f) => f.classification === "CUT").length;
    const defer = features.filter((f) => f.classification === "DEFER").length;
    const dp = Array.isArray(d.demo_path) ? (d.demo_path as unknown[]).length : 0;
    const nt = Array.isArray(d.next_tasks) ? (d.next_tasks as unknown[]).length : 0;
    const goal = typeof d.demo_goal === "string" ? d.demo_goal : "";
    const out: string[] = [];
    if (goal) out.push("goal: " + goal);
    out.push("features: " + keep + " KEEP / " + cut + " CUT / " + defer + " DEFER");
    out.push("demo_path: " + dp + " steps, next_tasks: " + nt);
    return out;
  }
  if (file === "verify.json") {
    const steps = Array.isArray(d.steps) ? (d.steps as Array<Record<string, unknown>>) : [];
    const pass = steps.filter((s) => s.status === "pass").length;
    const fail = steps.filter((s) => s.status === "fail").length;
    const status = typeof d.status === "string" ? d.status : "unknown";
    return ["status: " + status, "steps: " + pass + " pass / " + fail + " fail (of " + steps.length + ")"];
  }
  if (file === "demo.json") {
    const dur = typeof d.duration_seconds === "number" ? d.duration_seconds : 0;
    const steps = Array.isArray(d.steps) ? (d.steps as unknown[]).length : 0;
    const one = typeof d.one_liner === "string" ? d.one_liner : "";
    const out = ["duration: " + dur + "s, steps: " + steps];
    if (one) out.push("one_liner: " + one);
    return out;
  }
  if (file === "review.json") {
    const dims = Array.isArray(d.dimensions) ? (d.dimensions as Array<Record<string, unknown>>) : [];
    const overall = typeof d.overall === "number" ? d.overall : 0;
    const fp = d.fix_priorities && typeof d.fix_priorities === "object" ? (d.fix_priorities as Record<string, unknown>) : null;
    const fixNow = fp && Array.isArray(fp.fix_now) ? (fp.fix_now as unknown[]).length : 0;
    return ["overall: " + overall + " / 5 across " + dims.length + " dimensions", "fix_now items: " + fixNow];
  }
  if (file === "ship.json") {
    const ss = d.secret_scan && typeof d.secret_scan === "object" ? (d.secret_scan as Record<string, unknown>) : null;
    const clean = ss ? ss.clean : null;
    const findings = ss && Array.isArray(ss.findings) ? (ss.findings as unknown[]).length : 0;
    const cl = d.checklist && typeof d.checklist === "object" ? (d.checklist as Record<string, unknown>) : null;
    const passed = cl && Array.isArray(cl.passed) ? (cl.passed as unknown[]).length : 0;
    const failed = cl && Array.isArray(cl.failed) ? (cl.failed as unknown[]).length : 0;
    const out: string[] = [];
    out.push("secret_scan: " + (clean === true ? "clean" : clean === false ? "DIRTY (" + findings + " findings)" : "n/a"));
    out.push("checklist: " + passed + " passed / " + failed + " failed");
    return out;
  }
  return [];
}

function stageFor(files: Partial<Record<FileName, FileSummary>>): LifecycleStage {
  if (!files["plan.json"]?.present) return "empty";
  if (!files["verify.json"]?.present) return "scoping";
  if (!files["demo.json"]?.present) return "verifying";
  if (!files["review.json"]?.present) return "demoing";
  if (!files["ship.json"]?.present) return "judging";
  return "shipping";
}

function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function status(opts: { cwd: string; json?: boolean }): number {
  const cwd = resolve(opts.cwd);
  const stateDir = join(cwd, ".hackathon", "state");
  const initialized = existsSync(stateDir);
  if (!initialized) {
    if (opts.json) {
      console.log(JSON.stringify({ initialized: false, stateDir, lifecycle: "empty", nextSuggestion: NEXT_SUGGESTION.empty, files: {}, warnings: [".hackathon/state/ not found"] }, null, 2));
    } else {
      log.warn(".hackathon/state/ not found in " + cwd);
      log.dim("Run: hackathon init");
    }
    return 1;
  }
  const warnings: string[] = [];
  const files: Partial<Record<FileName, FileSummary>> = {};
  for (const f of STATE_FILES) {
    const full = join(stateDir, f);
    if (!existsSync(full)) {
      files[f] = { present: false, size: 0, age: null, generatedAt: null, highlights: [] };
      continue;
    }
    let stat;
    try { stat = statSync(full); } catch { continue; }
    const data = readJson(full);
    let generatedAt: string | null = null;
    if (data && typeof data === "object") {
      const ts = (data as Record<string, unknown>).generated_at;
      if (typeof ts === "string") generatedAt = ts;
      if (!generatedAt && typeof (data as Record<string, unknown>).started_at === "string") {
        generatedAt = (data as Record<string, unknown>).started_at as string;
      }
    }
    if (!generatedAt) warnings.push(f + ": missing generated_at / started_at timestamp");
    files[f] = { present: true, size: stat.size, age: ageString(generatedAt), generatedAt, highlights: summarize(f, data) };
  }
  const lifecycle = stageFor(files);
  const nextSuggestion = NEXT_SUGGESTION[lifecycle];
  const summary: StatusSummary = { initialized, stateDir, files, lifecycle, nextSuggestion, warnings };
  if (opts.json) { console.log(JSON.stringify(summary, null, 2)); return 0; }
  console.log(c.bold("\u2708\ufe0f  hackathon status \u2014 " + cwd));
  console.log(c.dim("state dir: " + stateDir));
  console.log();
  console.log(c.bold("Lifecycle: ") + c.cyan(lifecycle) + "  (stage " + (STAGE_ORDER.indexOf(lifecycle) + 1) + " / " + STAGE_ORDER.length + ")");
  if (nextSuggestion) console.log(c.bold("Next:     ") + nextSuggestion);
  console.log();
  for (const f of STATE_FILES) {
    const info = files[f];
    if (!info) continue;
    if (!info.present) {
      console.log("  " + c.gray(f.padEnd(14)) + " " + c.gray("(missing)"));
      continue;
    }
    const age = info.age ? c.dim(info.age) : c.gray("no timestamp");
    console.log("  " + c.green(f.padEnd(14)) + " " + age);
    for (const line of info.highlights) console.log("    " + c.dim("\u2022 " + line));
  }
  if (warnings.length) {
    console.log();
    console.log(c.yellow("Warnings:"));
    for (const w of warnings) console.log("  " + c.yellow("\u26a0 ") + w);
  }
  console.log();
  const orphans = readdirSync(stateDir).filter((n) => !STATE_FILES.includes(n as FileName));
  if (orphans.length) console.log(c.dim("Other files in state/: " + orphans.join(", ")));
  return 0;
}
