/**
 * types.ts — the contract every Hackathon Surgeon skill must satisfy.
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
  status: "ok" | "refused" | "error";
  /** exit code 0 / 1 / 2 */
  exitCode: number;
  /** short summary line(s) the agent should surface */
  summary: string[];
  /** files written by the skill (state, artifacts) */
  filesWritten: string[];
  /** non-blocking warnings the agent should relay */
  warnings: string[];
}
