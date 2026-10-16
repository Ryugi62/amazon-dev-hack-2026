import { createBlock } from '../../src/domain/schedule.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random synthetic day: 5..9 blocks laid out left to right with gaps; ~25% fixed.
export function randomDay(rnd) {
  const n = 5 + Math.floor(rnd() * 5);
  const blocks = [];
  let t = 360 + Math.floor(rnd() * 120);
  for (let i = 0; i < n; i += 1) {
    const len = 30 + 15 * Math.floor(rnd() * 8);
    const start = t;
    const end = Math.min(start + len, 1440);
    if (end <= start) break;
    blocks.push(createBlock({ id: `b${i}`, title: `Block ${i}`, start, end, fixed: rnd() < 0.25 }));
    t = end + 10 * Math.floor(rnd() * 8);
    if (t >= 1380) break;
  }
  return blocks;
}

// Baseline: what a fixed-time reminder world does when the user says "I'm late": shift the first block only.
export function naiveShift(blocks, minutes) {
  const copy = blocks.map((b) => ({ ...b }));
  copy[0].start += minutes;
  copy[0].end += minutes;
  return copy;
}
