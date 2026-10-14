#!/usr/bin/env node
// Builds the root CHANGELOG.md entry for a release from the per-package
// CHANGELOG.md files that `pnpm version -r` writes.
//
//   node scripts/changelog-root.mjs [version] [--root DIR]
//
// version defaults to packages/router/package.json. Idempotent: if the root
// changelog already has a `## <version>` section it is left as is (so hand
// edits survive) and only the release markers are moved onto it.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const START = '<!-- release:start -->';
export const END = '<!-- release:end -->';

const GROUPS = [
  ['Major Changes', 'Breaking'],
  ['Minor Changes', 'Features'],
  ['Patch Changes', 'Fixes'],
];

// Bullets of one package changelog for `version`, as { kind, text }.
export function parsePackageChangelog(md, version) {
  const lines = md.split('\n');
  const name = (lines[0] || '').replace(/^#\s+/, '').trim();
  const out = [];
  let inVersion = false;
  let kind = null;
  let cur = null;
  const flush = () => {
    if (cur !== null && kind !== null) {
      const text = cur.join(' ').replace(/\s+/g, ' ').trim();
      if (text !== '' && !text.startsWith('Updated dependencies')) out.push({ kind, text });
    }
    cur = null;
  };
  for (const line of lines.slice(1)) {
    if (line.startsWith('## ')) {
      flush();
      inVersion = line.slice(3).trim() === version;
      kind = null;
    } else if (!inVersion) {
      continue;
    } else if (line.startsWith('### ')) {
      flush();
      kind = line.slice(4).trim();
    } else if (line.startsWith('- ')) {
      flush();
      cur = [line.slice(2)];
    } else if (cur !== null && /^\s+\S/.test(line)) {
      cur.push(line.trim());
    } else if (line.trim() === '') {
      // blank lines separate bullets; a bullet ends at the next bullet or heading
    }
  }
  flush();
  return { name, bullets: out };
}

// Group bullets by change class, merging identical text across packages.
export function buildEntry(version, packages) {
  const sections = [];
  for (const [heading, title] of GROUPS) {
    const byText = [];
    for (const pkg of packages) {
      for (const b of pkg.bullets) {
        if (b.kind !== heading) continue;
        let hit = null;
        for (const e of byText) if (e.text === b.text) hit = e;
        if (hit === null) byText.push({ text: b.text, names: [pkg.name] });
        else if (!hit.names.includes(pkg.name)) hit.names.push(pkg.name);
      }
    }
    if (byText.length === 0) continue;
    const items = byText.map((e) => `- **${e.names.join(', ')}:** ${e.text}`);
    sections.push(`### ${title}\n\n${items.join('\n')}`);
  }
  return `## ${version}\n\n${sections.join('\n\n')}\n`;
}

function stripMarkers(md) {
  return md
    .split('\n')
    .filter((l) => l.trim() !== START && l.trim() !== END)
    .join('\n');
}

// Insert (or re-mark) the entry for `version` in the root changelog text.
export function applyEntry(rootMd, version, entry) {
  const md = stripMarkers(rootMd);
  const lines = md.split('\n');
  const heading = `## ${version}`;
  let start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) {
    // first release heading after "## Unreleased"
    const unreleased = lines.findIndex((l) => l.trim() === '## Unreleased');
    if (unreleased === -1) throw new Error('root CHANGELOG.md has no "## Unreleased" heading');
    let at = lines.length;
    for (let i = unreleased + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        at = i;
        break;
      }
    }
    lines.splice(at, 0, ...entry.split('\n'));
    start = at;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  lines.splice(end, 0, END);
  lines.splice(start, 0, START);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
}

function main(argv) {
  let root = fileURLToPath(new URL('..', import.meta.url));
  let version = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = argv[++i];
    else version = argv[i];
  }
  if (version === null) {
    version = JSON.parse(readFileSync(join(root, 'packages/router/package.json'), 'utf8')).version;
  }
  const pkgDir = join(root, 'packages');
  const packages = [];
  for (const d of readdirSync(pkgDir).sort()) {
    const f = join(pkgDir, d, 'CHANGELOG.md');
    if (existsSync(f)) packages.push(parsePackageChangelog(readFileSync(f, 'utf8'), version));
  }
  const rootFile = join(root, 'CHANGELOG.md');
  const current = readFileSync(rootFile, 'utf8');
  const hasEntry = stripMarkers(current).split('\n').some((l) => l.trim() === `## ${version}`);
  if (!hasEntry && packages.every((p) => p.bullets.length === 0)) {
    throw new Error(`no changelog entries found for ${version} under ${pkgDir}`);
  }
  writeFileSync(rootFile, applyEntry(current, version, buildEntry(version, packages)));
  console.log(`${rootFile}: ${hasEntry ? 'kept existing' : 'wrote'} entry for ${version}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
