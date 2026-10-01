#!/usr/bin/env node
/**
 * Generates THIRD_PARTY_NOTICES.md — a consolidated attribution file for every
 * PRODUCTION dependency that ships in a built app binary.
 *
 * Usage:  npm run licenses:generate
 *
 * Strategy (no third-party tooling required):
 *   1. Ask npm for the resolved production tree: `npm ls --omit=dev --all --json`.
 *   2. Walk node_modules to locate each package on disk (handles hoisting and
 *      nested duplicates) so the correct license file is read per version.
 *   3. Emit a summary table plus deduplicated license texts.
 *
 * The output is generated — do not edit it by hand; re-run the script instead.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NODE_MODULES = join(ROOT, 'node_modules');
const OUTPUT = join(ROOT, 'THIRD_PARTY_NOTICES.md');

const LICENSE_FILE_CANDIDATES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.markdown',
  'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'LICENSE-MIT', 'LICENSE-APACHE', 'COPYING', 'COPYING.md', 'COPYING.txt',
];

function readProdTree() {
  let stdout = '';
  try {
    stdout = execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // npm exits non-zero on peer/optional issues but still prints the tree.
    stdout = error.stdout ? error.stdout.toString() : '';
    if (!stdout) throw error;
  }
  return JSON.parse(stdout);
}

function collectProdDeps(tree) {
  const found = new Map(); // "name@version" -> { name, version }
  const walk = (node) => {
    const deps = node && node.dependencies ? node.dependencies : {};
    for (const [name, info] of Object.entries(deps)) {
      if (!info || !info.version) continue;
      const key = `${name}@${info.version}`;
      if (!found.has(key)) found.set(key, { name, version: info.version });
      walk(info);
    }
  };
  walk(tree);
  return found;
}

// Index every installed package directory by "name@version".
function indexInstalledPackages() {
  const index = new Map(); // "name@version" -> absolute dir
  const scanPackage = (pkgDir) => {
    const pkgJsonPath = join(pkgDir, 'package.json');
    if (existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        if (pkg.name && pkg.version) {
          const key = `${pkg.name}@${pkg.version}`;
          if (!index.has(key)) index.set(key, pkgDir);
        }
      } catch {
        // ignore malformed package.json
      }
    }
    const nested = join(pkgDir, 'node_modules');
    if (existsSync(nested)) scanDir(nested);
  };
  const scanDir = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.bin') continue;
      if (entry.name.startsWith('@')) {
        const scopeDir = join(dir, entry.name);
        for (const sub of readdirSync(scopeDir, { withFileTypes: true })) {
          if (sub.isDirectory()) scanPackage(join(scopeDir, sub.name));
        }
      } else {
        scanPackage(join(dir, entry.name));
      }
    }
  };
  scanDir(NODE_MODULES);
  return index;
}

function normalizeLicense(pkg) {
  if (typeof pkg.license === 'string' && pkg.license.trim()) return pkg.license.trim();
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    const parts = pkg.licenses
      .map((l) => (typeof l === 'string' ? l : l && l.type))
      .filter(Boolean);
    if (parts.length) return parts.join(' OR ');
  }
  return null;
}

function normalizeRepo(pkg) {
  const repo = pkg.repository;
  if (!repo) return null;
  const url = typeof repo === 'string' ? repo : repo.url;
  if (!url) return null;
  if (url.startsWith('github:')) return `https://github.com/${url.slice('github:'.length)}`;
  return url.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '');
}

function findLicenseText(pkgDir) {
  for (const candidate of LICENSE_FILE_CANDIDATES) {
    const p = join(pkgDir, candidate);
    if (existsSync(p)) {
      try {
        const text = readFileSync(p, 'utf8').trim();
        if (text) return text;
      } catch {
        // ignore unreadable file
      }
    }
  }
  return null;
}

function main() {
  const prod = collectProdDeps(readProdTree());
  const installed = indexInstalledPackages();

  const records = [];
  const missing = [];
  for (const { name, version } of prod.values()) {
    const dir = installed.get(`${name}@${version}`);
    if (!dir) {
      missing.push(`${name}@${version}`);
      continue;
    }
    let pkg = {};
    try {
      pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch {
      // fall back to empty metadata
    }
    records.push({
      name,
      version,
      license: normalizeLicense(pkg) || 'UNKNOWN',
      repository: normalizeRepo(pkg) || '',
      text: findLicenseText(dir),
    });
  }

  records.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

  // Group packages that ship byte-identical license texts.
  const textGroups = new Map();
  for (const r of records) {
    if (!r.text) continue;
    const key = `${r.license}\n${r.text}`;
    if (!textGroups.has(key)) textGroups.set(key, { license: r.license, text: r.text, packages: [] });
    textGroups.get(key).packages.push(`${r.name}@${r.version}`);
  }
  const groups = [...textGroups.values()].sort((a, b) => a.license.localeCompare(b.license));

  const lines = [];
  lines.push('# Third-Party Notices');
  lines.push('');
  lines.push('This project bundles third-party open-source software. The list below covers the');
  lines.push('**production** dependencies shipped in a built app binary, together with their');
  lines.push('licenses and, where the package provides one, the full license text.');
  lines.push('');
  lines.push('> This file is generated. Do not edit it by hand — regenerate with');
  lines.push('> `npm run licenses:generate`.');
  lines.push('');
  lines.push(`Total: **${records.length} packages**, ${groups.length} unique license texts.`);
  lines.push('');
  lines.push('## Dependencies');
  lines.push('');
  lines.push('| Package | Version | License | Repository |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of records) {
    const repo = r.repository ? `[link](${r.repository})` : '—';
    lines.push(`| ${r.name} | ${r.version} | ${r.license} | ${repo} |`);
  }
  lines.push('');

  lines.push('## License texts');
  lines.push('');
  for (const group of groups) {
    lines.push(`### ${group.license}`);
    lines.push('');
    lines.push(`Applies to: ${group.packages.sort().map((p) => `\`${p}\``).join(', ')}`);
    lines.push('');
    lines.push('```');
    lines.push(group.text);
    lines.push('```');
    lines.push('');
  }

  const noText = records.filter((r) => !r.text);
  if (noText.length) {
    lines.push('## Packages without a bundled license file');
    lines.push('');
    lines.push('These declare a license but ship no license text — verify manually before distribution:');
    lines.push('');
    for (const r of noText) lines.push(`- ${r.name}@${r.version} — ${r.license}`);
    lines.push('');
  }

  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(
    `Wrote ${relative(ROOT, OUTPUT)} (${records.length} packages, ${groups.length} unique license texts).`,
  );
  if (noText.length) {
    console.warn(`Note: ${noText.length} package(s) ship no license text (listed at the end of the file).`);
  }
  if (missing.length) {
    console.warn(`Warning: ${missing.length} package(s) not found on disk: ${missing.join(', ')}`);
  }
}

main();
