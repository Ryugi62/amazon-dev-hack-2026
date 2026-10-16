import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measureThroughput, findKnee } from '../scripts/lib/throughput.js';

const metrics = JSON.parse(readFileSync(new URL('../docs/metrics.json', import.meta.url), 'utf8'));

test('findKnee returns the first concurrency whose p95 is more than 3x the p95 at concurrency 1', () => {
  const levels = [
    { concurrency: 1, p95_ms: 2 }, { concurrency: 4, p95_ms: 4 },
    { concurrency: 16, p95_ms: 7 }, { concurrency: 64, p95_ms: 30 },
  ];
  assert.equal(findKnee(levels), 16);
  assert.equal(findKnee(levels.slice(0, 2)), null);
});

test('measureThroughput runs real concurrent MCP calls against a real server and reports per level numbers', async () => {
  const r = await measureThroughput({ levels: [1, 4], callsPerLevel: 40 });
  assert.equal(r.levels.length, 2);
  for (const l of r.levels) {
    assert.equal(l.errors, 0);
    assert.equal(l.calls, 40);
    assert.ok(l.calls_per_second > 0 && l.p95_ms >= l.p50_ms && l.p50_ms > 0);
  }
  assert.ok(r.peak_calls_per_second >= Math.max(...r.levels.map((l) => l.calls_per_second)) - 1);
});

test('metrics.json carries the throughput limit: peak calls/s, the concurrency where p95 more than triples, and the 500 ms limit check', () => {
  const t = metrics.throughput;
  assert.ok(t.levels.length >= 4);
  assert.equal(typeof t.peak_calls_per_second, 'number');
  assert.ok(t.knee_concurrency === null || typeof t.knee_concurrency === 'number');
  assert.equal(typeof t.max_concurrency_under_limit, 'number');
  assert.equal(t.limit_ms, 500);
  assert.ok(t.levels.every((l) => l.errors === 0));
});

test('README reports the throughput numbers from metrics.json', () => {
  const r = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(r.includes(`${metrics.throughput.peak_calls_per_second} calls per second`));
});
