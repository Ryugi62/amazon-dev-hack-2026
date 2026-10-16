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
  assert.match(read('README.md'), /1000 seeded days[^\n]*skipped[^\n]*fixed/i);
});
