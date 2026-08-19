/**
 * diff.ts — compare two .hackathon/state/*.json files (or whole state dirs).
 *
 * Useful for:
 *   - post-mortems: "what did plan.json look like at hour 0 vs hour 36?"
 *   - pivots: "what changed between this team's plan and the previous one?"
 *   - regression checks: "did we accidentally drop a KEEP feature?"
 *
 * Usage:
 *   hackathon diff <file-a> <file-b>      # compare two specific files
 *   hackathon diff <dir-a> <dir-b>        # compare every common file
 *   hackathon diff --stat <a> <b>         # only show the summary counts
 *
 * Output:
 *   - For top-level fields: added / removed / changed (with old/new values)
 *   - For arrays of objects with stable id/name: per-item added/removed/changed
 *   - For primitives: just `field: old -> new`
 *
 * Returns:
 *   0 if there are no differences
 *   1 if there are differences
 *   2 on IO error
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { readdirSync } from 'node:fs';

import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface Diff {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  before?: Json;
  after?: Json;
}

function readJson(p: string): Json | undefined {
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as Json;
  } catch {
    return undefined;
  }
}

function stableKey(item: Json): string | undefined {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const o = item as Record<string, Json>;
    for (const k of ['id', 'name', 'step', 'key']) {
      const v = o[k];
      if (typeof v === 'string' || typeof v === 'number') return String(v);
    }
  }
  return undefined;
}

function diffObjects(before: Json, after: Json, prefix: string): Diff[] {
  const out: Diff[] = [];
  if (before === after) return out;
  if (typeof before !== typeof after || (before === null) !== (after === null)) {
    out.push({ path: prefix, kind: 'changed', before, after });
    return out;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    out.push(...diffArrays(before, after, prefix));
    return out;
  }
  if (typeof before === 'object' && typeof after === 'object' && before && after) {
    const b = before as Record<string, Json>;
    const a = after as Record<string, Json>;
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const k of Array.from(keys).sort()) {
      if (!(k in b)) {
        out.push({ path: `${prefix}.${k}`, kind: 'added', after: a[k] });
      } else if (!(k in a)) {
        out.push({ path: `${prefix}.${k}`, kind: 'removed', before: b[k] });
      } else if (b[k] === a[k]) {
        // no-op
      } else if (typeof b[k] === 'object' && typeof a[k] === 'object') {
        out.push(...diffObjects(b[k] as Json, a[k] as Json, `${prefix}.${k}`));
      } else {
        out.push({ path: `${prefix}.${k}`, kind: 'changed', before: b[k], after: a[k] });
      }
    }
    return out;
  }
  out.push({ path: prefix, kind: 'changed', before, after });
  return out;
}

function diffArrays(before: Json[], after: Json[], prefix: string): Diff[] {
  const out: Diff[] = [];
  // Map items by stable key when possible; fall back to index.
  const keyable = before.every(stableKey) && after.every(stableKey);
  if (keyable) {
    const bMap = new Map<string, { idx: number; v: Json }>();
    before.forEach((v, i) => {
      const k = stableKey(v)!;
      bMap.set(k, { idx: i, v });
    });
    const aMap = new Map<string, { idx: number; v: Json }>();
    after.forEach((v, i) => {
      const k = stableKey(v)!;
      aMap.set(k, { idx: i, v });
    });
    const allKeys = new Set([...bMap.keys(), ...aMap.keys()]);
    for (const k of Array.from(allKeys).sort()) {
      const path = `${prefix}[${k}]`;
      if (!bMap.has(k)) {
        out.push({ path, kind: 'added', after: aMap.get(k)!.v });
      } else if (!aMap.has(k)) {
        out.push({ path, kind: 'removed', before: bMap.get(k)!.v });
      } else {
        out.push(...diffObjects(bMap.get(k)!.v, aMap.get(k)!.v, path));
      }
    }
    return out;
  }
  // Index-based fallback.
  const maxLen = Math.max(before.length, after.length);
  for (let i = 0; i < maxLen; i++) {
    const path = `${prefix}[${i}]`;
    if (i >= before.length) {
      out.push({ path, kind: 'added', after: after[i] });
    } else if (i >= after.length) {
      out.push({ path, kind: 'removed', before: before[i] });
    } else if (before[i] === after[i]) {
      // no-op
    } else if (typeof before[i] === 'object' && typeof after[i] === 'object') {
      out.push(...diffObjects(before[i] as Json, after[i] as Json, path));
    } else {
      out.push({ path, kind: 'changed', before: before[i], after: after[i] });
    }
  }
  return out;
}

function diffPair(before: Json, after: Json, fileLabel: string): Diff[] {
  // fileLabel here is the per-file label (e.g. "plan.json" or "plan.json vs plan.json");
  // strip the " vs <x>" suffix so per-field paths read as "plan.json.foo" not "plan.json vs plan.json.foo".
  const cleanLabel = fileLabel.replace(/\s+vs\s+.+$/, '');
  return diffObjects(before, after, cleanLabel);
}

function isStateFile(name: string): boolean {
  return /^(plan|verify|demo|review|ship|recovery)\.json$/.test(name);
}

export interface DiffOptions {
  /** path A — either a single .json file or a state directory */
  a: string;
  /** path B */
  b: string;
  /** only emit counts, not per-field diffs */
  stat?: boolean;
  /** machine-readable output */
  json?: boolean;
}

export function diff(opts: DiffOptions): number {
  const aPath = resolve(opts.a);
  const bPath = resolve(opts.b);

  let pairs: Array<{ label: string; before: Json | undefined; after: Json | undefined }> = [];

  const aStat = existsSync(aPath);
  const bStat = existsSync(bPath);
  if (!aStat || !bStat) {
    log.err(`missing input: ${!aStat ? aPath : bPath}`);
    return 2;
  }

  if (aPath.endsWith('.json') && bPath.endsWith('.json')) {
    pairs.push({
      label: basename(aPath) + ' vs ' + basename(bPath),
      before: readJson(aPath),
      after: readJson(bPath),
    });
  } else {
    // Treat as directories.
    const aFiles = new Set(readdirSync(aPath).filter(isStateFile));
    const bFiles = new Set(readdirSync(bPath).filter(isStateFile));
    const all = new Set([...aFiles, ...bFiles]);
    for (const f of Array.from(all).sort()) {
      pairs.push({
        label: f,
        before: readJson(join(aPath, f)),
        after: readJson(join(bPath, f)),
      });
    }
  }

  let totalDiffs = 0;
  const report: Array<{
    file: string;
    diffs: Diff[];
    counts: { added: number; removed: number; changed: number };
  }> = [];

  for (const { label, before, after } of pairs) {
    let diffs: Diff[] = [];
    if (before === undefined && after === undefined) continue;
    if (before === undefined) {
      diffs = [{ path: '<root>', kind: 'added', after }];
    } else if (after === undefined) {
      diffs = [{ path: '<root>', kind: 'removed', before }];
    } else {
      diffs = diffPair(before, after, label);
    }
    const counts = {
      added: diffs.filter((d) => d.kind === 'added').length,
      removed: diffs.filter((d) => d.kind === 'removed').length,
      changed: diffs.filter((d) => d.kind === 'changed').length,
    };
    totalDiffs += counts.added + counts.removed + counts.changed;
    report.push({ file: label, diffs, counts });
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        { totalDiffs, files: report.map(({ file, counts }) => ({ file, counts })), diffs: report },
        null,
        2,
      ),
    );
    return totalDiffs > 0 ? 1 : 0;
  }

  if (totalDiffs === 0) {
    console.log(c.green('no differences'));
    return 0;
  }

  console.log(c.bold('hackathon diff -- ' + aPath + ' vs ' + bPath));
  console.log();
  for (const { file, diffs, counts } of report) {
    if (diffs.length === 0) {
      console.log(c.gray(`  ${file}: no change`));
      continue;
    }
    console.log(
      c.bold(file) +
        '  ' +
        c.green(`+${counts.added}`) +
        ' ' +
        c.red(`-${counts.removed}`) +
        ' ' +
        c.yellow(`~${counts.changed}`),
    );
    if (opts.stat) continue;
    for (const d of diffs) {
      const tag =
        d.kind === 'added' ? c.green('+ ') : d.kind === 'removed' ? c.red('- ') : c.yellow('~ ');
      const tail = d.kind === 'changed' ? `  ${stringify(d.before)} -> ${stringify(d.after)}` : '';
      console.log(`    ${tag}${d.path}${tail}`);
    }
  }
  console.log();
  console.log(
    c.bold(
      `${totalDiffs} differences across ${report.filter((r) => r.diffs.length > 0).length} file(s)`,
    ),
  );
  return 1;
}

function stringify(v: Json | undefined): string {
  if (v === undefined) return '(none)';
  const s = JSON.stringify(v);
  if (s.length > 80) return s.slice(0, 77) + '...';
  return s;
}
