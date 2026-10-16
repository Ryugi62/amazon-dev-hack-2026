// Experiment only (not part of the product): asks a hosted LLM to re-plan the same seeded late days, then scores
// the answers with the same overlap checker as NextOne. Writes docs/llm-baseline.json; `npm run bench` reads it.
// Usage: GEMINI_API_KEY=... node scripts/llm-baseline.js --model gemini-3.5-flash --from 35 --days 20
// Each model has its own file under docs/llm-baseline/ (the free tier allows about 20 requests per model per day, so
// different models cover different slices of the same seeded day list). --from is the position in the counted list.
// The key is read from the environment only and is never written anywhere. Tests never call the network.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caseDays, buildPrompt, parseReplan, scoreReplan, nextOneDeferred, PROMPT_FILE } from './lib/llm-replan.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const days = Number(arg('days', 20));
const from = Number(arg('from', 0));
const model = arg('model', 'gemini-2.5-flash');
const out = join(root, 'docs', 'llm-baseline', `${model}.json`);
const spacingMs = Number(arg('spacing-ms', 6500));
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('Set GEMINI_API_KEY in the environment.'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prior = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
const state = prior ? prior : { model, prompt_file: PROMPT_FILE, seed: 2026, temperature: 0, records: [] };
const done = new Set(state.records.map((r) => r.index));
const save = () => { state.date = new Date().toISOString().slice(0, 10); writeFileSync(out, `${JSON.stringify(state, null, 1)}\n`); };

async function ask(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 32768, responseMimeType: 'application/json' } });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let res;
    try { res = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(90000) }); }
    catch { return { error: 'network' }; }
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}));
      const text = JSON.stringify(j);
      if (/PerDay|per day/i.test(text)) return { error: 'daily_limit', stop: true };
      const m = /"retryDelay":\s*"(\d+)/.exec(text);
      if (attempt === 0) { await sleep(((m ? Number(m[1]) : 30) + 2) * 1000); continue; }
      return { error: 'rate_limit' };
    }
    if (res.status >= 500 && attempt === 0) { await sleep(5000); continue; }
    if (!res.ok) return { error: `http_${res.status}` };
    const j = await res.json();
    return { text: j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '' };
  }
  return { error: 'failed' };
}

for (const c of caseDays(from + days).slice(from)) {
  if (done.has(c.index)) continue;
  const r = await ask(buildPrompt(c.day, c.minutes));
  const base = { index: c.index, minutes: c.minutes, blocks: c.day.length, nextone_deferred: nextOneDeferred(c.day, c.minutes) };
  if (r.stop) { console.error('Daily limit reached; stopping. Resume later with the same command.'); break; }
  if (r.error) state.records.push({ ...base, status: 'unmeasured', reason: r.error });
  else {
    const parsed = parseReplan(r.text);
    state.records.push(parsed.ok ? { ...base, status: 'scored', ...scoreReplan(c.day, parsed) } : { ...base, status: 'unparseable', reason: parsed.reason, sample: r.text.slice(0, 120) });
  }
  save();
  process.stdout.write(`${state.records.length}:${state.records.at(-1).status} `);
  await sleep(spacingMs);
}
save();
console.log(`\nrecords: ${state.records.length}`);
