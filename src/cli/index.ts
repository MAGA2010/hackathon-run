#!/usr/bin/env node
/**
 * index.ts — `hackathon` CLI entrypoint.
 *
 * Subcommands:
 *   init           Bootstrap .hackathon/ in the current repo
 *   list           List bundled skills
 *   run <skill>    Invoke a skill (loads its SKILL.md as guidance for the agent)
 *   validate [dir] Validate state JSON files against their schemas
 *   --version      Print version
 *   --help         Print help
 */

import { Command } from 'commander';

import { init } from './commands/init.js';
import { list } from './commands/list.js';
import { validate } from './commands/validate.js';
import { loadAllSkills } from '../harness/loader.js';
import { matchSkill } from '../harness/trigger.js';

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
  .command('init')
  .description('Bootstrap .hackathon/ in the current repo')
  .option('-f, --force', 'overwrite an existing .hackathon/')
  .action((opts) => process.exit(init({ cwd: process.cwd(), force: opts.force })));

program
  .command('list')
  .description('List every bundled skill')
  .action(() => process.exit(list(process.cwd())));

program
  .command('validate [dir]')
  .description('Validate state JSON files against their schemas')
  .action((dir) => process.exit(validate(dir ?? '.hackathon/state')));

program
  .command('run <skill>')
  .description('Invoke a skill by name')
  .allowUnknownOption(true)
  .action((skillName: string) => {
    const skills = loadAllSkills(process.cwd());
    const skill = skills.find((s) => s.frontmatter.name === skillName);
    if (!skill) {
      console.error(`[ERR] skill not found: ${skillName}`);
      console.error(`run \`hackathon list\` to see bundled skills`);
      process.exit(2);
    }
    console.log(`# Skill: ${skill.frontmatter.name}`);
    console.log(`# Trigger budget: ${skill.triggerBudget}/1536`);
    console.log();
    console.log(skill.body);
  });

program
  .command('match <utterance>')
  .description('Find the best skill for a user utterance')
  .action((utterance: string) => {
    const skills = loadAllSkills(process.cwd());
    const result = matchSkill(utterance, skills);
    if (!result.skill) {
      console.log('no match');
      process.exit(0);
    }
    console.log(`best: ${result.skill.frontmatter.name} (score=${result.score})`);
    console.log('candidates:');
    for (const c of result.candidates.slice(0, 5)) {
      console.log(`  - ${c.name} (${c.score})`);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
