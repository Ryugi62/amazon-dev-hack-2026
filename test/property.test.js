import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock, runLate, overlapMinutes, completeBlock, skipBlock, honestCompletionRate, isValidEvidence } from '../src/domain/schedule.js';
import { randomDay, naiveShift, mulberry32 } from '../scripts/lib/sim.js';

test('property: 1000 random days x random lateness -> 0 overlap and fixed blocks unmoved', () => {
  const rnd = mulberry32(2026);
  for (let i = 0; i < 1000; i += 1) {
    const day = randomDay(rnd);
    const minutes = 5 + Math.floor(rnd() * 116);
    const now = day[0].start;
    let r;
    try { r = runLate(day, now, minutes); } catch (e) { assert.equal(e.code, 'fixed_block'); continue; }
    assert.equal(overlapMinutes(r.blocks), 0, `run ${i}`);
    for (const f of day.filter((b) => b.fixed)) {
      const after = r.blocks.find((b) => b.id === f.id);
      assert.deepEqual([after.start, after.end], [f.start, f.end]);
    }
    assert.equal(r.blocks.filter((b) => b.status === 'done').length, 0);
  }
});
test('property: naive shift-only baseline leaves overlap in >= 20% of the same runs', () => {
  const rnd = mulberry32(2026);
  let bad = 0; let n = 0;
  for (let i = 0; i < 1000; i += 1) {
    const day = randomDay(rnd);
    const minutes = 5 + Math.floor(rnd() * 116);
    if (day[0].fixed) continue;
    n += 1;
    if (overlapMinutes(naiveShift(day, minutes)) > 0) bad += 1;
  }
  assert.ok(bad / n >= 0.2, `baseline overlap rate ${bad / n}`);
});
test('property: 500 random operation sequences keep honest-completion rate at 1', () => {
  const rnd = mulberry32(7);
  const kinds = ['photo', 'file', 'link', 'third_party', 'self_report', '', undefined];
  for (let i = 0; i < 500; i += 1) {
    let day = randomDay(rnd);
    for (let step = 0; step < 12; step += 1) {
      const b = day[Math.floor(rnd() * day.length)];
      const op = Math.floor(rnd() * 3);
      try {
        if (op === 0) {
          const kind = kinds[Math.floor(rnd() * kinds.length)];
          const ev = kind === undefined ? undefined : { kind, ref: rnd() < 0.3 ? '' : 'proof' };
          const next = completeBlock(day, b.id, ev);
          assert.ok(isValidEvidence(ev));
          day = next;
        } else if (op === 1) day = skipBlock(day, b.id);
        else day = runLate(day, 0, 10 + Math.floor(rnd() * 60)).blocks;
      } catch (e) { assert.equal(e.name, 'DomainError'); }
      assert.equal(honestCompletionRate(day), 1);
    }
  }
});
