import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_FILES } from '../scripts/lib/docs-checks.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const metrics = JSON.parse(read('docs/metrics.json'));
const d = read('docs/description.md');
const metricSentence = /\*\*Overlap minutes after a late event\*\* = [^\n]+/.exec(read('README.md'))[0];

test('the description is covered by the public-file checks (English only, no internal traces)', () => {
  assert.ok(PUBLIC_FILES.includes('docs/description.md'));
});

test('the description gives all four judging criteria their own heading', () => {
  for (const h of ['Technical Implementation', 'Design', 'Potential Impact', 'Quality of the Idea']) {
    assert.match(d, new RegExp(`^## ${h}`, 'm'), h);
  }
});

test('numbers quoted in the description equal docs/metrics.json', () => {
  const r = metrics.replan;
  for (const n of [r.runs, r.baseline_overlap_runs, `${r.baseline_overlap_percent}%`, r.baseline_mean_overlap_minutes, `${metrics.tests.tests} tests`]) {
    assert.ok(d.includes(String(n)), `missing ${n}`);
  }
});

test('the metric definition sentence is identical to the README', () => {
  assert.ok(d.includes(metricSentence));
});

test('the description compares with at least three existing options by name and URL, Amazon first-party included', () => {
  const rows = d.split('\n').filter((l) => /^\| .*https?:\/\//.test(l));
  assert.ok(rows.length >= 3, `rows ${rows.length}`);
  assert.ok(rows.some((l) => /amazon\.com|aboutamazon\.com/.test(l)));
});

test('the description states the simulation and names the Creative example it matches', () => {
  assert.match(d, /simulated/i);
  assert.match(d, /maintains state across sessions/);
  assert.match(d, /basic MCP wrapper around an existing API/);
});

test('the description has a USD estimate with its formula and a milestone table with dates', () => {
  assert.match(d, /\$\d+(\.\d+)? per/);
  assert.ok(d.split('\n').filter((l) => /^\| 20\d\d-\d\d-\d\d/.test(l)).length >= 3);
});

test('the comparison with what Alexa+ already does sits right under "What only NextOne has", inside the first two pages', () => {
  const only = d.indexOf('**What only NextOne has');
  const heading = d.indexOf('Versus what Alexa+ already does');
  assert.ok(only >= 0 && heading > only, 'comparison must follow the one-line claim');
  assert.ok(d.slice(only, heading).split('\n').filter((l) => /^#{1,3} /.test(l)).length <= 1, 'at most one heading between the claim and the comparison');
  assert.ok(heading < 6000, `comparison starts at char ${heading}, two pages is about 6000`);
  const rows = d.slice(heading).split('\n').filter((l) => /^\| .*https?:\/\//.test(l));
  assert.ok(rows.length >= 3);
  assert.match(d.slice(heading, heading + 4000), /Host LLM default capability/);
});

test('the round-trip line in the description equals metrics.json', () => {
  const l = metrics.latency;
  assert.ok(d.includes(`${l.p50_ms} ms p50 and ${l.p95_ms} ms p95 over ${l.calls} calls`));
});

test('the description quotes the generated throughput numbers', () => {
  const t = metrics.throughput;
  assert.ok(d.includes(`${t.peak_calls_per_second} calls per second`));
  assert.ok(d.includes(`concurrency ${t.knee_concurrency}`));
});
