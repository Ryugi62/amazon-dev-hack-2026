import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replanStats } from '../scripts/lib/replan-stats.js';

const metrics = JSON.parse(readFileSync(new URL('../docs/metrics.json', import.meta.url), 'utf8'));

test('replanStats reports the mean overlap the shift-only baseline leaves, in minutes', () => {
  const s = replanStats(1000);
  assert.equal(typeof s.baseline_mean_overlap_minutes, 'number');
  assert.ok(s.baseline_mean_overlap_minutes > 0);
  assert.equal(s.nextone_overlap_runs, 0);
});

test('docs/metrics.json carries the same replan numbers as a fresh run', () => {
  const s = replanStats(1000);
  assert.deepEqual(metrics.replan, s);
});
