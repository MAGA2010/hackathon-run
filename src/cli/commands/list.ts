/**
 * list.ts — list every bundled skill with its trigger phrase budget.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { loadAllSkills } from '../../harness/loader.js';
import { TRIGGER_BUDGET } from '../../harness/frontmatter.js';
import { c, row } from '../lib/colors.js';

const WIDTHS = [18, 12, 8, 60];

function hasScripts(skillDir: string): boolean {
  const scriptsDir = join(skillDir, 'scripts');
  if (!existsSync(scriptsDir)) return false;
  try {
    return readdirSync(scriptsDir).some((n) => n.endsWith('.py'));
  } catch {
    return false;
  }
}

export function list(repoRoot: string): number {
  const skills = loadAllSkills(repoRoot);
  if (skills.length === 0) {
    console.log('no skills found under skills/ or .hackathon/skills/');
    return 0;
  }
  console.log(c.bold(row(['name', 'trigger/1536', 'scripts', 'description'], WIDTHS)));
  for (const s of skills) {
    const desc = s.frontmatter.description;
    const truncated = desc.length > 60 ? desc.slice(0, 57) + '...' : desc;
    console.log(
      row(
        [s.frontmatter.name, `${s.triggerBudget}`, hasScripts(s.dir) ? 'yes' : '', truncated],
        WIDTHS,
      ),
    );
  }
  return 0;
}
