
// Run via: node scripts/scaffold-skills.mjs
const { spawnSync } = await import('node:child_process');
const r = spawnSync('node', ['dist/cli/index.js', 'new-skill', 'idea-clarify',
  '--description', 'Surfaces what the user actually wants when the repo is empty or the request is one paragraph of vibes.',
  '--when-to-use', 'Trigger when scope-knife refuses to run because the repo is empty or the idea is too vague. Do not invoke once scope-knife has produced a plan.',
  '--with-tests'], { encoding: 'utf-8', stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status);
const r2 = spawnSync('node', ['dist/cli/index.js', 'new-skill', 'pivot',
  '--description', 'Detects a mid-build scope change and re-runs scope-knife against the new direction without losing prior progress.',
  '--when-to-use', 'Trigger when the user says "pivot", "change direction", "the demo idea is wrong now", or after a demo that landed flat. Do not invoke pre-build.',
  '--with-tests'], { encoding: 'utf-8', stdio: 'inherit' });
process.exit(r2.status);
