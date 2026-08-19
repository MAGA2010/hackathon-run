/**
 * run.ts — invoke a skill by name.
 *
 * Behaviour:
 *  - Default: print the SKILL.md body (same as v0.3.0).
 *  - With --apply and any input flag, pre-fill the skill's target
 *    state file with the provided args (validated by JSON Schema).
 *  - Unknown flags are rejected (was: silently accepted).
 *
 * Recognised flags (all optional, ignored for guidance-only skills):
 *   --demo-goal <string>     pre-fill plan.demo_goal
 *   --team-size <n>          pre-fill time-box.team_size
 *   --time-remaining <n>     pre-fill plan.time_remaining_minutes or
 *                            time-box.time_remaining_minutes
 *   --apply                  actually write the pre-filled state file
 *   --no-banner              skip the # Skill: + trigger budget header
 *
 * Usage:
 *   hackathon run scope-knife --demo-goal "sign up + save note" --apply
 *   hackathon run time-box --time-remaining 240 --team-size 4 --apply
 */

import { loadAllSkills } from '../../harness/loader.js';
import { writeState } from '../../harness/state.js';
import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

export interface RunOptions {
  skillName: string;
  demoGoal?: string;
  teamSize?: number;
  timeRemaining?: number;
  apply?: boolean;
  noBanner?: boolean;
  cwd?: string;
}

const STATE_REFS_RE = /state\/([a-z_-]+)\.json/g;

function targetStateFile(body: string): string | null {
  // Prefer the LAST state/<x>.json reference: the Output contract section is
  // always near the bottom of the SKILL.md, while Input contract references
  // appear near the top.
  const matches = [...body.matchAll(STATE_REFS_RE)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1] + '.json';
}

function buildSkeleton(stateFile: string, opts: RunOptions): unknown {
  const now = new Date().toISOString();
  const tr = opts.timeRemaining ?? 0;
  const team = opts.teamSize ?? 1;
  const goal = opts.demoGoal ?? '';
  switch (stateFile) {
    case 'plan.json':
      return {
        version: '1.0',
        generated_at: now,
        demo_goal: goal || '(set via hackathon run scope-knife --demo-goal=...)',
        time_remaining_minutes: tr,
        features: [],
        demo_path: [],
        next_tasks: [],
      };
    case 'verify.json':
      return { version: '1.0', started_at: now, status: 'skipped', steps: [] };
    case 'demo.json':
      return {
        version: '1.0',
        duration_seconds: 60,
        one_liner: goal || '(set via hackathon run demo-coach --demo-goal=...)',
        steps: [
          {
            name: 'opening',
            max_seconds: 5,
            say: '(fill in)',
            click: '',
            show: '',
            not: '',
            risks: [],
          },
          {
            name: 'pain',
            max_seconds: 10,
            say: '(fill in)',
            click: '',
            show: '',
            not: '',
            risks: [],
          },
          {
            name: 'product',
            max_seconds: 15,
            say: '(fill in)',
            click: '',
            show: '',
            not: '',
            risks: [],
          },
          {
            name: 'core_action',
            max_seconds: 15,
            say: '(fill in)',
            click: '',
            show: '',
            not: '',
            risks: [],
          },
          {
            name: 'result',
            max_seconds: 10,
            say: '(fill in)',
            click: '',
            show: '',
            not: '',
            risks: [],
          },
          {
            name: 'close',
            max_seconds: 5,
            say: '(fill in)',
            click: '',
            show: '',
            not: '',
            risks: [],
          },
        ],
      };
    case 'review.json':
      return {
        version: '1.0',
        generated_at: now,
        dimensions: [
          {
            name: 'problem_clarity',
            score: 0,
            deduction_reason: '(fill in)',
            judge_questions: ['?', '?'],
            improvements: [],
          },
          {
            name: 'originality',
            score: 0,
            deduction_reason: '(fill in)',
            judge_questions: ['?', '?'],
            improvements: [],
          },
          {
            name: 'completeness',
            score: 0,
            deduction_reason: '(fill in)',
            judge_questions: ['?', '?'],
            improvements: [],
          },
          {
            name: 'technical_depth',
            score: 0,
            deduction_reason: '(fill in)',
            judge_questions: ['?', '?'],
            improvements: [],
          },
          {
            name: 'demo_quality',
            score: 0,
            deduction_reason: '(fill in)',
            judge_questions: ['?', '?'],
            improvements: [],
          },
          {
            name: 'business_value',
            score: 0,
            deduction_reason: '(fill in)',
            judge_questions: ['?', '?'],
            improvements: [],
          },
          {
            name: 'submission_readiness',
            score: 0,
            deduction_reason: '(fill in)',
            judge_questions: ['?', '?'],
            improvements: [],
          },
        ],
        overall: 0,
        fix_priorities: { fix_now: [], fix_last_10min: [], do_not_touch: [] },
      };
    case 'ship.json':
      return {
        version: '1.0',
        generated_at: now,
        readme: { present: [], missing: [] },
        secret_scan: { clean: true, findings: [] },
        checklist: { passed: [], failed: [] },
        reproducible: { ok: true, reason: '' },
        packaging_command: 'echo "fill in the tar command"',
      };
    case 'recovery.json':
      return {
        version: '1.0',
        generated_at: now,
        failure: '(describe failure)',
        severity: 'P3',
        fallback: { default: '', do: '', say: '', not: '' },
        script: [],
      };
    case 'time-box.json':
      return {
        version: '1.0',
        generated_at: now,
        time_remaining_minutes: tr,
        team_size: team,
        current_stage: 'build',
        schedule: [],
      };
    case 'stack.json':
      return {
        version: '1.0',
        generated_at: now,
        demo_format: 'web',
        recommendation: { stack: '?', score: 0, rationale: '(fill in)' },
        runners_up: [],
        bootstrap: { steps: [] },
      };
    case 'retro.json':
      return {
        version: '1.0',
        generated_at: now,
        ratios: { scope_accuracy: 0, time_accuracy: 0, verify_pass_rate: 0, judge_score_avg: 0 },
        surprises: [],
        keep_doing: [],
        stop_doing: [],
        try_next_time: [],
      };
    case 'rehearsal.json':
      return {
        version: '1.0',
        started_at: now,
        target_total_seconds: 180,
        segments: [],
        fixes: [],
      };
    case 'roster.json':
      return {
        version: '1.0',
        generated_at: now,
        team_size: team,
        members: [],
        bottleneck: { member: '', reason: '' },
      };
  }
  return { version: '1.0', generated_at: now };
}
export function runSkill(opts: RunOptions): number {
  const cwd = opts.cwd ?? process.cwd();
  const skills = loadAllSkills(cwd);
  const skill = skills.find((s) => s.frontmatter.name === opts.skillName);
  if (!skill) {
    log.err(`skill not found: ${opts.skillName}`);
    log.err(`run ${c.cyan('hackathon list')} to see bundled skills`);
    return 2;
  }
  if (!opts.noBanner) {
    console.log(`# Skill: ${skill.frontmatter.name}`);
    console.log(`# Trigger budget: ${skill.triggerBudget}/1536`);
    console.log();
  }
  console.log(skill.body);

  if (!opts.apply) return 0;

  const target = targetStateFile(skill.body);
  if (!target) {
    log.warn(`${opts.skillName} is guidance-only; nothing to apply.`);
    log.dim(`re-run without --apply to just print the SKILL.md.`);
    return 0;
  }
  const skeleton = buildSkeleton(target, opts);
  try {
    const written = writeState({ repoRoot: cwd, file: target, data: skeleton });
    console.log();
    log.ok(`wrote ${written}`);
    const applied: string[] = [];
    if (opts.demoGoal) applied.push('--demo-goal');
    if (opts.teamSize != null) applied.push('--team-size');
    if (opts.timeRemaining != null) applied.push('--time-remaining');
    if (applied.length > 0) {
      log.dim(`applied flags: ${applied.join(', ')}`);
    } else {
      log.dim(
        'no input flags passed; wrote a blank skeleton. Re-run with --demo-goal / --team-size / --time-remaining to pre-fill.',
      );
    }
  } catch (e) {
    log.err(`failed to write ${target}: ${(e as Error).message}`);
    return 1;
  }
  return 0;
}
