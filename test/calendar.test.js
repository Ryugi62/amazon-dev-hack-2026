import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIcs } from '../src/adapters/ics.js';
import { fixedBlocksFromEvents, overlapMinutes, runLate, createBlock } from '../src/domain/schedule.js';
import { createService } from '../src/application/service.js';
import { memoryStore } from '../src/infrastructure/memoryStore.js';
import { startServer } from '../src/infrastructure/server.js';
import { McpClient } from '../host/client.js';

const sample = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'samples', 'calendar', 'sample-day.ics'), 'utf8');
const ics = (...lines) => ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', ...lines, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

test('parseIcs: reads local times, DTEND and DURATION, unescapes text, unfolds lines', () => {
  const r = parseIcs(sample, { date: '2026-10-21' });
  const byTitle = Object.fromEntries(r.events.map((e) => [e.title, e]));
  assert.deepEqual([byTitle['Algorithms lecture'].start, byTitle['Algorithms lecture'].end], [540, 615]);
  assert.deepEqual([byTitle['Lunch with Sam, outdoors'].start, byTitle['Lunch with Sam, outdoors'].end], [750, 810]);
  assert.ok(byTitle.Dinner);
});
test('parseIcs: expands a weekly RRULE onto the chosen date and ignores other dates', () => {
  const r = parseIcs(sample, { date: '2026-10-21' });
  assert.ok(r.events.some((e) => e.title.startsWith('Study group') && e.start === 900));
  assert.ok(!r.events.some((e) => e.title === 'Another day'));
  assert.ok(!parseIcs(sample, { date: '2026-10-15' }).events.some((e) => e.title.startsWith('Study group'))); // Thursday: not a WE
  assert.equal(parseIcs(sample, { date: '2026-11-11' }).events.some((e) => e.title.startsWith('Study group')), false); // COUNT=4 ended
});
test('parseIcs: all-day events are reported as skipped, not turned into blocks', () => {
  const r = parseIcs(sample, { date: '2026-10-21' });
  assert.ok(r.skipped.some((s) => /all-day/.test(s.reason) && /Library/.test(s.title)));
});
test('parseIcs: default date = the earliest event date in the file', () => {
  assert.equal(parseIcs(sample).date, '2026-10-14');
});
test('parseIcs: a UTC time (Z) becomes device-local minutes', () => {
  const r = parseIcs(ics('DTSTART:20261021T170000Z', 'DTEND:20261021T180000Z', 'SUMMARY:UTC'), { date: '2026-10-21' });
  const d = new Date(Date.UTC(2026, 9, 21, 17, 0));
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const again = parseIcs(ics('DTSTART:20261021T170000Z', 'DTEND:20261021T180000Z', 'SUMMARY:UTC'), { date: local });
  assert.deepEqual([again.events[0].start, again.events[0].end], [d.getHours() * 60 + d.getMinutes(), d.getHours() * 60 + d.getMinutes() + 60]);
  assert.ok(r);
});
test('parseIcs: text that is not a calendar raises a plain error with a next step', () => {
  assert.throws(() => parseIcs('hello'), (e) => e.code === 'bad_calendar' && /\.ics/.test(e.message));
});
test('parseIcs: an event crossing midnight is clipped to the day', () => {
  const r = parseIcs(ics('DTSTART:20261021T230000', 'DTEND:20261022T010000', 'SUMMARY:Night shift'), { date: '2026-10-21' });
  assert.deepEqual([r.events[0].start, r.events[0].end], [1380, 1440]);
});

test('domain: fixed blocks from events are all fixed; a double-booked event is dropped and reported', () => {
  const { blocks, rejected } = fixedBlocksFromEvents([
    { title: 'A', start: 540, end: 615 }, { title: 'B', start: 570, end: 630 }, { title: 'C', start: 700, end: 760 },
  ]);
  assert.equal(blocks.length, 2);
  assert.ok(blocks.every((b) => b.fixed && b.status === 'planned'));
  assert.equal(overlapMinutes(blocks), 0);
  assert.equal(rejected[0].title, 'B');
});
test('imported day feeds the re-plan: running late never moves an imported fixed block', () => {
  const { blocks } = fixedBlocksFromEvents(parseIcs(sample, { date: '2026-10-21' }).events);
  const day = [createBlock({ id: 'w', title: 'Write report', start: 480, end: 540 }), ...blocks];
  const out = runLate(day, 480, 45);
  assert.equal(overlapMinutes(out.blocks), 0);
  for (const f of blocks) assert.deepEqual(out.blocks.find((b) => b.id === f.id), f);
});

test('service.importCalendar replaces the day with the fixed events and reports what it skipped', () => {
  const s = createService({ store: memoryStore() });
  const r = s.importCalendar({ events: parseIcs(sample, { date: '2026-10-21' }).events, skipped: [{ title: 'x', reason: 'all-day' }], date: '2026-10-21' });
  assert.equal(r.ok, true);
  const today = s.getToday().data;
  assert.ok(today.blocks.every((b) => b.fixed));
  assert.equal(today.overlapMinutes, 0);
  assert.ok(r.data.rejected.length >= 1);
  assert.equal(r.card.title, `Imported ${r.data.blocks.length} fixed events`);
});

test('MCP tool import_calendar: reads .ics text sent by the local host; state stays in the local store', async () => {
  const s = await startServer({ port: 0, storePath: join(mkdtempSync(join(tmpdir(), 'nextone-')), 's.json') });
  try {
    const c = new McpClient({ baseUrl: s.url });
    await c.initialize();
    assert.ok((await c.listTools()).some((t) => t.name === 'import_calendar'));
    const r = await c.callTool('import_calendar', { ics: sample, date: '2026-10-21' });
    assert.equal(r.isError ?? false, false);
    assert.equal(r.structuredContent.card.fields.length <= 2, true);
    const next = await c.callTool('get_next_up', { now: '08:00' });
    assert.equal(next.structuredContent.data.next.title, 'Algorithms lecture');
    const bad = await c.callTool('import_calendar', { ics: 'not a calendar' });
    assert.equal(bad.isError, true);
  } finally { await s.close(); }
});

test('host session: runImport sends the file text to import_calendar and returns a card', async () => {
  const { runImport } = await import('../host/session.js');
  const s = await startServer({ port: 0, storePath: join(mkdtempSync(join(tmpdir(), 'nextone-')), 's.json') });
  try {
    const c = new McpClient({ baseUrl: s.url });
    await c.initialize();
    const turn = await runImport(c, sample);
    assert.equal(turn.isError, false);
    assert.match(turn.card.title, /^Imported \d+ fixed events$/);
  } finally { await s.close(); }
});
test('privacy: the import path stores blocks only, never the .ics text', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'nextone-')), 's.json');
  const s = await startServer({ port: 0, storePath: path });
  try {
    const c = new McpClient({ baseUrl: s.url });
    await c.initialize();
    await c.callTool('import_calendar', { ics: sample, date: '2026-10-21' });
    const stored = readFileSync(path, 'utf8');
    assert.ok(!stored.includes('BEGIN:VCALENDAR') && !stored.includes('nextone.example'));
  } finally { await s.close(); }
});
