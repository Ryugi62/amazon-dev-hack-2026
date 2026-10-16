// The bench writes docs/metrics.json, then counts the tests. The doc-consistency tests compare README/description
// with metrics, so the docs must be rebuilt from the new metrics BEFORE counting — otherwise those tests fail and
// the README publishes "98 of 102 passing" (found 2026-10-17 by an independent mock reviewer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('bench rebuilds the docs before it counts the tests, and again after', () => {
  const src = readFileSync(new URL('../scripts/bench.js', import.meta.url), 'utf8');
  const firstBuild = src.indexOf('build-readme.js');
  const count = src.indexOf('metrics.tests = testCount()');
  const lastBuild = src.lastIndexOf('build-readme.js');
  assert.ok(firstBuild > 0 && firstBuild < count, 'docs rebuilt before testCount');
  assert.ok(lastBuild > count, 'docs rebuilt after the final metrics write');
});
