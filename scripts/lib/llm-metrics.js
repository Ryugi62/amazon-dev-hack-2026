import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caseDays, aggregate } from './llm-replan.js';
import { runLate, overlapMinutes } from '../../src/domain/schedule.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'docs', 'llm-baseline');
export const loadSaved = () => readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

// NextOne on exactly the days a model measured, so the two sides share one sample.
function nextOneOn(records) {
  const byIndex = new Map(caseDays(1000).map((c) => [c.index, c]));
  let overlap = 0, fixedMoved = 0, deferred = 0;
  for (const r of records.filter((x) => x.status === 'scored')) {
    const c = byIndex.get(r.index);
    const res = runLate(c.day, c.day[0].start, c.minutes);
    if (overlapMinutes(res.blocks) > 0) overlap += 1;
    deferred += res.blocks.filter((b) => b.status === 'deferred').length;
    for (const f of c.day.filter((b) => b.fixed)) {
      const a = res.blocks.find((b) => b.id === f.id);
      if (a.start !== f.start || a.end !== f.end) fixedMoved += 1;
    }
  }
  return { nextone_overlap_runs: overlap, nextone_fixed_blocks_moved: fixedMoved, nextone_deferred_blocks: deferred };
}

const row = (name, a) => `| ${name} | ${a.measured} | ${a.overlap_runs} (${a.overlap_percent}%) | ${a.mean_overlap_minutes} | ${a.fixed_blocks_moved} in ${a.runs_with_fixed_moved} runs | ${a.missing_blocks} in ${a.runs_with_missing} runs | ${a.clean_runs} of ${a.measured} | ${a.unmeasured + a.unparseable} |`;

// Pools the per-model result files into the metrics block the docs quote. Models differ in which seeded days they
// saw (free-tier daily limits), so the pooled row is "across the days each model measured", not a paired comparison.
export function llmReplanMetrics(saved = loadSaved()) {
  const all = saved.flatMap((s) => s.records);
  const pooled = aggregate(all);
  const rows = saved.map((s) => row(s.model, aggregate(s.records)));
  return {
    models: saved.map((s) => s.model).join(', '),
    model_count: saved.length,
    date: saved.map((s) => s.date).sort().at(-1),
    prompt_file: saved[0].prompt_file,
    seed: saved[0].seed,
    distinct_days: new Set(all.map((r) => r.index)).size,
    ...pooled,
    ...nextOneOn(all),
    table_rows: rows.join('\n'),
  };
}
