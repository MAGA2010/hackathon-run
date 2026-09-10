/**
 * run.ts — invoke a skill by name.
 *
 * Behaviour:
 *  - Default: print the SKILL.md body (same as v0.3.0).
 *  - With --apply and any input flag, pre-fill the skill's target
 *    state file with the provided args (validated by JSON Schema).
 *  - With --chain, follow Format v2 `dependencies` and print (or apply)
 *    every upstream skill in dependency order before the target skill.
 *  - Unknown flags are rejected (was: silently accepted).
 *
 * Recognised flags (all optional, ignored for guidance-only skills):
 *   --demo-goal <string>     pre-fill plan.demo_goal
 *   --team-size <n>          pre-fill time-box.team_size
 *   --time-remaining <n>     pre-fill plan.time_remaining_minutes or
 *                            time-box.time_remaining_minutes
 *   --apply                  actually write the pre-filled state file
 *   --chain                  run dependencies first (topological order)
 *   --no-banner              skip the "# Skill: " + trigger budget header
 *
 * Usage:
 *   hackathon run scope-knife --demo-goal "sign up + save note" --apply
 *   hackathon run demo-rehearsal --chain
 *   hackathon run time-box --time-remaining 240 --team-size 4 --apply
 */

import { loadAllSkills } from '../../harness/loader.js';
import { writeState } from '../../harness/state.js';
import { appendTrace } from '../../harness/trace.js';
import { c } from '../lib/colors.js';
import { commandFail, commandOk, errorMessage, type CommandResult } from '../lib/command-result.js';
import { log } from '../lib/logger.js';

export interface RunOptions {
  skillName: string;
  demoGoal?: string;
  teamSize?: number;
  timeRemaining?: number;
  apply?: boolean;
  chain?: boolean;
  noBanner?: boolean;
  cwd?: string;
}

export interface RunSkillPayload {
  skill: string;
  output: string;
  warning?: string;
  wrote?: string;
  applied_flags?: string[];
}

export interface RunSkillErrorPayload {
  skill: string;
  output: string;
  error: string;
}

export interface RunChainPayload {
  target: string;
  upstream: string[];
  order: string[];
  output: string;
  steps: Array<{ skill: string; exit_code: number; error?: string }>;
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

export function buildSkeleton(stateFile: string, opts: RunOptions): unknown {
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
    case 'decision-log.json':
      return {
        version: '1.0',
        generated_at: now,
        entries: [],
      };
  }
  return { version: '1.0', generated_at: now };
}

export function runSkillResult(
  opts: RunOptions,
): CommandResult<RunSkillPayload | RunSkillErrorPayload> {
  const cwd = opts.cwd ?? process.cwd();
  const skills = loadAllSkills(cwd);
  const skill = skills.find((s) => s.frontmatter.name === opts.skillName);
  if (!skill) {
    return commandFail(
      {
        skill: opts.skillName,
        output: '',
        error: `skill not found: ${opts.skillName}; run ${c.cyan('hackathon list')} to see bundled skills`,
      },
      2,
    );
  }
  appendTrace(cwd, {
    type: 'skill.invoke',
    actor: 'cli',
    skill: opts.skillName,
    status: 'ok',
    summary: `Invoked skill ${opts.skillName}`,
  });
  const outputLines: string[] = [];
  if (!opts.noBanner) {
    outputLines.push(`# Skill: ${skill.frontmatter.name}`);
    outputLines.push(`# Trigger budget: ${skill.triggerBudget}/1536`);
    outputLines.push('');
  }
  outputLines.push(skill.body);
  const output = outputLines.join('\n');

  if (!opts.apply) {
    return commandOk({ skill: opts.skillName, output });
  }

  const target = targetStateFile(skill.body);
  if (!target) {
    return commandOk({
      skill: opts.skillName,
      output,
      warning: `${opts.skillName} is guidance-only; nothing to apply.\nre-run without --apply to just print the SKILL.md.`,
    });
  }
  const skeleton = buildSkeleton(target, opts);
  try {
    const written = writeState({ repoRoot: cwd, file: target, data: skeleton });
    const applied: string[] = [];
    if (opts.demoGoal) applied.push('--demo-goal');
    if (opts.teamSize != null) applied.push('--team-size');
    if (opts.timeRemaining != null) applied.push('--time-remaining');
    return commandOk({
      skill: opts.skillName,
      output,
      wrote: written,
      applied_flags: applied,
    });
  } catch (e) {
    appendTrace(cwd, {
      type: 'skill.error',
      actor: 'cli',
      skill: opts.skillName,
      status: 'error',
      summary: `Skill ${opts.skillName} failed to apply state: ${(e as Error).message}`,
    });
    return commandFail({
      skill: opts.skillName,
      output,
      error: `failed to write ${target}: ${errorMessage(e)}`,
    });
  }
}

export function runSkill(opts: RunOptions): number {
  const result = runSkillResult(opts);
  if (result.data.output) console.log(result.data.output);
  if ('error' in result.data) {
    log.err(result.data.error);
    return result.exitCode;
  }
  if (result.data.warning) {
    log.warn(result.data.warning.split('\n')[0]);
    log.dim(result.data.warning.split('\n').slice(1).join('\n'));
    return result.exitCode;
  }
  if (result.data.wrote) {
    console.log();
    log.ok(`wrote ${result.data.wrote}`);
    const applied = result.data.applied_flags ?? [];
    if (applied.length > 0) {
      log.dim(`applied flags: ${applied.join(', ')}`);
    } else {
      log.dim(
        'no input flags passed; wrote a blank skeleton. Re-run with --demo-goal / --team-size / --time-remaining to pre-fill.',
      );
    }
  }
  return result.exitCode;
}

export interface ChainPlan {
  order: string[];
  cycle: string[] | null;
}

/** Resolve the target skill plus its transitive dependencies in dependency order. */
export function resolveChainOrder(
  skills: ReturnType<typeof loadAllSkills>,
  target: string,
): ChainPlan {
  const byName = new Map(skills.map((s) => [s.frontmatter.name, s]));
  if (!byName.has(target)) return { order: [], cycle: null };

  const order: string[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  const visit = (name: string): string[] | null => {
    if (visited.has(name)) return null;
    if (inStack.has(name)) {
      const idx = stack.indexOf(name);
      return [...stack.slice(idx), name];
    }
    inStack.add(name);
    stack.push(name);
    const skill = byName.get(name);
    for (const dep of skill?.frontmatter.dependencies ?? []) {
      if (!byName.has(dep)) continue; // unknown dependency: skip, don't fail
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    inStack.delete(name);
    visited.add(name);
    order.push(name);
    return null;
  };

  const cycle = visit(target);
  if (cycle) return { order: [], cycle };
  return { order, cycle: null };
}

export function runChain(opts: RunOptions): number {
  const result = runChainResult(opts);
  if (result.data.output) console.log(result.data.output);
  if (result.exitCode !== 0 && result.data.steps.every((step) => step.error)) {
    for (const step of result.data.steps) {
      if (step.error) log.err(step.error);
    }
  }
  return result.exitCode;
}

export function runChainResult(opts: RunOptions): CommandResult<RunChainPayload> {
  const cwd = opts.cwd ?? process.cwd();
  const skills = loadAllSkills(cwd);

  if (!skills.find((s) => s.frontmatter.name === opts.skillName)) {
    return commandFail(
      {
        target: opts.skillName,
        upstream: [],
        order: [],
        output: '',
        steps: [
          { skill: opts.skillName, exit_code: 2, error: `skill not found: ${opts.skillName}` },
        ],
      },
      2,
    );
  }

  const plan = resolveChainOrder(skills, opts.skillName);
  if (plan.cycle) {
    return commandFail({
      target: opts.skillName,
      upstream: [],
      order: [],
      output: '',
      steps: [
        {
          skill: opts.skillName,
          exit_code: 1,
          error: `dependency cycle detected: ${plan.cycle.join(' -> ')}\nfix the Format v2 "dependencies" frontmatter before chaining.`,
        },
      ],
    });
  }

  const target = opts.skillName;
  const upstream = plan.order.filter((name) => name !== target);
  const output: string[] = [c.bold(`chain: ${[...upstream, target].join(' -> ')}`), ''];
  const steps: RunChainPayload['steps'] = [];

  let code = 0;
  for (const name of plan.order) {
    const step = runSkillResult({ ...opts, skillName: name, noBanner: true });
    if (step.exitCode !== 0) code = step.exitCode;
    if (step.data.output) output.push(step.data.output);
    output.push('');
    steps.push({
      skill: name,
      exit_code: step.exitCode,
      ...('error' in step.data ? { error: step.data.error } : {}),
    });
  }
  return {
    exitCode: code,
    data: { target, upstream, order: plan.order, output: output.join('\n'), steps },
  };
}
