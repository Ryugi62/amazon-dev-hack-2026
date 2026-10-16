// Measures the numbers the README quotes and writes docs/metrics.json. Nothing in the README is typed by hand.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runLate, overlapMinutes } from '../src/domain/schedule.js';
import { randomDay, naiveShift, mulberry32 } from './lib/sim.js';
import { startServer } from '../src/infrastructure/server.js';
import { McpClient } from '../host/client.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function replanStats(runs = 1000) {
  const rnd = mulberry32(2026);
  let n = 0, nextOneOverlapRuns = 0, baselineOverlapRuns = 0, fixedMoved = 0, usable = 0;
  for (let i = 0; i < runs; i += 1) {
    const day = randomDay(rnd);
    const minutes = 5 + Math.floor(rnd() * 116);
    if (day[0].fixed) continue;
    n += 1;
    const r = runLate(day, day[0].start, minutes);
    usable += 1;
    if (overlapMinutes(r.blocks) > 0) nextOneOverlapRuns += 1;
    for (const f of day.filter((b) => b.fixed)) {
      const a = r.blocks.find((b) => b.id === f.id);
      if (a.start !== f.start || a.end !== f.end) fixedMoved += 1;
    }
    if (overlapMinutes(naiveShift(day, minutes)) > 0) baselineOverlapRuns += 1;
  }
  return {
    runs: n,
    nextone_overlap_runs: nextOneOverlapRuns,
    baseline_overlap_runs: baselineOverlapRuns,
    baseline_overlap_percent: Math.round((1000 * baselineOverlapRuns) / n) / 10,
    fixed_blocks_moved: fixedMoved,
  };
}

async function latency(calls = 200) {
  const s = await startServer({ port: 0, storePath: join(mkdtempSync(join(tmpdir(), 'nextone-bench-')), 's.json') });
  try {
    const c = new McpClient({ baseUrl: s.url });
    await c.initialize();
    const times = [];
    for (let i = 0; i < calls; i += 1) {
      const t0 = performance.now();
      await c.callTool(i % 2 ? 'get_next_up' : 'report_running_late', i % 2 ? { now: '08:00' } : { minutes: 5, now: '08:00' });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const q = (p) => Math.round(times[Math.min(times.length - 1, Math.floor(p * times.length))] * 10) / 10;
    return { calls, p50_ms: q(0.5), p95_ms: q(0.95), max_ms: Math.round(times[times.length - 1] * 10) / 10, limit_ms: 500 };
  } finally { await s.close(); }
}

function testCount() {
  const out = spawnSync('sh', ['-c', 'node --test test/*.test.js 2>&1'], { cwd: root, encoding: 'utf8' }).stdout;
  const get = (k) => Number(new RegExp(`ℹ ${k} (\\d+)`).exec(out)?.[1] ?? NaN);
  return { tests: get('tests'), passed: get('pass'), failed: get('fail') };
}

const metrics = { generated_by: 'scripts/bench.js', replan: replanStats(), latency: await latency(), tests: testCount() };
writeFileSync(join(root, 'docs', 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
console.log(JSON.stringify(metrics, null, 2));
