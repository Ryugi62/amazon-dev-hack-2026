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
