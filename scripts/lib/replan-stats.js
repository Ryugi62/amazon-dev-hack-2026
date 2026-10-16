import { runLate, overlapMinutes } from '../../src/domain/schedule.js';
import { randomDay, naiveShift, mulberry32 } from './sim.js';

// Seeded random days with a late first block; compares NextOne's re-plan with a shift-only baseline.
export function replanStats(runs = 1000) {
  const rnd = mulberry32(2026);
  let n = 0, nextOneOverlapRuns = 0, baselineOverlapRuns = 0, fixedMoved = 0, baselineOverlapTotal = 0;
  for (let i = 0; i < runs; i += 1) {
    const day = randomDay(rnd);
    const minutes = 5 + Math.floor(rnd() * 116);
    if (day[0].fixed) continue;
    n += 1;
    const r = runLate(day, day[0].start, minutes);
    if (overlapMinutes(r.blocks) > 0) nextOneOverlapRuns += 1;
    for (const f of day.filter((b) => b.fixed)) {
      const a = r.blocks.find((b) => b.id === f.id);
      if (a.start !== f.start || a.end !== f.end) fixedMoved += 1;
    }
    const base = overlapMinutes(naiveShift(day, minutes));
    if (base > 0) { baselineOverlapRuns += 1; baselineOverlapTotal += base; }
  }
  return {
    runs: n,
    nextone_overlap_runs: nextOneOverlapRuns,
    baseline_overlap_runs: baselineOverlapRuns,
    baseline_overlap_percent: Math.round((1000 * baselineOverlapRuns) / n) / 10,
    baseline_mean_overlap_minutes: baselineOverlapRuns ? Math.round((10 * baselineOverlapTotal) / baselineOverlapRuns) / 10 : 0,
    fixed_blocks_moved: fixedMoved,
  };
}
