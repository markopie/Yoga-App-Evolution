'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const hook = process.argv[2] || 'pre-commit';
const root = path.resolve(__dirname, '..');
const hookPath = path.join(root, '.githooks', hook);

if (!fs.existsSync(hookPath)) {
    console.error(`Hook not found: ${hookPath}`);
    process.exit(1);
}

const candidates = [
    process.env.BASH,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe') : null,
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe') : null,
    'bash',
].filter(Boolean);

for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;

    const result = spawnSync(candidate, [hookPath], {
        cwd: root,
        env: {
            ...process.env,
            PYTHONUTF8: '1',
            PYTHONIOENCODING: 'utf-8',
        },
        stdio: 'inherit',
    });

    if (result.error) continue;
    process.exit(result.status ?? 1);
}

console.error('Could not find a usable bash. Install Git for Windows or set BASH to a bash executable.');
process.exit(1);
