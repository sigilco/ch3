import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePackageChangelog, buildEntry, applyEntry, START, END } from './changelog-root.mjs';

const ws = `# @chttp/ws

## 0.2.0

### Minor Changes

- Add ws

- shared note

### Patch Changes

- Updated dependencies:
  - @chttp/router@0.2.0

## 0.1.0

### Minor Changes

- old
`;
const router = `# @chttp/router

## 0.2.0

### Minor Changes

- shared note

### Patch Changes

- fix a thing
  over two lines
`;

const packages = [parsePackageChangelog(ws, '0.2.0'), parsePackageChangelog(router, '0.2.0')];

test('parse drops dependency noise and other versions', () => {
  assert.deepEqual(packages[0].bullets, [
    { kind: 'Minor Changes', text: 'Add ws' },
    { kind: 'Minor Changes', text: 'shared note' },
  ]);
  assert.equal(packages[1].bullets[1].text, 'fix a thing over two lines');
});

test('entry groups, dedupes and names packages', () => {
  assert.equal(
    buildEntry('0.2.0', packages),
    [
      '## 0.2.0',
      '',
      '### Features',
      '',
      '- **@chttp/ws:** Add ws',
      '- **@chttp/ws, @chttp/router:** shared note',
      '',
      '### Fixes',
      '',
      '- **@chttp/router:** fix a thing over two lines',
      '',
    ].join('\n'),
  );
});

const seed = `# Changelog

## Unreleased

## 0.1.0

initial
`;

test('apply inserts under Unreleased and wraps in markers', () => {
  const out = applyEntry(seed, '0.2.0', buildEntry('0.2.0', packages));
  const lines = out.split('\n');
  assert.ok(lines.indexOf('## Unreleased') < lines.indexOf(START));
  assert.ok(lines.indexOf(START) < lines.indexOf('## 0.2.0'));
  assert.ok(lines.indexOf(END) < lines.indexOf('## 0.1.0'));
  assert.equal(out.split(START).length, 2);
});

test('apply is idempotent and keeps hand edits', () => {
  const once = applyEntry(seed, '0.2.0', buildEntry('0.2.0', packages));
  const edited = once.replace('Add ws', 'Add websockets');
  const twice = applyEntry(edited, '0.2.0', buildEntry('0.2.0', packages));
  assert.equal(twice, edited);
  assert.equal(applyEntry(once, '0.2.0', buildEntry('0.2.0', packages)), once);
});

test('markers move to the newest entry', () => {
  const v2 = applyEntry(seed, '0.2.0', buildEntry('0.2.0', packages));
  const v3 = applyEntry(v2, '0.3.0', buildEntry('0.3.0', packages));
  assert.equal(v3.split(START).length, 2);
  const lines = v3.split('\n');
  assert.ok(lines.indexOf(START) < lines.indexOf('## 0.3.0'));
  assert.ok(lines.indexOf(END) < lines.indexOf('## 0.2.0'));
});
