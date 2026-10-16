import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkLanguage, checkInternalTraces, checkUnrenderedPlaceholders, checkReadmeMatchesMetrics, frictionEntries, root } from './lib/docs-checks.js';

const problems = [];
if (checkLanguage().length) problems.push(`non-English text in: ${checkLanguage().join(', ')}`);
if (checkInternalTraces().length) problems.push(`internal traces: ${checkInternalTraces().join('; ')}`);
if (checkUnrenderedPlaceholders().length) problems.push(`unrendered {{placeholder}} in: ${checkUnrenderedPlaceholders().join(', ')}`);
if (!checkReadmeMatchesMetrics()) problems.push('README.md or docs/description.md differs from its .tpl.md + docs/metrics.json (run npm run bench, then node scripts/build-readme.js)');
if (frictionEntries() < 5) problems.push('friction log has fewer than 5 entries');
const out = spawnSync('sh', ['-c', 'node --test test/*.test.js 2>&1'], { cwd: root, encoding: 'utf8' }).stdout;
const actual = Number(/ℹ tests (\d+)/.exec(out)?.[1]);
const recorded = JSON.parse(readFileSync(join(root, 'docs', 'metrics.json'), 'utf8')).tests.tests;
if (actual !== recorded) problems.push(`test count ${actual} differs from metrics.json ${recorded}`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`docs ok: README matches metrics, English only, no internal traces, ${frictionEntries()} friction entries, ${actual} tests`);
