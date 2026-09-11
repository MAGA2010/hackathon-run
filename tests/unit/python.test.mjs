// Unit tests for the shared Python resolver.

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePython, shellPythonCommand } from '../../dist/harness/python.js';

describe('python resolver', () => {
  it('rejects a non-Python executable override instead of trusting exit code', () => {
    const resolved = resolvePython({ PYTHON: process.execPath, PATH: '' });
    assert.equal(resolved, null);
  });

  it('returns null when no candidate is available', () => {
    const resolved = resolvePython({ PYTHON: '', PATH: '' });
    assert.equal(resolved, null);
  });

  it('preserves ordinary command names in shell output', () => {
    assert.equal(
      shellPythonCommand({
        executable: 'python',
        args: [],
        source: 'python',
        version: 'Python 3.12.0',
      }),
      'python',
    );
  });

  it('renders launcher arguments in the shell command', () => {
    assert.equal(
      shellPythonCommand({
        executable: 'py',
        args: ['-3'],
        source: 'py -3',
        version: 'Python 3.12.0',
      }),
      'py -3',
    );
  });

  it('quotes a Windows executable path that contains spaces', () => {
    const previousPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      assert.equal(
        shellPythonCommand({
          executable: 'C:\\Program Files\\Python311\\python.exe',
          args: [],
          source: 'PYTHON',
          version: 'Python 3.11.9',
        }),
        '"/c/Program Files/Python311/python.exe"',
      );
    } finally {
      if (previousPlatform) Object.defineProperty(process, 'platform', previousPlatform);
    }
  });

  it(
    'resolves py -3 when only the Windows launcher is available',
    { skip: process.platform === 'win32' },
    () => {
      const bin = mkdtempSync(join(tmpdir(), 'hs-python-'));
      const launcher = join(bin, 'py');
      writeFileSync(
        launcher,
        '#!/bin/sh\n[ "$1" = "-3" ] || exit 1\n[ "$2" = "--version" ] || exit 1\nprintf "Python 3.12.0\\n"\n',
        'utf8',
      );
      chmodSync(launcher, 0o755);
      try {
        const resolved = resolvePython({ ...process.env, PYTHON: '', PATH: bin });
        assert.deepEqual(resolved, {
          executable: 'py',
          args: ['-3'],
          source: 'py -3',
          version: 'Python 3.12.0',
        });
      } finally {
        rmSync(bin, { recursive: true, force: true });
      }
    },
  );
});
