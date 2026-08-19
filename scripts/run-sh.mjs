#!/usr/bin/env node
// scripts/run-sh.mjs - locate bash and run a script (test scripts are bash on POSIX).
// On Linux/macOS: just use `bash` from PATH.
// On Windows: probe common Git for Windows install locations; give a clear error if missing.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

function findBash() {
    if (process.platform !== "win32") return "bash";
    const candidates = [
        "C:\\Program Files\\Git\\bin\\bash.exe",
        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        "C:\\Program Files\\GitForWindows\\bin\\bash.exe",
    ];
    for (const c of candidates) {
        if (existsSync(c)) return c;
    }
    return null;
}

const script = process.argv[2];
const args = process.argv.slice(3);
if (!script) {
    console.error("usage: node scripts/run-sh.mjs <test-script> [args...]");
    process.exit(2);
}

const bash = findBash();
if (!bash) {
    console.error("[ERR] bash not found on this Windows machine.");
    console.error("      Install Git for Windows (https://git-scm.com/download/win)");
    console.error("      or use WSL, then retry: npm test");
    process.exit(127);
}

const child = spawn(bash, [script, ...args], { stdio: "inherit", shell: false });
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
    console.error(`[ERR] failed to launch ${bash}: ${err.message}`);
    process.exit(127);
});