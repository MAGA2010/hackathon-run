/**
 * skills-search.ts - Format v2 skill discovery.
 *
 * Filter the skill catalog by Format v2 metadata:
 *   --tag <name>           match skills with this tag
 *   --category <name>      match skills in this lifecycle category
 *   --writes <state>       match skills that write .hackathon/state/<state>.json
 *   --depends-on <name>    match skills that pair with / chain to <name>
 *
 * Multiple filters are AND-combined. With no filters the command lists every
 * skill along with its Format v2 metadata so the operator can see what is
 * available.
 */

import { loadAllSkills } from '../../harness/loader.js';
import { c, row } from '../lib/colors.js';

const WIDTHS = [18, 12, 18, 36];

export interface SkillsSearchOptions {
  tag?: string;
  category?: string;
  writes?: string;
  dependsOn?: string;
  json?: boolean;
  cwd?: string;
}

export function search(opts: SkillsSearchOptions): number {
  const cwd = opts.cwd ?? process.cwd();
  const skills = loadAllSkills(cwd);
  const matches = skills.filter((s) => {
    const fm = s.frontmatter;
    if (opts.tag && !(fm.tags ?? []).includes(opts.tag)) return false;
    if (opts.category && fm.category !== opts.category) return false;
    if (opts.writes && !(fm.side_effects ?? []).includes(opts.writes)) return false;
    if (opts.dependsOn && !(fm.dependencies ?? []).includes(opts.dependsOn)) return false;
    return true;
  });

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          total: skills.length,
          matched: matches.length,
          filters: {
            tag: opts.tag,
            category: opts.category,
            writes: opts.writes,
            depends_on: opts.dependsOn,
          },
          skills: matches.map((s) => ({
            name: s.frontmatter.name,
            version: s.frontmatter.version ?? null,
            category: s.frontmatter.category ?? null,
            tags: s.frontmatter.tags ?? [],
            dependencies: s.frontmatter.dependencies ?? [],
            side_effects: s.frontmatter.side_effects ?? [],
            trigger_phrases: s.frontmatter.triggers ?? [],
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const filters = [
    opts.tag ? `tag=${opts.tag}` : null,
    opts.category ? `category=${opts.category}` : null,
    opts.writes ? `writes=${opts.writes}` : null,
    opts.dependsOn ? `depends_on=${opts.dependsOn}` : null,
  ].filter(Boolean);
  console.log(
    c.bold(
      `hackathon skills search \u2014 ${matches.length}/${skills.length} matched` +
        (filters.length ? ` (filters: ${filters.join(', ')})` : ''),
    ),
  );
  console.log();
  console.log(c.bold(row(['name', 'version', 'category', 'tags'], WIDTHS)));
  for (const s of matches) {
    const fm = s.frontmatter;
    console.log(
      row(
        [
          fm.name,
          fm.version ?? '\u2014',
          fm.category ?? '\u2014',
          (fm.tags ?? []).slice(0, 4).join(', '),
        ],
        WIDTHS,
      ),
    );
  }
  return 0;
}
