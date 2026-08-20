#!/usr/bin/env node
/**
 * index.ts — `hackathon` CLI entrypoint.
 *
 * Subcommands:
 *   init           Bootstrap .hackathon/ in the current repo
 *   list           List bundled skills
 *   status         Show lifecycle state across all 5 state files
 *   doctor         Diagnose environment + state-file health
 *   flow           Run the full 36h pipeline end-to-end
 *   diff <a> <b>    Compare two state files or state dirs
 *   new-skill <name>  Scaffold a brand-new skill folder
 *   validate-skill <dir>  Lint a SKILL.md against the protocol
 *   validate [dir] Validate state JSON files against their schemas
 *   run <skill>    Invoke a skill (loads its SKILL.md as guidance for the agent)
 *   match <utterance>  Find the best skill for a user utterance
 *   --version      Print version
 *   --help         Print help
 */

import { Command } from 'commander';

import { init } from './commands/init.js';
import { list } from './commands/list.js';
import { status } from './commands/status.js';
import { doctor } from './commands/doctor.js';
import { flow } from './commands/flow.js';
import { diff } from './commands/diff.js';
import { newSkill } from './commands/new-skill.js';
import { validateSkill } from './commands/validate-skill.js';
import { validate } from './commands/validate.js';
import { loadAllSkills } from '../harness/loader.js';
import { runSkill, runChain } from './commands/run.js';
import { replay } from './commands/replay.js';
import { report } from './commands/report.js';
import { skills } from './commands/skills.js';
import { search as skillsSearch } from './commands/skills-search.js';
import { graph as skillsGraph } from './commands/skills-graph.js';
import { matchSkill } from '../harness/trigger.js';
import { startMcpServer } from '../mcp/server.js';

const PKG = JSON.parse(
  await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
  ),
);

const program = new Command();
program
  .name('hackathon')
  .description('A decision-making and execution system for hackathon teams.')
  .version(PKG.version);

program
  .command('new-skill <name>')
  .description('Scaffold a new skill folder under skills/<name>/')
  .option('-f, --force', 'overwrite an existing skill folder')
  .option('--with-scripts', 'include a python script stub (default: yes)')
  .option('--no-scripts', 'skip the python script stub')
  .option('--with-tests', 'include an acceptance test stub')
  .option('-d, --description <text>', 'frontmatter description')
  .option('-w, --when-to-use <text>', 'frontmatter when_to_use text')
  .action((name: string, opts) =>
    process.exit(
      newSkill({
        name,
        cwd: process.cwd(),
        force: Boolean(opts.force),
        withScripts: opts.scripts !== false,
        withTests: Boolean(opts.withTests),
        description: opts.description,
        whenToUse: opts.whenToUse,
      }),
    ),
  );

program
  .command('diff <a> <b>')
  .description('Compare two state files or .hackathon/state/ directories')
  .option('--stat', 'only print counts, not per-field diffs')
  .option('--json', 'machine-readable JSON output')
  .action((a: string, b: string, opts) =>
    process.exit(diff({ a, b, stat: Boolean(opts.stat), json: Boolean(opts.json) })),
  );

program
  .command('init')
  .description('Bootstrap .hackathon/ in the current repo')
  .option('-f, --force', 'overwrite an existing .hackathon/')
  .action((opts) => process.exit(init({ cwd: process.cwd(), force: opts.force })));

program
  .command('list')
  .description('List every bundled skill')
  .option(
    '-C, --cwd <path>',
    'use a different working directory (where skills/ live)',
    process.cwd(),
  )
  .action((opts: { cwd?: string }) => process.exit(list(opts.cwd ?? process.cwd())));

program
  .command('doctor')
  .description('Self-check the environment and state-file health')
  .option('--json', 'machine-readable JSON output')
  .option('-C, --cwd <path>', 'use a different working directory', process.cwd())
  .action((opts) => process.exit(doctor({ cwd: opts.cwd, json: Boolean(opts.json) })));

program
  .command('flow')
  .description('Guided end-to-end pipeline (scope -> verify -> demo -> judge -> ship)')
  .option('--json', 'machine-readable plan')
  .option('--execute', 'actually run the python scripts for each remaining stage')
  .option('-C, --cwd <path>', 'use a different working directory', process.cwd())
  .action((opts) =>
    process.exit(flow({ cwd: opts.cwd, json: Boolean(opts.json), execute: Boolean(opts.execute) })),
  );

program
  .command('status')
  .description('Show current lifecycle state across all 5 state files')
  .option('--json', 'machine-readable JSON output')
  .option('-C, --cwd <path>', 'use a different working directory', process.cwd())
  .action((opts) => process.exit(status({ cwd: opts.cwd, json: Boolean(opts.json) })));

program
  .command('validate-skill <dir>')
  .description('Lint a SKILL.md against the Hackathon Run skill protocol')
  .option('--json', 'machine-readable JSON output')
  .action((dir: string, opts) =>
    process.exit(validateSkill({ target: dir, json: Boolean(opts.json) })),
  );

program
  .command('validate [dir]')
  .description('Validate state JSON files against their schemas')
  .action((dir) => process.exit(validate(dir ?? '.hackathon/state')));

program
  .command('mcp')
  .description('Start the Model Context Protocol (MCP) server on stdio (JSON-RPC 2.0)')
  .action(() => startMcpServer());

program
  .command('run <skill>')
  .description('Invoke a skill by name (with --apply, pre-fill the target state file)')
  .option('--demo-goal <text>', 'pre-fill plan.demo_goal with this string')
  .option('--team-size <n>', 'pre-fill time-box.team_size (parsed as integer)', parseInt)
  .option(
    '--time-remaining <n>',
    'pre-fill plan.time_remaining_minutes or time-box.time_remaining_minutes (parsed as integer)',
    parseInt,
  )
  .option('--apply', 'actually write the pre-filled state file to .hackathon/state/')
  .option('--chain', 'run the skill dependencies first, in topological order')
  .option('--no-banner', 'skip the "# Skill:" + trigger budget header')
  .option('-C, --cwd <path>', 'repo root (where skills/ and .hackathon/ live)', process.cwd())
  .action(
    (
      skillName: string,
      opts: {
        demoGoal?: string;
        teamSize?: number;
        timeRemaining?: number;
        apply?: boolean;
        chain?: boolean;
        banner?: boolean;
        cwd?: string;
      },
    ) => {
      const code = opts.chain
        ? runChain({
            skillName,
            demoGoal: opts.demoGoal,
            teamSize: opts.teamSize,
            timeRemaining: opts.timeRemaining,
            apply: opts.apply,
            noBanner: opts.banner === false,
            cwd: opts.cwd,
          })
        : runSkill({
            skillName,
            demoGoal: opts.demoGoal,
            teamSize: opts.teamSize,
            timeRemaining: opts.timeRemaining,
            apply: opts.apply,
            noBanner: opts.banner === false,
            cwd: opts.cwd,
          });
      process.exit(code);
    },
  );

program
  .command('replay')
  .description("Reconstruct the team's timeline from .hackathon/state/ files")
  .option('--json', 'machine-readable JSON output')
  .option('-C, --cwd <path>', 'use a different repo root', process.cwd())
  .action((opts: { json?: boolean; cwd?: string }) => {
    process.exit(replay({ json: opts.json, cwd: opts.cwd }));
  });

program
  .command('report')
  .description('Generate a post-hackathon markdown report from state files')
  .option('--out <path>', 'write the markdown report to a file (default: stdout)')
  .option('--json', 'machine-readable JSON output')
  .option('-C, --cwd <path>', 'use a different repo root', process.cwd())
  .action((opts: { out?: string; json?: boolean; cwd?: string }) => {
    process.exit(report({ out: opts.out, json: opts.json, cwd: opts.cwd }));
  });

const skillsCmd = program
  .command('skills')
  .description('Manage the .hackathon/skills.json catalog (pin / diff / show / list)');

skillsCmd
  .command('list')
  .description('List every bundled skill')
  .option('-C, --cwd <path>', 'repo root', process.cwd())
  .action((opts: { cwd?: string }) => process.exit(skills({ subcommand: 'list', cwd: opts.cwd })));

skillsCmd
  .command('pin')
  .description('Pin every bundled skill into .hackathon/skills.json')
  .option('--all', 'pin every skill (default; reserved for future single-name pinning)')
  .option('-C, --cwd <path>', 'repo root', process.cwd())
  .action((opts: { cwd?: string }) => process.exit(skills({ subcommand: 'pin', cwd: opts.cwd })));

skillsCmd
  .command('diff')
  .description('Show what changed since the pin was written')
  .option('-C, --cwd <path>', 'repo root', process.cwd())
  .action((opts: { cwd?: string }) => process.exit(skills({ subcommand: 'diff', cwd: opts.cwd })));

skillsCmd
  .command('show')
  .description('Print the current .hackathon/skills.json pin')
  .option('-C, --cwd <path>', 'repo root', process.cwd())
  .action((opts: { cwd?: string }) => process.exit(skills({ subcommand: 'show', cwd: opts.cwd })));

skillsCmd
  .command('graph')
  .description('Emit a Mermaid / DOT / ASCII graph of skill dependencies + side effects')
  .option('--format <fmt>', 'mermaid | dot | ascii', 'mermaid')
  .option('--type <type>', 'all | deps | effects', 'all')
  .option('-C, --cwd <path>', 'repo root', process.cwd())
  .action((opts: { format?: string; type?: string; cwd?: string }) => {
    const f = (opts.format ?? 'mermaid') as 'mermaid' | 'dot' | 'ascii';
    const t = (opts.type ?? 'all') as 'all' | 'deps' | 'effects';
    process.exit(skillsGraph({ format: f, type: t, cwd: opts.cwd }));
  });

skillsCmd
  .command('search')
  .description('Filter skills by Format v2 metadata (--tag / --category / --writes / --depends-on)')
  .option('--tag <name>', 'match skills with this tag')
  .option(
    '--category <name>',
    'match skills in this lifecycle category (scoping|building|verifying|demoing|judging|shipping|recovering|lifecycle)',
  )
  .option('--writes <state>', 'match skills that write .hackathon/state/<state>.json')
  .option('--depends-on <name>', 'match skills that pair with / chain to <name>')
  .option('--json', 'machine-readable JSON output')
  .option('-C, --cwd <path>', 'repo root', process.cwd())
  .action(
    (opts: {
      tag?: string;
      category?: string;
      writes?: string;
      dependsOn?: string;
      json?: boolean;
      cwd?: string;
    }) =>
      process.exit(
        skillsSearch({
          tag: opts.tag,
          category: opts.category,
          writes: opts.writes,
          dependsOn: opts.dependsOn,
          json: opts.json,
          cwd: opts.cwd,
        }),
      ),
  );

program
  .command('match <utterance>')
  .description('Find the best skill for a user utterance')
  .option('--debug', 'print per-candidate scoring reasons')
  .option('--json', 'machine-readable JSON output')
  .option(
    '-C, --cwd <path>',
    'use a different working directory (where skills/ live)',
    process.cwd(),
  )
  .action((utterance: string, opts) => {
    const skills = loadAllSkills(opts.cwd);
    const result = matchSkill(utterance, skills);
    if (opts.json) {
      const out = {
        utterance,
        best: result.skill ? { name: result.skill.frontmatter.name, score: result.score } : null,
        candidates: result.candidates,
      };
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    if (!result.skill) {
      console.log('no match');
      process.exit(0);
    }
    console.log(`best: ${result.skill.frontmatter.name} (score=${result.score})`);
    console.log('candidates:');
    for (const c of result.candidates.slice(0, 5)) {
      const reasons = opts.debug ? `  ${c.reasons.join('; ')}` : '';
      console.log(`  - ${c.name} (${c.score})${reasons}`);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
