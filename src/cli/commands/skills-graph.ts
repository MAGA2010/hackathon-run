/**
 * skills-graph.ts - emit a Mermaid / DOT / ASCII graph of the skill catalog.
 *
 * Renders the Format v2 dependency + side-effect relationships as a
 * directed graph. Useful for:
 *   - docs pages (the docs/skills/index.md state-machine diagram is now
 *     derived from this output)
 *   - onboarding new agents (a one-glance view of how skills pair)
 *   - sanity checks (cycles in dependencies, orphan side-effects)
 *
 * Subcommands:
 *   hackathon skills graph                            # mermaid, both
 *   hackathon skills graph --format dot --type effects
 *   hackathon skills graph --format ascii
 */

import { loadAllSkills } from '../../harness/loader.js';
import { SKILL_CATEGORIES } from '../../harness/types.js';

export interface SkillsGraphOptions {
  format?: 'mermaid' | 'dot' | 'ascii' | 'md';
  type?: 'all' | 'deps' | 'effects';
  cwd?: string;
}

export function graph(opts: SkillsGraphOptions): number {
  const cwd = opts.cwd ?? process.cwd();
  const skills = loadAllSkills(cwd);
  const format = opts.format ?? 'mermaid';
  const type = opts.type ?? 'all';

  // Detect cycles in dependencies (sanity check).
  const known = new Set(skills.map((s) => s.frontmatter.name));
  const cycle = detectCycle(
    skills.map((s) => s.frontmatter.name),
    (n) => {
      const sk = skills.find((s) => s.frontmatter.name === n);
      return (sk?.frontmatter.dependencies ?? []).filter((d) => known.has(d));
    },
  );

  if (format === 'mermaid') {
    console.log(emitMermaid(skills, type));
  } else if (format === 'dot') {
    console.log(emitDot(skills, type));
  } else if (format === 'md') {
    console.log(emitMarkdown(skills, type));
  } else {
    console.log(emitAscii(skills, type));
  }

  if (cycle) {
    console.error(`WARN: dependency cycle detected: ${cycle.join(' -> ')}`);
    return 1;
  }
  return 0;
}

function detectCycle(nodes: string[], edges: (n: string) => string[]): string[] | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n, WHITE);
  const stack: string[] = [];
  function dfs(n: string): string[] | null {
    color.set(n, GRAY);
    stack.push(n);
    for (const m of edges(n)) {
      const c = color.get(m);
      if (c === GRAY) {
        const idx = stack.indexOf(m);
        return [...stack.slice(idx), m];
      }
      if (c === WHITE) {
        const r = dfs(m);
        if (r) return r;
      }
    }
    color.set(n, BLACK);
    stack.pop();
    return null;
  }
  for (const n of nodes) {
    if (color.get(n) === WHITE) {
      const r = dfs(n);
      if (r) return r;
    }
  }
  return null;
}

function categoryBadge(category?: string): string {
  if (!category) return '';
  const colors: Record<string, string> = {
    scoping: '#dae8fc',
    building: '#d5e8d4',
    verifying: '#fff2cc',
    demoing: '#f8cecc',
    judging: '#e1d5e7',
    shipping: '#fad7ac',
    recovering: '#cce5ff',
    lifecycle: '#f0f0f0',
  };
  return `:::${colors[category] ?? '#ffffff'}`;
}

function shortDesc(s: string): string {
  return s.length > 64 ? s.slice(0, 61) + '...' : s;
}

function emitMermaid(
  skills: ReturnType<typeof loadAllSkills>,
  type: 'all' | 'deps' | 'effects',
): string {
  const lines: string[] = ['flowchart LR'];
  // Subgraph per category.
  const byCategory = new Map<string, typeof skills>();
  for (const cat of SKILL_CATEGORIES) byCategory.set(cat, []);
  for (const s of skills) {
    const cat = s.frontmatter.category ?? 'lifecycle';
    const bucket = byCategory.get(cat) ?? byCategory.get('lifecycle')!;
    bucket.push(s);
  }
  for (const [cat, list] of byCategory) {
    if (list.length === 0) continue;
    lines.push(`  subgraph ${cat}["${cat}"]`);
    for (const s of list) {
      const label = `${s.frontmatter.name}<br/>v${s.frontmatter.version ?? '?'}`;
      lines.push(`    ${safeId(s.frontmatter.name)}["${label}"]${categoryBadge(cat)}`);
    }
    lines.push('  end');
  }
  if (type !== 'effects') {
    for (const s of skills) {
      for (const dep of s.frontmatter.dependencies ?? []) {
        lines.push(`  ${safeId(dep)} --> ${safeId(s.frontmatter.name)}`);
      }
    }
  }
  if (type !== 'deps') {
    lines.push(`  subgraph states["state files"]`);
    const states = new Set<string>();
    for (const s of skills) {
      for (const ref of s.frontmatter.side_effects ?? []) states.add(ref);
    }
    for (const state of states) {
      lines.push(`    state_${safeId(state)}([".hackathon/state/${state}.json"])`);
    }
    lines.push('  end');
    for (const s of skills) {
      for (const ref of s.frontmatter.side_effects ?? []) {
        lines.push(`  ${safeId(s.frontmatter.name)} -.-> state_${safeId(ref)}`);
      }
    }
  }
  return lines.join('\n') + '\n';
}

function safeId(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_');
}

function emitDot(
  skills: ReturnType<typeof loadAllSkills>,
  type: 'all' | 'deps' | 'effects',
): string {
  const lines: string[] = ['digraph skills {'];
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box, style=filled];');
  for (const s of skills) {
    const fill = (s.frontmatter.category ?? 'lifecycle') === 'lifecycle' ? '#f0f0f0' : 'white';
    lines.push(
      `  "${s.frontmatter.name}" [label="${s.frontmatter.name}\\nv${s.frontmatter.version ?? '?'}", fillcolor="${fill}"];`,
    );
  }
  if (type !== 'effects') {
    for (const s of skills) {
      for (const dep of s.frontmatter.dependencies ?? []) {
        lines.push(`  "${dep}" -> "${s.frontmatter.name}";`);
      }
    }
  }
  if (type !== 'deps') {
    const states = new Set<string>();
    for (const s of skills) for (const ref of s.frontmatter.side_effects ?? []) states.add(ref);
    for (const state of states) {
      lines.push(
        `  "${state}" [label=".hackathon/state/${state}.json", shape=cylinder, style=filled, fillcolor="#ffe4b5"];`,
      );
    }
    for (const s of skills) {
      for (const ref of s.frontmatter.side_effects ?? []) {
        lines.push(`  "${s.frontmatter.name}" -> "${ref}" [style=dashed, label="writes"];`);
      }
    }
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

function emitAscii(
  skills: ReturnType<typeof loadAllSkills>,
  type: 'all' | 'deps' | 'effects',
): string {
  const lines: string[] = [];
  if (type !== 'effects') {
    lines.push('Skill dependencies (skill -> [skills it depends on]):');
    for (const s of skills) {
      const deps = s.frontmatter.dependencies ?? [];
      if (deps.length === 0) {
        lines.push(`  ${s.frontmatter.name.padEnd(20)} -> (none)`);
      } else {
        lines.push(`  ${s.frontmatter.name.padEnd(20)} -> ${deps.join(', ')}`);
      }
    }
  }
  if (type === 'all') lines.push('');
  if (type !== 'deps') {
    lines.push('State writes (.hackathon/state/<x>.json):');
    const seen = new Set<string>();
    for (const s of skills) {
      const effects = s.frontmatter.side_effects ?? [];
      if (effects.length === 0) continue;
      const key = effects.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const writers = skills
        .filter((sk) => (sk.frontmatter.side_effects ?? []).join(',') === key)
        .map((sk) => sk.frontmatter.name);
      lines.push(`  ${effects.join(', ').padEnd(20)} <- ${writers.join(', ')}`);
    }
  }
  return lines.join('\n') + '\n';
}

function emitMarkdown(
  skills: ReturnType<typeof loadAllSkills>,
  type: 'all' | 'deps' | 'effects',
): string {
  const lines: string[] = [];
  if (type !== 'effects') {
    lines.push('## Skill dependency graph');
    lines.push('');
    lines.push('```mermaid');
    lines.push(emitMermaid(skills, 'deps').trimEnd());
    lines.push('```');
    lines.push('');
  }
  if (type === 'all') lines.push('');
  if (type !== 'deps') {
    lines.push('## State-file writes');
    lines.push('');
    lines.push('```mermaid');
    lines.push(emitMermaid(skills, 'effects').trimEnd());
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}
