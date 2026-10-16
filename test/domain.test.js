import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHHMM, formatHHMM } from '../src/domain/time.js';
import { createBlock, overlapMinutes, nextUp, runLate, addBlock, completeBlock, skipBlock, honestCompletionRate, DomainError } from '../src/domain/schedule.js';

const B = (id, s, e, o = {}) => createBlock({ id, title: id, start: parseHHMM(s), end: parseHHMM(e), ...o });

test('time: parse and format round trip', () => {
  assert.equal(parseHHMM('09:30'), 570);
  assert.equal(formatHHMM(570), '09:30');
  assert.equal(formatHHMM(1440), '24:00');
});
test('time: rejects malformed input', () => {
  assert.throws(() => parseHHMM('9:3x'), DomainError);
  assert.throws(() => parseHHMM('25:00'), DomainError);
});
test('createBlock: rejects end <= start and out-of-day values', () => {
  assert.throws(() => B('x', '10:00', '10:00'), DomainError);
  assert.throws(() => createBlock({ id: 'x', title: 'x', start: -1, end: 10 }), DomainError);
  assert.throws(() => createBlock({ id: 'x', title: 'x', start: 10, end: 1441 }), DomainError);
});
test('overlapMinutes: 0 for disjoint, counts shared minutes', () => {
  assert.equal(overlapMinutes([B('a', '09:00', '10:00'), B('b', '10:00', '11:00')]), 0);
  assert.equal(overlapMinutes([B('a', '09:00', '10:00'), B('b', '09:30', '11:00')]), 30);
});
test('addBlock: rejects overlap with existing block and duplicate id', () => {
  const day = [B('a', '09:00', '10:00')];
  assert.throws(() => addBlock(day, B('b', '09:30', '10:30')), (e) => e.code === 'overlap');
  assert.throws(() => addBlock(day, B('a', '11:00', '12:00')), (e) => e.code === 'duplicate_id');
  assert.equal(addBlock(day, B('c', '10:00', '11:00')).length, 2);
});
test('nextUp: one next block plus two previews, skipping done and finished blocks', () => {
  const day = [B('a', '08:00', '09:00', { status: 'done' }), B('b', '09:00', '10:00'), B('c', '10:00', '11:00'), B('d', '11:00', '12:00'), B('e', '12:00', '13:00')];
  const r = nextUp(day, parseHHMM('09:10'));
  assert.equal(r.next.id, 'b');
  assert.deepEqual(r.preview.map((x) => x.id), ['c', 'd']);
});
test('nextUp: returns null next when nothing is left', () => {
  const r = nextUp([B('a', '08:00', '09:00')], parseHHMM('20:00'));
  assert.equal(r.next, null);
  assert.deepEqual(r.preview, []);
});
test('runLate: pushes flexible blocks, result has zero overlap', () => {
  const day = [B('a', '09:00', '10:00'), B('b', '10:00', '11:00'), B('c', '11:00', '12:00')];
  const r = runLate(day, parseHHMM('09:00'), 40);
  assert.equal(overlapMinutes(r.blocks), 0);
  assert.equal(formatHHMM(r.blocks.find((x) => x.id === 'a').start), '09:40');
  assert.equal(formatHHMM(r.blocks.find((x) => x.id === 'c').start), '11:40');
});
test('runLate: GIVEN/WHEN/THEN from SPEC (fixed block is jumped, never moved)', () => {
  const day = [B('A', '09:00', '10:00'), B('B', '10:00', '11:00', { fixed: true }), B('C', '11:00', '12:00')];
  const r = runLate(day, parseHHMM('09:00'), 30);
  const get = (id) => r.blocks.find((x) => x.id === id);
  assert.equal(formatHHMM(get('A').start), '11:00');
  assert.equal(formatHHMM(get('C').start), '12:00');
  assert.equal(formatHHMM(get('B').start), '10:00');
  assert.equal(overlapMinutes(r.blocks), 0);
});
test('runLate: blocks that no longer fit become deferred, never done', () => {
  const day = [B('a', '22:00', '23:00'), B('b', '23:00', '24:00')];
  const r = runLate(day, parseHHMM('22:00'), 60);
  assert.equal(r.blocks.find((x) => x.id === 'b').status, 'deferred');
  assert.ok(r.changes.some((c) => c.id === 'b' && c.kind === 'deferred'));
});
test('runLate: refuses to delay a fixed block', () => {
  const day = [B('class', '09:00', '10:00', { fixed: true })];
  assert.throws(() => runLate(day, parseHHMM('09:00'), 10), (e) => e.code === 'fixed_block');
});
test('runLate: rejects non-positive or absurd minutes', () => {
  const day = [B('a', '09:00', '10:00')];
  assert.throws(() => runLate(day, 540, 0), DomainError);
  assert.throws(() => runLate(day, 540, 600), DomainError);
});
test('runLate: does not mutate the input array', () => {
  const day = [B('a', '09:00', '10:00'), B('b', '10:00', '11:00')];
  const snap = JSON.stringify(day);
  runLate(day, 540, 20);
  assert.equal(JSON.stringify(day), snap);
});
test('runLate: reports changes list with from/to', () => {
  const day = [B('a', '09:00', '10:00'), B('b', '10:00', '11:00')];
  const r = runLate(day, 540, 15);
  assert.equal(r.changes.length, 2);
  assert.deepEqual(Object.keys(r.changes[0]).sort(), ['from', 'id', 'kind', 'to']);
});
test('completeBlock: rejects missing evidence', () => {
  const day = [B('a', '09:00', '10:00')];
  assert.throws(() => completeBlock(day, 'a', undefined), (e) => e.code === 'evidence_required');
  assert.equal(day[0].status, 'planned');
});
test('completeBlock: self_report is not evidence', () => {
  const day = [B('a', '09:00', '10:00')];
  assert.throws(() => completeBlock(day, 'a', { kind: 'self_report', ref: 'I did it' }), (e) => e.code === 'evidence_required');
});
test('completeBlock: empty ref is not evidence', () => {
  const day = [B('a', '09:00', '10:00')];
  assert.throws(() => completeBlock(day, 'a', { kind: 'photo', ref: '  ' }), (e) => e.code === 'evidence_required');
});
test('completeBlock: valid evidence marks done and stores it', () => {
  const day = [B('a', '09:00', '10:00')];
  const out = completeBlock(day, 'a', { kind: 'photo', ref: 'img-001.jpg' });
  assert.equal(out[0].status, 'done');
  assert.deepEqual(out[0].evidence, { kind: 'photo', ref: 'img-001.jpg' });
});
test('completeBlock: unknown id and double completion are errors', () => {
  const day = [B('a', '09:00', '10:00')];
  assert.throws(() => completeBlock(day, 'zzz', { kind: 'link', ref: 'https://x.y' }), (e) => e.code === 'not_found');
  const done = completeBlock(day, 'a', { kind: 'link', ref: 'https://x.y' });
  assert.throws(() => completeBlock(done, 'a', { kind: 'link', ref: 'https://x.y' }), (e) => e.code === 'not_planned');
});
test('skipBlock: marks skipped, never done', () => {
  const out = skipBlock([B('a', '09:00', '10:00')], 'a');
  assert.equal(out[0].status, 'skipped');
});
test('honestCompletionRate: 1 when no done blocks, 1 for evidenced, 0 for forged state', () => {
  assert.equal(honestCompletionRate([B('a', '09:00', '10:00')]), 1);
  const ok = completeBlock([B('a', '09:00', '10:00')], 'a', { kind: 'file', ref: 'r.pdf' });
  assert.equal(honestCompletionRate(ok), 1);
  assert.equal(honestCompletionRate([B('a', '09:00', '10:00', { status: 'done' })]), 0);
});
