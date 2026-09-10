/**
 * skills-audit.ts - static security review for bundled and third-party skills.
 *
 * The checks target the highest-risk patterns from the Agent Skills supply
 * chain: prompt injection, shell/network exfiltration, embedded credentials,
 * destructive filesystem operations, and paths outside the project.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

import { findSkillDirs } from '../../harness/loader.js';
import { parseFrontmatter } from '../../harness/frontmatter.js';
import { c } from '../lib/colors.js';

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AuditFinding {
  severity: AuditSeverity;
  rule: string;
  file: string;
  line: number;
  message: string;
  excerpt?: string;
}

export interface SkillAuditResult {
  name: string;
  path: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  findings: AuditFinding[];
}

export interface SkillsAuditReport {
  cwd: string;
  skills_dir: string;
  scanned: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  skills: SkillAuditResult[];
}

export interface SkillsAuditOptions {
  cwd?: string;
  target?: string;
  json?: boolean;
  verbose?: boolean;
  strict?: boolean;
}

const MAX_FILE_BYTES = 1024 * 1024;

const PROMPT_INJECTION_RULES: Array<{
  rule: string;
  re: RegExp;
  severity: AuditSeverity;
  message: string;
}> = [
  {
    rule: 'prompt-injection.ignore-system',
    re: /(?:ignore|disregard|override|forget)\s+(?:all\s+)?(?:previous|prior|above|system|developer|safety|security)(?:\s+(?:previous|prior|above|system|developer|safety|security))*\s+(?:instructions|rules|guidelines|context)/i,
    severity: 'critical',
    message: 'instruction attempts to override system or developer instructions',
  },
  {
    rule: 'prompt-injection.exfiltration',
    re: /(?:exfiltrat|steal|send)\b.{0,80}\b(?:api[ -]?keys?|tokens?|passwords?|secrets?|credentials?)/i,
    severity: 'critical',
    message: 'instruction describes extracting or sending credentials',
  },
  {
    rule: 'prompt-injection.silence-safety',
    re: /(?:never|do not|must not)\s+(?:warn|refuse|block|report)\b/i,
    severity: 'high',
    message: 'instruction suppresses warnings, refusal, or reporting',
  },
  {
    rule: 'prompt-injection.obey-content',
    re: /(?:obey|trust)\s+only\s+(?:the\s+)?(?:instructions|prompt|contents?)\b.{0,60}\b(?:ignore|above|this)\b/i,
    severity: 'high',
    message: 'instruction establishes a competing authority over prior context',
  },
];

const SHELL_RULES: Array<{ rule: string; re: RegExp; severity: AuditSeverity; message: string }> = [
  {
    rule: 'shell.download-execute',
    re: /(?:curl|wget|iwr|invoke-webrequest)\b.{0,180}\|\s*(?:ba|z|k|c|tc)?sh\b/i,
    severity: 'critical',
    message: 'remote content is downloaded and piped into a shell',
  },
  {
    rule: 'shell.remote-exec',
    re: /(?:os\.system\s*\(|subprocess\.(?:run|call|check_output|Popen)\s*\(|child_process|shell_exec\s*\(|popen\s*\(|invoke-expression\b|iex\s+)/i,
    severity: 'high',
    message: 'code executes a child process or dynamic expression',
  },
  {
    rule: 'shell.destructive-outside-project',
    re: /(?:rm\s+-rf\s+(?:\/|\$HOME|~)|remove-item\s+-recurse\s+-force\s+(?:c:\\|d:\\|\$home|~))/i,
    severity: 'critical',
    message: 'recursive delete targets a root, home, or drive path',
  },
  {
    rule: 'shell.obfuscation',
    re: /(?:base64\s+(?:-d|--decode)|frombase64string\s*\(|powershell\s+-enc(?:odedcommand)?\b|iex\s*\()/i,
    severity: 'high',
    message: 'code decodes or dynamically executes an encoded payload',
  },
  {
    rule: 'shell.backdoor-client',
    re: /\b(?:nc|netcat|socat)\b/i,
    severity: 'high',
    message: 'code references a raw network tunnel client',
  },
];

const SECRET_RULES: Array<{ rule: string; re: RegExp; severity: AuditSeverity; message: string }> =
  [
    {
      rule: 'secret.private-key',
      re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      severity: 'critical',
      message: 'embedded private key',
    },
    {
      rule: 'secret.known-token',
      re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,})\b/,
      severity: 'critical',
      message: 'known API token or credential shape',
    },
    {
      rule: 'secret.assignment',
      re: /\b(?:password|passwd|secret|api[_-]?key|token)\b\s*[:=]\s*["'][^"'\r\n]{8,}["']/i,
      severity: 'high',
      message: 'credential-like value assigned in source or instructions',
    },
  ];

const NETWORK_RULES: Array<{ rule: string; re: RegExp; severity: AuditSeverity; message: string }> =
  [
    {
      rule: 'network.suspicious-host',
      re: /https?:\/\/(?:raw\.githubusercontent\.com|pastebin\.com|transfer\.sh|ngrok\.io|webhook\.site)\/[^\s'")]+/i,
      severity: 'high',
      message: 'remote content is fetched from a dynamic or paste-host',
    },
    {
      rule: 'network.loopback',
      re: /https?:\/\/127\.0\.0\.1(?::\d+)?\/[^\s'")]+/i,
      severity: 'medium',
      message: 'loopback URL appears in a portable skill',
    },
  ];

const PATH_RULES: Array<{ rule: string; re: RegExp; severity: AuditSeverity; message: string }> = [
  {
    rule: 'path.outside-project',
    re: /(?:\/etc\/(?:passwd|shadow|ssh)|\/usr\/(?:local|share|lib)(?:\/|$)|c:\\windows|%appdata%|\$home\/\.ssh|~\/\.ssh)/i,
    severity: 'high',
    message: 'skill references a sensitive path outside the project',
  },
];

function lineNumber(raw: string, match: RegExp): number {
  const index = raw.search(match);
  if (index < 0) return 1;
  return raw.slice(0, index).split(/\r?\n/).length;
}

function excerpt(raw: string, match: RegExp): string | undefined {
  const index = raw.search(match);
  if (index < 0) return undefined;
  const start = Math.max(0, index - 40);
  const end = Math.min(raw.length, index + 80);
  return raw.slice(start, end).replace(/\r?\n/g, ' ').trim();
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function auditFile(file: string, root: string, raw: string, findings: AuditFinding[]): void {
  const rel = relative(root, file);
  for (const group of [
    PROMPT_INJECTION_RULES,
    SHELL_RULES,
    SECRET_RULES,
    NETWORK_RULES,
    PATH_RULES,
  ]) {
    for (const entry of group) {
      if (!entry.re.test(raw)) continue;
      findings.push({
        severity: entry.severity,
        rule: entry.rule,
        file: rel,
        line: lineNumber(raw, entry.re),
        message: entry.message,
        excerpt: excerpt(raw, entry.re),
      });
    }
  }
}

function auditSkill(dir: string, root: string): SkillAuditResult {
  const findings: AuditFinding[] = [];
  const files = walk(dir);
  const skillMd = join(dir, 'SKILL.md');
  let frontmatter: ReturnType<typeof parseFrontmatter>['frontmatter'] | null = null;

  if (existsSync(skillMd)) {
    try {
      frontmatter = parseFrontmatter(readFileSync(skillMd, 'utf8')).frontmatter;
    } catch {
      frontmatter = null;
    }
  }

  for (const file of files) {
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_BYTES) continue;
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    auditFile(file, root, raw, findings);
  }

  const hasScripts = files.some((file) => /\.(?:py|js|mjs|ts|sh|ps1)$/.test(file));
  const allowedTools = frontmatter?.allowed_tools ?? [];
  if (hasScripts && allowedTools.length === 0) {
    findings.push({
      severity: 'info',
      rule: 'allowed-tools.missing',
      file: relative(root, skillMd),
      line: 1,
      message: 'skill bundles scripts but declares no allowed_tools',
    });
  }

  const dangerous =
    findings.some((finding) => finding.rule.startsWith('shell.')) &&
    !allowedTools.some((tool) => /bash|shell|powershell|exec/i.test(tool));
  if (dangerous) {
    findings.push({
      severity: 'medium',
      rule: 'allowed-tools.shell-mismatch',
      file: relative(root, skillMd),
      line: 1,
      message: 'scripts contain shell actions but allowed_tools does not grant a shell',
    });
  }

  const counts = (severity: AuditSeverity) =>
    findings.filter((finding) => finding.severity === severity).length;
  return {
    name: basename(dir),
    path: dir,
    critical: counts('critical'),
    high: counts('high'),
    medium: counts('medium'),
    low: counts('low'),
    info: counts('info'),
    findings,
  };
}

export function auditSkills(opts: SkillsAuditOptions): SkillsAuditReport {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const dirs = opts.target ? [resolve(opts.target)] : findSkillDirs(cwd);
  const skillsRoot = dirs.length > 0 ? dirnameOfSkillRoot(dirs[0]) : join(cwd, 'skills');
  const skills = dirs.map((dir) => auditSkill(dir, cwd));
  const sum = (field: 'critical' | 'high' | 'medium' | 'low' | 'info') =>
    skills.reduce((total, skill) => total + skill[field], 0);
  return {
    cwd,
    skills_dir: skillsRoot,
    scanned: skills.length,
    critical: sum('critical'),
    high: sum('high'),
    medium: sum('medium'),
    low: sum('low'),
    info: sum('info'),
    skills,
  };
}

function dirnameOfSkillRoot(dir: string): string {
  return dir.replace(/[\\/][^\\/]+$/, '');
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

export function skillsAudit(opts: SkillsAuditOptions): number {
  const report = auditSkills(opts);
  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.critical + (opts.strict ? report.high : 0) > 0 ? 1 : 0;
  }

  console.log(`${c.bold('hackathon skills audit')}  ${c.dim('skills dir: ' + report.skills_dir)}`);
  console.log();
  const widths = [8, 8, 7, 7, 5, 5];
  console.log(
    `  ${pad('skill', 24)}  ${pad('crit', widths[0])}  ${pad('high', widths[1])}  ${pad('med', widths[2])}  ${pad('low', widths[3])}`,
  );
  for (const skill of report.skills) {
    console.log(
      `  ${pad(skill.name, 24)}  ${pad(String(skill.critical), widths[0])}  ${pad(String(skill.high), widths[1])}  ${pad(String(skill.medium), widths[2])}  ${pad(String(skill.low), widths[3])}`,
    );
  }
  console.log();
  console.log(
    `${report.scanned} skills scanned, ${report.critical} critical, ${report.high} high, ${report.medium} medium, ${report.low} low`,
  );

  if (opts.verbose || report.critical + report.high > 0) {
    console.log();
    console.log(c.bold('Details:'));
    for (const skill of report.skills) {
      const relevant = opts.verbose
        ? skill.findings
        : skill.findings.filter(
            (finding) => finding.severity === 'critical' || finding.severity === 'high',
          );
      if (relevant.length === 0) continue;
      console.log();
      console.log(c.bold('  ' + skill.name));
      for (const finding of relevant) {
        const color =
          finding.severity === 'critical'
            ? c.red
            : finding.severity === 'high'
              ? c.yellow
              : finding.severity === 'medium'
                ? c.magenta
                : c.gray;
        console.log(
          `    [${color(finding.severity.toUpperCase())}] ${finding.file}:${finding.line} ${finding.rule} - ${finding.message}`,
        );
      }
    }
  }

  return report.critical + (opts.strict ? report.high : 0) > 0 ? 1 : 0;
}
