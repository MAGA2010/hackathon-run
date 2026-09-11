/**
 * python.ts - resolve one Python executable for every runtime and test path.
 *
 * The resolver deliberately treats PYTHON as an override, then probes the
 * conventional python3/python commands and the Windows `py -3` launcher.
 * Callers receive the executable plus any launcher arguments that actually
 * passed `--version`, so Windows installations and virtualenvs work without
 * requiring a `python3` alias.
 */
import { spawnSync } from 'node:child_process';

export type PythonSource = 'PYTHON' | 'python3' | 'python' | 'py -3';

export interface PythonResolution {
  executable: string;
  args: string[];
  source: PythonSource;
  version: string;
}

function pythonMajor(version: string): number | null {
  const match = version.match(/\bPython\s+(\d+)(?:\.\d+)?/i);
  if (!match) return null;
  const major = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(major) ? major : null;
}

function probe(
  executable: string,
  args: string[],
  source: PythonSource,
  env: NodeJS.ProcessEnv,
): PythonResolution | null {
  try {
    const result = spawnSync(executable, [...args, '--version'], {
      encoding: 'utf8',
      env,
      timeout: 5000,
      windowsHide: true,
    });
    if (result.status !== 0) return null;
    const version = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    if (pythonMajor(version) !== 3) return null;
    return { executable, args, source, version };
  } catch {
    return null;
  }
}

/** Resolve the first working Python command using the shared priority order. */
export function resolvePython(env: NodeJS.ProcessEnv = process.env): PythonResolution | null {
  const override = env.PYTHON?.trim();
  const candidates: Array<{ executable: string; args: string[]; source: PythonSource }> = [];
  if (override) candidates.push({ executable: override, args: [], source: 'PYTHON' });
  candidates.push(
    { executable: 'python3', args: [], source: 'python3' },
    { executable: 'python', args: [], source: 'python' },
    { executable: 'py', args: ['-3'], source: 'py -3' },
  );

  for (const candidate of candidates) {
    const resolved = probe(candidate.executable, candidate.args, candidate.source, env);
    if (resolved) return resolved;
  }
  return null;
}

/** Resolve Python or throw an actionable, platform-neutral error. */
export function requirePython(env: NodeJS.ProcessEnv = process.env): PythonResolution {
  const resolved = resolvePython(env);
  if (resolved) return resolved;
  throw new Error(
    'Python 3 was not found. Set PYTHON to a Python executable or install python3/python/py and retry.',
  );
}

/**
 * Print a command suitable for a POSIX shell launched by Git Bash/WSL.
 * Bash accepts MSYS-style `/c/...` paths more reliably than `C:\\...` paths
 * when the executable came from an absolute Windows PYTHON override.
 */
export function shellPythonCommand(resolution: PythonResolution): string {
  const executable = resolution.executable;
  const launcherArgs = resolution.args.map(shellQuote).join(' ');
  const command =
    process.platform === 'win32' && /^[A-Za-z]:[\\/]/.test(executable)
      ? `/${executable[0]?.toLowerCase()}${executable.slice(2).replaceAll('\\', '/')}`
      : executable;
  return [shellQuote(command), launcherArgs].filter(Boolean).join(' ');
}

function shellQuote(value: string): string {
  if (/^[\w./:+-]+$/.test(value)) return value;
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}
