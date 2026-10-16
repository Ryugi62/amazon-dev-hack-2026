import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../src/application/service.js';
import { memoryStore } from '../src/infrastructure/memoryStore.js';
import { demoDay } from '../src/application/demoDay.js';
import { parseHHMM } from '../src/domain/time.js';
import { overlapMinutes } from '../src/domain/schedule.js';
import { validateCard } from '../src/application/presenter.js';

const make = () => createService({ store: memoryStore(), userId: 'demo' });
const T = parseHHMM;

test('demo day is synthetic, overlap-free and has fixed blocks', () => {
  const d = demoDay();
  assert.equal(overlapMinutes(d.blocks), 0);
  assert.ok(d.blocks.some((b) => b.fixed));
  assert.ok(d.blocks.length >= 6);
});
test('getNextUp: one next and two previews on one card', () => {
  const r = make().getNextUp({ now: T('08:00') });
  assert.equal(r.ok, true);
  assert.ok(r.data.next);
  assert.equal(r.data.preview.length, 2);
  assert.equal(validateCard(r.card).ok, true);
});
test('reportRunningLate: result has zero overlaps and card says so', () => {
  const s = make();
  const r = s.reportRunningLate({ minutes: 40, now: T('08:30') });
  assert.equal(r.ok, true);
  assert.equal(r.data.overlapMinutes, 0);
  assert.match(r.card.fields.join(' '), /0 overlap/);
});
test('reportRunningLate: state is saved, next getNextUp reflects the move', () => {
  const s = make();
  const before = s.getNextUp({ now: T('08:00') }).data.next;
  s.reportRunningLate({ minutes: 30, now: T('08:00') });
  const after = s.getNextUp({ now: T('08:00') }).data.next;
  assert.equal(after.id, before.id);
  assert.equal(after.start, before.start + 30);
});
test('completeBlock without evidence: ok=false, code evidence_required, card shows what is needed', async () => {
  const s = make();
  const id = s.getNextUp({ now: T('08:00') }).data.next.id;
  const r = await s.completeBlock({ blockId: id });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'evidence_required');
  assert.equal(validateCard(r.card).ok, true);
  assert.equal(s.getToday().data.blocks.find((b) => b.id === id).status, 'planned');
});
test('completeBlock with evidence: done, next advances', async () => {
  const s = make();
  const id = s.getNextUp({ now: T('08:00') }).data.next.id;
  const r = await s.completeBlock({ blockId: id, evidence: { kind: 'photo', ref: 'desk.jpg' } });
  assert.equal(r.ok, true);
  assert.notEqual(s.getNextUp({ now: T('08:00') }).data.next.id, id);
});
test('addBlock: overlap returns ok=false with code overlap', () => {
  const s = make();
  const r = s.addBlock({ title: 'Call', start: '10:30', end: '11:00', fixed: true });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'overlap');
});
test('addBlock: valid block is stored', () => {
  const s = make();
  const r = s.addBlock({ title: 'Call', start: '21:40', end: '22:00', fixed: false });
  assert.equal(r.ok, true);
  assert.ok(s.getToday().data.blocks.some((b) => b.title === 'Call'));
});
test('skipBlock: marks skipped', () => {
  const s = make();
  const id = s.getNextUp({ now: T('08:00') }).data.next.id;
  assert.equal(s.skipBlock({ blockId: id }).ok, true);
});
test('getRules: lists the three invariants', () => {
  const r = make().getRules();
  assert.equal(r.data.rules.length, 3);
  assert.equal(validateCard(r.card).ok, true);
});
test('every use case returns a valid card (success and failure)', async () => {
  const s = make();
  const results = [
    s.getNextUp({ now: T('08:00') }), s.getToday(), s.getRules(),
    s.reportRunningLate({ minutes: 20, now: T('08:00') }),
    await s.completeBlock({ blockId: 'nope' }),
    s.addBlock({ title: 'x', start: '10:30', end: '11:00' }),
    s.reportRunningLate({ minutes: 0 }),
    s.getNextUp({ now: T('23:59') }),
  ];
  for (const r of results) assert.equal(validateCard(r.card).ok, true, JSON.stringify(r.card));
});
test('validateCard rejects 3 fields, 2 actions, missing title', () => {
  assert.equal(validateCard({ title: 't', fields: ['a', 'b', 'c'], action: { label: 'x', tool: 'get_next_up' } }).ok, false);
  assert.equal(validateCard({ title: 't', fields: [], actions: [{}, {}] }).ok, false);
  assert.equal(validateCard({ fields: [], action: { label: 'x', tool: 'get_next_up' } }).ok, false);
});
