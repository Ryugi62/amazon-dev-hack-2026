// Measures the numbers the README quotes and writes docs/metrics.json. Nothing in the README is typed by hand.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { replanStats } from './lib/replan-stats.js';
import { measureThroughput } from './lib/throughput.js';
import { startServer } from '../src/infrastructure/server.js';
import { McpClient } from '../host/client.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const metrics = { generated_by: 'scripts/bench.js', replan: replanStats(), latency: await latency(), throughput: await measureThroughput(), tests: { tests: 0, passed: 0, failed: 0 } };
// The tests read docs/metrics.json, so write the measured numbers first, then count the tests against them.
writeFileSync(join(root, 'docs', 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
const rebuildDocs = () => spawnSync('node', [join(root, 'scripts', 'build-readme.js')], { cwd: root, encoding: 'utf8' });
rebuildDocs(); // the doc-consistency tests compare the docs with the new metrics, so rebuild before counting
metrics.tests = testCount();
writeFileSync(join(root, 'docs', 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
rebuildDocs(); // the test count itself appears in the docs (scripts/build-readme.js)
console.log(JSON.stringify(metrics, null, 2));
