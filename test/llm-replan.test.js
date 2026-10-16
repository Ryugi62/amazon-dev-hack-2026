import test from 'node:test';
import assert from 'node:assert/strict';
import { caseDays, buildPrompt, parseReplan, scoreReplan, aggregate, nextOneDeferred } from '../scripts/lib/llm-replan.js';
import { replanStats } from '../scripts/lib/replan-stats.js';
import { createBlock } from '../src/domain/schedule.js';

const day = [
  createBlock({ id: 'b0', title: 'Block 0', start: 480, end: 540 }),
  createBlock({ id: 'b1', title: 'Block 1', start: 550, end: 610, fixed: true }),
  createBlock({ id: 'b2', title: 'Block 2', start: 620, end: 680 }),
];

test('caseDays walks the same seeded days as the bench: same count as replanStats when asked for all', () => {
  assert.equal(caseDays(100000).length, replanStats(1000).runs);
  assert.ok(caseDays(30).every((c) => !c.day[0].fixed && c.minutes >= 5 && c.minutes <= 120));
});

test('buildPrompt names the fixed event, the minutes late and the earliest start; leaves no placeholder', () => {
  const p = buildPrompt(day, 40);
  assert.match(p, /b1: 09:10-10:10 Block 1 \(FIXED\)/);
  assert.match(p, /I'm 40 minutes late/);
  assert.match(p, /no earlier than 08:40/);
  assert.doesNotMatch(p, /\{\{/);
});

test('parseReplan reads plain JSON and fenced JSON, refuses prose and bad times', () => {
  const body = '{"blocks":[{"id":"b0","start":"08:40","end":"09:40"}],"dropped":["b2"]}';
  assert.deepEqual(parseReplan(body).placed.b0, { start: 520, end: 580 });
  assert.deepEqual(parseReplan('```json\n' + body + '\n```').dropped, ['b2']);
  assert.equal(parseReplan('Sure! Here is your day.').ok, false);
  assert.equal(parseReplan('{"blocks":[{"id":"b0","start":"8am","end":"9am"}]}').reason, 'bad_time');
  assert.equal(parseReplan('{"x":1}').reason, 'no_blocks');
});

test('scoreReplan counts overlap minutes, moved fixed events and missing blocks', () => {
  // b0 pushed onto the fixed b1 (30 min overlap 550..580), b1 moved, b2 absent
  const p = parseReplan('{"blocks":[{"id":"b0","start":"09:10","end":"10:10"},{"id":"b1","start":"09:40","end":"10:40"}]}');
  const s = scoreReplan(day, p);
  assert.equal(s.overlap_minutes, 30); // b0 550..610 and b1 580..640 share 580..610
  assert.equal(s.fixed_moved, 1);
  assert.equal(s.missing, 1);
});

test('scoreReplan: an overlapping answer, a clean answer, and a dropped fixed event', () => {
  const overl = parseReplan('{"blocks":[{"id":"b0","start":"08:40","end":"09:40"},{"id":"b1","start":"09:10","end":"10:10"}],"dropped":["b2"]}');
  assert.equal(scoreReplan(day, overl).overlap_minutes, 30);
  const ok = parseReplan('{"blocks":[{"id":"b0","start":"08:00","end":"09:00"},{"id":"b1","start":"09:10","end":"10:10"},{"id":"b2","start":"10:20","end":"11:20"}]}');
  assert.deepEqual(scoreReplan(day, ok), { overlap_minutes: 0, fixed_moved: 0, missing: 0, dropped: 0 });
  const lost = parseReplan('{"blocks":[{"id":"b0","start":"08:00","end":"09:00"}],"dropped":["b1","b2"]}');
  const s = scoreReplan(day, lost);
  assert.equal(s.fixed_moved, 1);
  assert.equal(s.dropped, 2);
});

test('aggregate keeps unmeasured and unparseable apart from measured runs', () => {
  const a = aggregate([
    { status: 'scored', overlap_minutes: 20, fixed_moved: 1, missing: 0, dropped: 0 },
    { status: 'scored', overlap_minutes: 0, fixed_moved: 0, missing: 0, dropped: 1 },
    { status: 'scored', overlap_minutes: 40, fixed_moved: 0, missing: 2, dropped: 0 },
    { status: 'unparseable' },
    { status: 'unmeasured' },
  ]);
  assert.deepEqual(a, { attempted: 5, measured: 3, unparseable: 1, unmeasured: 1, overlap_runs: 2, overlap_percent: 66.7, mean_overlap_minutes: 30, fixed_blocks_moved: 1, runs_with_fixed_moved: 1, missing_blocks: 2, runs_with_missing: 1, clean_runs: 1 });
  assert.equal(aggregate([]).measured, 0);
});

test('nextOneDeferred counts the blocks NextOne defers for the same late event', () => {
  assert.equal(nextOneDeferred(day, 40), 0);
});

import { llmReplanMetrics } from '../scripts/lib/llm-metrics.js';
test('llmReplanMetrics pools per-model files, keeps failures apart and runs NextOne on the same days', () => {
  const file = (model, records) => ({ model, date: '2026-10-17', prompt_file: 'scripts/llm-replan-prompt.txt', seed: 2026, records });
  const m = llmReplanMetrics([
    file('model-a', [{ index: 0, status: 'scored', overlap_minutes: 25, fixed_moved: 0, missing: 1, dropped: 0 }, { index: 1, status: 'unmeasured', reason: 'http_503' }]),
    file('model-b', [{ index: 2, status: 'scored', overlap_minutes: 0, fixed_moved: 0, missing: 0, dropped: 0 }]),
  ]);
  assert.equal(m.models, 'model-a, model-b');
  assert.equal(m.attempted, 3);
  assert.equal(m.measured, 2);
  assert.equal(m.unmeasured, 1);
  assert.equal(m.overlap_runs, 1);
  assert.equal(m.distinct_days, 3);
  assert.equal(m.nextone_overlap_runs, 0);
  assert.equal(m.nextone_fixed_blocks_moved, 0);
  assert.equal(m.table_rows.split('\n').length, 2);
  assert.match(m.table_rows, /^\| model-a \| 1 \| 1 \(100%\) \| 25 \|/);
});
