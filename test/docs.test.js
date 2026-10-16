import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
import { checkLanguage, checkInternalTraces, checkReadmeMatchesMetrics, frictionEntries } from '../scripts/lib/docs-checks.js';

test('docs: every public file is English only (no Hangul)', () => assert.deepEqual(checkLanguage(), []));
test('docs: no internal traces in public files', () => assert.deepEqual(checkInternalTraces(), []));
test('docs: README numbers equal docs/metrics.json (generated, not typed)', () => assert.equal(checkReadmeMatchesMetrics(), true));
test('docs: friction log has at least 5 dated entries', () => assert.ok(frictionEntries() >= 5));

import { checkUnrenderedPlaceholders } from '../scripts/lib/docs-checks.js';
import { renderReadme } from '../scripts/build-readme.js';
test('docs: no unrendered {{placeholder}} in any public file', () => assert.deepEqual(checkUnrenderedPlaceholders(), []));
test('docs: the renderer handles metric names with digits (p50_ms)', () => assert.doesNotMatch(renderReadme(), /\{\{/));
test('docs: README explains why 1000 seeded days give fewer counted runs', () => {
  assert.match(read('README.md'), /1000 seeded days[^\n]*skips[^\n]*fixed/i);
});

import { PUBLIC_FILES } from '../scripts/lib/docs-checks.js';
test('docs: no unsourced claim that participants cannot reach Alexa+', () => {
  for (const f of PUBLIC_FILES) assert.doesNotMatch(read(f), /participants (cannot|can ?not|have no)|no access to alexa/i, f);
});
test('docs: README and SPEC quote the rules sentence that allows a simulated Alexa+ experience, with its URL', () => {
  for (const f of ['README.md', 'SPEC.md']) {
    const t = read(f);
    assert.match(t, /Alternatively, entrants may submit a simulated Alexa\+ experience/, f);
    assert.match(t, /amazonappdev2026\.devpost\.com\/rules/, f);
  }
});
test('docs: every README / SPEC line with "500 ms" or "2025-11-25" carries a source URL or says unverified', () => {
  for (const f of ['README.md', 'SPEC.md']) {
    for (const line of read(f).split('\n').filter((l) => /500 ms|2025-11-25/.test(l))) {
      assert.match(line, /https:\/\/|unverified/, `${f}: ${line.slice(0, 80)}`);
    }
  }
});
