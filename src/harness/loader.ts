/**
 * loader.ts — discover and load every SKILL.md under a directory.
 *
 * Used by:
 *   - the CLI (`hackathon list`, `hackathon run <skill>`)
 *   - CI (trigger-budget + frontmatter validation)
 *   - external agents that want to load skills on demand
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { enforceTriggerBudget, parseFrontmatter } from "./frontmatter.js";
import type { SkillManifest } from "./types.js";

export function findSkillDirs(root: string): string[] {
  const out: string[] = [];
  const skillsRoot = resolve(root, "skills");
  let entries: string[];
  try {
    entries = readdirSync(skillsRoot);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(skillsRoot, name);
    try {
      if (!statSync(full).isDirectory()) continue;
      if (!existsSync(join(full, "SKILL.md"))) continue;
      out.push(full);
    } catch {
      // ignore unreadable dirs
    }
  }
  return out.sort();
}

export function loadSkill(skillDir: string): SkillManifest {
  const file = join(skillDir, "SKILL.md");
  const raw = readFileSync(file, "utf-8");
  const parsed = parseFrontmatter(raw);
  enforceTriggerBudget(parsed);

  // Sanity: folder name must match frontmatter name.
  const folder = skillDir.split(/[/\\]/).pop() ?? "";
  if (folder && folder !== parsed.frontmatter.name) {
    throw new Error(
      `skill folder "${folder}" does not match frontmatter name "${parsed.frontmatter.name}"`,
    );
  }

  return {
    path: file,
    dir: skillDir,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    triggerBudget: parsed.triggerBudget,
  };
}

export function loadAllSkills(root: string): SkillManifest[] {
  return findSkillDirs(root).map(loadSkill);
}

