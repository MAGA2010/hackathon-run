/**
 * list.ts — list every bundled skill with its trigger phrase budget.
 */

import { loadAllSkills } from "../../harness/loader.js";
import { TRIGGER_BUDGET } from "../../harness/frontmatter.js";
import { c, row } from "../lib/colors.js";

const WIDTHS = [18, 12, 8, 60];

export function list(repoRoot: string): number {
  const skills = loadAllSkills(repoRoot);
  if (skills.length === 0) {
    console.log("no skills found under skills/");
    return 0;
  }
  console.log(c.bold(row(["name", "trigger/1536", "scripts", "description"], WIDTHS)));
  for (const s of skills) {
    const desc = s.frontmatter.description;
    const truncated = desc.length > 60 ? desc.slice(0, 57) + "..." : desc;
    console.log(row(
      [s.frontmatter.name, `${s.triggerBudget}`, "yes", truncated],
      WIDTHS,
    ));
  }
  return 0;
}
