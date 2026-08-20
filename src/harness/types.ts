/**
 * types.ts — the contract every Hackathon Run skill must satisfy.
 *
 * This is the *harness* of the skill pack. It defines:
 *   - how a SKILL.md is parsed (frontmatter + body)
 *   - how the trigger phrase budget is enforced (<=1536 chars)
 *   - how skills are discovered and loaded
 *   - how the agent invokes them at runtime
 *
 * Design references:
 *   - openai/skills (Codex): each skill is a folder with SKILL.md
 *   - anthropics/skills (Claude Code): same format, "when_to_use" optional
 *   - anthropic.com/engineering/equipping-agents-for-the-real-world:
 *       trigger discipline, prompt budget, layered loading
 */

export interface SkillFrontmatter {
  /** kebab-case skill identifier, must match the folder name */
  name: string;
  /**
   * Required. The single most important field. The agent uses this to
   * decide whether to load the skill. Must lead with an action verb.
   */
  description: string;
  /** Optional but recommended. Provides additional trigger context. */
  when_to_use?: string;
  /** Optional: only invoke the skill when matching file paths exist. */
  paths?: string[];
  /** Optional: explicitly declare which tools the skill needs. */
  allowed_tools?: string[];
  /** Optional: pin a specific model. */
  model?: string;
  /** Optional: semver of the skill itself (e.g. "1.0"). Required by Format v2. */
  version?: string;
  /** Optional: lifecycle category (scoping | building | verifying | demoing | judging | shipping | recovering | lifecycle). */
  category?: string;
  /** Optional: free-form tags for filtering and discovery. */
  tags?: string[];
  /** Optional: other skill names this skill chains to / pairs with. */
  dependencies?: string[];
  /** Optional: state files this skill writes (.hackathon/state/<x>.json). */
  side_effects?: string[];
  /** Optional: explicit trigger phrases the matcher also scores. */
  triggers?: string[];
  /** Optional: license name or reference to a bundled license file (Agent Skills spec). */
  license?: string;
  /** Optional: max 500-char environment/requirements note (Agent Skills spec). */
  compatibility?: string;
  /** Optional: skill author or owning org (third-party manifest). */
  author?: string;
  /** Optional: project homepage URL (third-party manifest). */
  homepage?: string;
  /** Optional: source repository URL or owner/repo (third-party manifest). */
  repository?: string;
}

/** Lifecycle categories a skill can belong to (Format v2). */
export const SKILL_CATEGORIES = [
  'scoping',
  'building',
  'verifying',
  'demoing',
  'judging',
  'shipping',
  'recovering',
  'lifecycle',
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export function isSkillCategory(value: string): value is SkillCategory {
  return (SKILL_CATEGORIES as readonly string[]).includes(value);
}

export interface SkillManifest {
  /** absolute or repo-relative path to the SKILL.md */
  path: string;
  /** folder containing the skill */
  dir: string;
  frontmatter: SkillFrontmatter;
  /** raw markdown body (frontmatter stripped) */
  body: string;
  /** total length of description + when_to_use, for budget enforcement */
  triggerBudget: number;
}

export interface SkillInvocation {
  /** which skill is being run */
  skill: string;
  /** resolved absolute repo root */
  repoRoot: string;
  /** CLI args or interactive answers */
  args: Record<string, unknown>;
  /** ISO timestamp */
  startedAt: string;
}

export interface SkillResult {
  skill: string;
  status: 'ok' | 'refused' | 'error';
  /** exit code 0 / 1 / 2 */
  exitCode: number;
  /** short summary line(s) the agent should surface */
  summary: string[];
  /** files written by the skill (state, artifacts) */
  filesWritten: string[];
  /** non-blocking warnings the agent should relay */
  warnings: string[];
}
