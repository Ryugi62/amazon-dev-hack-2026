import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLanguage, checkInternalTraces, checkReadmeMatchesMetrics, frictionEntries } from '../scripts/lib/docs-checks.js';

test('docs: every public file is English only (no Hangul)', () => assert.deepEqual(checkLanguage(), []));
test('docs: no internal traces in public files', () => assert.deepEqual(checkInternalTraces(), []));
test('docs: README numbers equal docs/metrics.json (generated, not typed)', () => assert.equal(checkReadmeMatchesMetrics(), true));
test('docs: friction log has at least 5 dated entries', () => assert.ok(frictionEntries() >= 5));
