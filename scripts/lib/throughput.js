// Concurrent-load measurement: real MCP calls over loopback HTTP against the real server.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../src/infrastructure/server.js';
import { McpClient } from '../../host/client.js';

const round1 = (n) => Math.round(n * 10) / 10;
const LIMIT_MS = 500;

// The knee: the first concurrency where p95 is more than 3x the p95 at the lowest concurrency. null when it never happens.
export function findKnee(levels) {
  const base = levels[0].p95_ms;
  return levels.find((l) => l.p95_ms > 3 * base)?.concurrency ?? null;
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

async function runLevel(baseUrl, concurrency, callsPerLevel) {
  const clients = [];
  for (let i = 0; i < concurrency; i += 1) { const c = new McpClient({ baseUrl }); await c.initialize(); clients.push(c); }
  const times = [];
  let errors = 0;
  let issued = 0;
  const t0 = performance.now();
  await Promise.all(clients.map(async (c) => {
    while (issued < callsPerLevel) {
      const n = issued++;
      const s = performance.now();
      try {
        // Half reads, half real state-changing writes (a new 1-minute block in a free early-morning slot, so every write is valid and persists).
        const r = n % 2 ? await c.callTool('get_next_up', { now: '08:00' }) : await c.callTool('add_block', { title: `load ${n}`, start: hhmm(n / 2), end: hhmm(n / 2 + 1) });
        if (r?.isError) errors += 1;
      } catch { errors += 1; }
      times.push(performance.now() - s);
    }
  }));
  const seconds = (performance.now() - t0) / 1000;
  times.sort((a, b) => a - b);
  const q = (p) => round1(times[Math.min(times.length - 1, Math.floor(p * times.length))]);
  return { concurrency, calls: callsPerLevel, errors, calls_per_second: Math.round(callsPerLevel / seconds), p50_ms: q(0.5), p95_ms: q(0.95), max_ms: round1(times[times.length - 1]) };
}

export async function measureThroughput({ levels = [1, 4, 16, 64, 256], callsPerLevel = 600 } = {}) {
  const out = [];
  // A fresh server and store per level, so one level's added blocks never change the next level's day.
  for (const c of levels) {
    const s = await startServer({ port: 0, storePath: join(mkdtempSync(join(tmpdir(), 'nextone-load-')), 's.json') });
    try { out.push(await runLevel(s.url, c, callsPerLevel)); } finally { await s.close(); }
  }
  const under = out.filter((l) => l.p95_ms < LIMIT_MS && l.errors === 0);
  return {
    limit_ms: LIMIT_MS,
    levels: out,
    peak_calls_per_second: Math.max(...out.map((l) => l.calls_per_second)),
    knee_concurrency: findKnee(out),
    max_concurrency_under_limit: under.length ? Math.max(...under.map((l) => l.concurrency)) : 0,
  };
}
