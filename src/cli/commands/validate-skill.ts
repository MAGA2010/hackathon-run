/**
 * validate-skill.ts - lint a single SKILL.md against the Hackathon Surgeon
 * skill protocol.
 *
 * Checks:
 *   1. frontmatter parses (name, description, optional when_to_use)
 *   2. folder name == frontmatter name
 *   3. description + when_to_use under TRIGGER_BUDGET (1536 chars)
 *   4. description leads with an action verb (Force, Run, Generate, ...)
 *   5. body has at least the required sections (Input contract, Execution,
 *      Output contract, Acceptance criteria, Failure modes)
 *   6. if any scripts/*.py exist, the most-likely main one (matching folder
 *      name OR the only one in scripts/) has #!/usr/bin/env python3, declares
 *      a --repo-root flag, and pins VERSION = "1.0"
 *   7. if a state file is referenced, the matching schema exists in
 *      src/state/schemas/<file>.schema.json
 *
 * Returns:
 *   0 if the skill passes (warnings allowed)
 *   1 if any ERROR-level finding
 *   2 on usage / IO error
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import {
  parseFrontmatter,
  TRIGGER_BUDGET,
  enforceTriggerBudget,
} from '../../harness/frontmatter.js';
import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

type Finding = { severity: 'error' | 'warn' | 'info'; message: string };

const REQUIRED_SECTIONS = [
  '## Input contract',
  '## Execution',
  '## Output contract',
  '## Acceptance criteria',
  '## Failure modes',
];

const ACTION_VERB_LEAD =
  /^(force|run|generate|emit|produce|detect|simulate|classify|score|audit|scan|ship|recover|list|review|cut|verify|demo|coach|build|write|recommend|suggest|draft|prioritize|prioritise|trim|narrow|expand|identify|find|spot|trace|pick|choose|select|surface|reshape|rebuild|pivot|clarif|prioritis|verif|verifi|allocate|retro|retrospect|bootstrap|assign|rehearse)(?:s|es|ies|ied|ing|ed)?\b/i;

function checkSkill(skillDir: string, cwd: string): Finding[] {
  const out: Finding[] = [];
  const skillMd = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMd)) {
    out.push({ severity: 'error', message: `missing SKILL.md at ${skillMd}` });
    return out;
  }
  const raw = readFileSync(skillMd, 'utf-8');

  let parsed: ReturnType<typeof parseFrontmatter>;
  try {
    parsed = parseFrontmatter(raw);
  } catch (e) {
    out.push({ severity: 'error', message: `frontmatter parse failed: ${(e as Error).message}` });
    return out;
  }

  enforceTriggerBudget(parsed);
  const pct = Math.round((parsed.triggerBudget / TRIGGER_BUDGET) * 100);
  if (pct >= 80) {
    out.push({
      severity: 'warn',
      message: `trigger budget at ${pct}% of ${TRIGGER_BUDGET} (${parsed.triggerBudget} chars)`,
    });
  } else {
    out.push({ severity: 'info', message: `trigger budget at ${pct}% of ${TRIGGER_BUDGET}` });
  }

  const folder = basename(skillDir);
  if (folder !== parsed.frontmatter.name) {
    out.push({
      severity: 'error',
      message: `folder name "${folder}" does not match frontmatter name "${parsed.frontmatter.name}"`,
    });
  }

  const firstWord = parsed.frontmatter.description.trim().split(/\s+/)[0] ?? '';
  if (firstWord && !ACTION_VERB_LEAD.test(firstWord)) {
    out.push({
      severity: 'warn',
      message: `description does not lead with an action verb (got "${firstWord}")`,
    });
  }

  const wtu = parsed.frontmatter.when_to_use ?? '';
  if (wtu.length === 0) {
    out.push({
      severity: 'warn',
      message: 'when_to_use is empty; agent will rely on description alone for triggering',
    });
  } else if (!/do not invoke|do not use|avoid/i.test(wtu.replace(/\s+/g, ' '))) {
    out.push({
      severity: 'warn',
      message: 'when_to_use has no "Do not invoke when ..." clause',
    });
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!parsed.body.includes(section)) {
      out.push({ severity: 'error', message: `missing required body section: ${section}` });
    }
  }

  if (!/## Trigger phrases/i.test(parsed.body)) {
    out.push({
      severity: 'warn',
      message:
        'body has no "## Trigger phrases" section; matcher will fall back to description + when_to_use',
    });
  }

  const scriptsDir = join(skillDir, 'scripts');
  const scriptsPresent = existsSync(scriptsDir)
    ? readdirSync(scriptsDir).filter((n) => n.endsWith('.py'))
    : [];
  if (scriptsPresent.length === 0) {
    out.push({
      severity: 'info',
      message: `no scripts/*.py; skill is guidance-only (that's fine)`,
    });
  } else {
    // Pick the most likely "main" script: folder-named first, else the only file, else the first.
    const candidate =
      scriptsPresent.find((n) => n === `${folder}.py`) ??
      (scriptsPresent.length === 1 ? scriptsPresent[0] : scriptsPresent[0]);
    const mainScript = join(scriptsDir, candidate!);
    const s = readFileSync(mainScript, 'utf-8');
    if (!s.startsWith('#!/usr/bin/env python3')) {
      out.push({
        severity: 'error',
        message: `${mainScript} is missing the #!/usr/bin/env python3 shebang`,
      });
    }
    if (!/--repo-root|--plan|--demo|--symptom|--repo|--utterance/i.test(s)) {
      out.push({
        severity: 'warn',
        message: `${mainScript} does not declare a --repo-root (or related) argument`,
      });
    }
    if (!/^VERSION\s*=\s*["'']1\.0["'']/m.test(s)) {
      out.push({
        severity: 'warn',
        message: `${mainScript} does not pin VERSION = "1.0" at the top`,
      });
    }
  }

  const stateRefs = Array.from(parsed.body.matchAll(/state\/([a-z_-]+)\.json/g)).map((m) => m[1]);
  const schemaDir = resolve(cwd, 'src', 'state', 'schemas');
  for (const ref of stateRefs) {
    const schemaPath = join(schemaDir, `${ref}.schema.json`);
    if (!existsSync(schemaPath)) {
      out.push({
        severity: 'error',
        message: `references state/${ref}.json but no schema at ${schemaPath}`,
      });
    }
  }

  return out;
}

export interface ValidateSkillOptions {
  target: string;
  json?: boolean;
  cwd?: string;
}

export function validateSkill(opts: ValidateSkillOptions): number {
  const cwd = opts.cwd ?? process.cwd();
  const skillDir = resolve(opts.target);
  let stat;
  try {
    stat = statSync(skillDir);
  } catch (e) {
    log.err(`cannot read ${skillDir}: ${(e as Error).message}`);
    return 2;
  }
  if (!stat.isDirectory()) {
    log.err(`not a directory: ${skillDir}`);
    return 2;
  }
  const findings = checkSkill(skillDir, cwd);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warn').length;
  if (opts.json) {
    console.log(JSON.stringify({ target: skillDir, errors, warnings, findings }, null, 2));
    return errors > 0 ? 1 : 0;
  }
  console.log(c.bold('hackathon validate-skill -- ' + skillDir));
  console.log();
  for (const f of findings) {
    const tag =
      f.severity === 'error'
        ? c.red('ERROR')
        : f.severity === 'warn'
          ? c.yellow('WARN ')
          : c.gray('info ');
    console.log(`  [${tag}] ${f.message}`);
  }
  console.log();
  console.log(
    `  ${c.red(errors + ' errors')}, ${c.yellow(warnings + ' warnings')}, ${findings.length} findings total`,
  );
  return errors > 0 ? 1 : 0;
}
