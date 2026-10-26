// Writes src-tauri/THIRD-PARTY-NOTICES.txt: the licence of every library that ships inside the app.
// JavaScript packages come from node_modules (production dependencies only). Rust crates come from
// src-tauri/rust-licenses.txt, which the release workflow generates with cargo-about; when that file
// is missing (a local build without cargo-about) only the JavaScript part is written.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'src-tauri', 'THIRD-PARTY-NOTICES.txt');
const rustLicenses = path.join(root, 'src-tauri', 'rust-licenses.txt');
const rule = '='.repeat(78);

// Every production package, including nested ones, once per name@version.
const tree = JSON.parse(execSync('npm ls --omit=dev --all --json --long', { cwd: root, maxBuffer: 64 << 20 }).toString());
const packages = new Map();
(function walk(deps) {
  for (const dep of Object.values(deps ?? {})) {
    if (dep.path && dep.version && !packages.has(`${dep.name}@${dep.version}`)) packages.set(`${dep.name}@${dep.version}`, dep);
    walk(dep.dependencies);
  }
})(tree.dependencies);

const noticeFiles = (dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => /^(licen[cs]e|copying|notice)(\.|-|$)/i.test(f))
    .sort((a, b) => Number(/notice/i.test(a)) - Number(/notice/i.test(b)));

const sections = [...packages.values()]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((pkg) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(pkg.path, 'package.json'), 'utf8'));
    // jszip is dual-licensed; FilmOrganizer uses it under the MIT option.
    const license = pkg.name === 'jszip' ? 'MIT (chosen from "MIT OR GPL-3.0-or-later")' : (manifest.license ?? 'not stated by the package');
    const texts = noticeFiles(pkg.path).map((f) => fs.readFileSync(path.join(pkg.path, f), 'utf8').trim());
    return [
      `${pkg.name} ${pkg.version}`,
      `License: ${license}`,
      typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url,
      '',
      texts.length ? texts.join('\n\n') : 'The published package includes no licence file.',
    ]
      .filter((line) => line !== undefined)
      .join('\n');
  });

const parts = [
  'FilmOrganizer includes the open-source software listed below. Each is used under its own licence,',
  'reproduced here. FilmOrganizer itself is released under the MIT licence (see LICENSE).',
  '',
  rule,
  'JAVASCRIPT PACKAGES',
  rule,
  sections.join(`\n\n${'-'.repeat(78)}\n\n`),
];
if (fs.existsSync(rustLicenses)) parts.push('', rule, 'RUST CRATES', rule, fs.readFileSync(rustLicenses, 'utf8').trim());
else console.warn('third-party-notices: src-tauri/rust-licenses.txt not found, writing JavaScript packages only');

fs.writeFileSync(out, parts.join('\n') + '\n');
console.log(`third-party-notices: ${packages.size} JavaScript packages${fs.existsSync(rustLicenses) ? ' and the Rust crates' : ''} -> ${path.relative(root, out)}`);
