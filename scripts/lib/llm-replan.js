import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runLate, overlapMinutes } from '../../src/domain/schedule.js';
import { formatHHMM, parseHHMM } from '../../src/domain/time.js';
import { randomDay, mulberry32 } from './sim.js';

export const PROMPT_FILE = 'scripts/llm-replan-prompt.txt';
const template = () => readFileSync(fileURLToPath(new URL('../llm-replan-prompt.txt', import.meta.url)), 'utf8');

// The same seeded days, in the same order, as replanStats: seed 2026, a day then a lateness per iteration,
// days whose first block is fixed skipped. Returns the first `count` counted days (a prefix of the bench set).
export function caseDays(count, generated = 1000, seed = 2026) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < generated && out.length < count; i += 1) {
    const day = randomDay(rnd);
    const minutes = 5 + Math.floor(rnd() * 116);
    if (day[0].fixed) continue;
    out.push({ index: i, day, minutes });
  }
  return out;
}

export function buildPrompt(day, minutes) {
  const schedule = day.map((b) => `- ${b.id}: ${formatHHMM(b.start)}-${formatHHMM(b.end)} ${b.title}${b.fixed ? ' (FIXED)' : ''}`).join('\n');
  const values = { schedule, now: formatHHMM(day[0].start), minutes: String(minutes), first_title: day[0].title, earliest: formatHHMM(day[0].start + minutes) };
  return template().replace(/\{\{([a-z_]+)\}\}/g, (_, k) => values[k]);
}

// Reads the model's answer. Returns {ok:true, placed:{id:{start,end}}, dropped:[id]} or {ok:false, reason}.
export function parseReplan(text) {
  const raw = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let data;
  try { data = JSON.parse(raw); } catch { return { ok: false, reason: 'not_json' }; }
  if (!data || !Array.isArray(data.blocks)) return { ok: false, reason: 'no_blocks' };
  const placed = {};
  for (const b of data.blocks) {
    if (!b || typeof b.id !== 'string') return { ok: false, reason: 'bad_block' };
    try { placed[b.id] = { start: parseHHMM(b.start), end: parseHHMM(b.end) }; } catch { return { ok: false, reason: 'bad_time' }; }
  }
  const dropped = Array.isArray(data.dropped) ? data.dropped.filter((x) => typeof x === 'string') : [];
  return { ok: true, placed, dropped };
}

// Counts the three invariants with the same checker NextOne is held to (overlapMinutes) on the answer.
// missing = blocks the answer neither places (with end > start, inside the day) nor lists as dropped.
export function scoreReplan(day, parsed) {
  const kept = [];
  let fixedMoved = 0, missing = 0, dropped = 0;
  for (const b of day) {
    const p = parsed.placed[b.id];
    if (p && p.end > p.start && p.end <= 1440) {
      kept.push({ ...b, start: p.start, end: p.end, status: 'planned' });
      if (b.fixed && (p.start !== b.start || p.end !== b.end)) fixedMoved += 1;
    } else if (parsed.dropped.includes(b.id)) {
      dropped += 1;
      if (b.fixed) fixedMoved += 1;
    } else {
      missing += 1;
      if (b.fixed) fixedMoved += 1;
    }
  }
  return { overlap_minutes: overlapMinutes(kept), fixed_moved: fixedMoved, missing, dropped };
}

export function nextOneDeferred(day, minutes) {
  return runLate(day, day[0].start, minutes).blocks.filter((b) => b.status === 'deferred').length;
}

const round1 = (x) => Math.round(x * 10) / 10;
// records: {status:'scored', overlap_minutes, fixed_moved, missing, dropped} | {status:'unparseable'} | {status:'unmeasured'}
export function aggregate(records) {
  const scored = records.filter((r) => r.status === 'scored');
  const overlapRuns = scored.filter((r) => r.overlap_minutes > 0);
  const n = scored.length;
  return {
    attempted: records.length,
    measured: n,
    unparseable: records.filter((r) => r.status === 'unparseable').length,
    unmeasured: records.filter((r) => r.status === 'unmeasured').length,
    overlap_runs: overlapRuns.length,
    overlap_percent: n ? round1((100 * overlapRuns.length) / n) : 0,
    mean_overlap_minutes: overlapRuns.length ? round1(overlapRuns.reduce((s, r) => s + r.overlap_minutes, 0) / overlapRuns.length) : 0,
    fixed_blocks_moved: scored.reduce((s, r) => s + r.fixed_moved, 0),
    runs_with_fixed_moved: scored.filter((r) => r.fixed_moved > 0).length,
    missing_blocks: scored.reduce((s, r) => s + r.missing, 0),
    runs_with_missing: scored.filter((r) => r.missing > 0).length,
    clean_runs: scored.filter((r) => r.overlap_minutes === 0 && r.fixed_moved === 0 && r.missing === 0).length,
  };
}
