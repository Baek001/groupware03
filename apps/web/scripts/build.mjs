import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const ASCII_ALIAS_ENV = 'STARWORKS_BUILD_ASCII_ALIAS';

function containsNonAscii(value) {
  return /[^\x00-\x7F]/.test(value);
}

function normalizeWinPath(value) {
  return path.win32.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

function listSubstMappings() {
  const result = spawnSync('subst.exe', [], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0 || !result.stdout) {
    return new Map();
  }

  const mappings = new Map();
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^([A-Z]):\\:\s*=>\s*(.+)$/i);
    if (!match) {
      continue;
    }

    mappings.set(match[1].toUpperCase(), normalizeWinPath(match[2]));
  }

  return mappings;
}

function resolveAsciiAlias(projectRoot) {
  const normalizedProjectRoot = normalizeWinPath(projectRoot);
  const mappings = listSubstMappings();

  for (const [letter, target] of mappings) {
    if (target === normalizedProjectRoot) {
      return {
        driveLetter: letter,
        created: false,
      };
    }
  }

  for (const letter of 'ZYXWVUTSRQPONMLKJIHGFEDCBA') {
    if (!mappings.has(letter) && !existsSync(`${letter}:\\`)) {
      return {
        driveLetter: letter,
        created: true,
      };
    }
  }

  throw new Error('No available drive letter for temporary build alias.');
}

function runCommand(file, args) {
  const result = spawnSync(file, args, {
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${file} ${args.join(' ')}`);
  }
}

async function runBuildFromAsciiAlias() {
  const projectRoot = process.cwd();
  const { driveLetter, created } = resolveAsciiAlias(projectRoot);
  const aliasRoot = `${driveLetter}:\\`;
  const aliasScript = path.win32.join(aliasRoot, 'scripts', 'build.mjs');

  if (created) {
    runCommand('subst.exe', [`${driveLetter}:`, projectRoot]);
  }

  try {
    const result = spawnSync(process.execPath, [aliasScript], {
      cwd: aliasRoot,
      env: {
        ...process.env,
        [ASCII_ALIAS_ENV]: '1',
      },
      stdio: 'inherit',
      windowsHide: true,
    });

    process.exit(result.status ?? 1);
  } finally {
    if (created) {
      spawnSync('subst.exe', [`${driveLetter}:`, '/d'], {
        stdio: 'inherit',
        windowsHide: true,
      });
    }
  }
}

if (process.platform === 'win32' && containsNonAscii(process.cwd()) && process.env[ASCII_ALIAS_ENV] !== '1') {
  await runBuildFromAsciiAlias();
}

const projectRoot = process.cwd().replace(/\\/g, '/');

await build({
  root: projectRoot,
  resolve: {
    preserveSymlinks: true,
  },
  plugins: [react()],
});
