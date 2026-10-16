import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReadme, renderDescription, renderComparison } from '../build-readme.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// SPEC.md may carry one HTML comment with repo-gate keywords; comments are not rendered, so they are ignored here.
const read = (p) => readFileSync(join(root, p), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

const docMarkdown = readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`);
const topMarkdown = readdirSync(root).filter((f) => f.endsWith('.md'));
export const PUBLIC_FILES = [...new Set([...topMarkdown, ...docMarkdown, 'package.json', 'LICENSE'])].concat( readdirSync(join(root, 'host')).map((f) => `host/${f}`), 'src/adapters/card.html');
const INTERNAL = [/\[\[/, /projects\//, /board\.md/, /\bTODO\b/, /\bFIXME\b/, /Jarvis/i, /main judgment/i, /~\/jarvis/i, /\/Users\//, /\bvault\b/i, /obsidian/i, /handoff\//i, /\bdashboard\.md\b/i];
const HANGUL = /[ㄱ-ㆎ가-힣]/;
// Returns every problem found in one text: Hangul and internal-trace patterns.
export function findTraces(text) {
  const hits = [];
  if (HANGUL.test(text)) hits.push('Hangul');
  for (const re of INTERNAL) if (re.test(text)) hits.push(String(re));
  return hits;
}

export function checkLanguage() {
  return PUBLIC_FILES.filter((f) => /[ㄱ-ㆎ가-힣]/.test(read(f)));
}
export function checkInternalTraces() {
  const hits = [];
  for (const f of PUBLIC_FILES) for (const re of INTERNAL) if (re.test(read(f))) hits.push(`${f}: ${re}`);
  return hits;
}
export function checkReadmeMatchesMetrics() {
  return read('README.md') === renderReadme() && read('docs/description.md') === renderDescription() && read('docs/comparison.md') === renderComparison();
}
// A leftover {{name}} means the template was not rendered (the template itself is the only file allowed to hold them).
export function checkUnrenderedPlaceholders() {
  return PUBLIC_FILES.filter((f) => !f.endsWith('.tpl.md') && /\{\{/.test(read(f)));
}
export function frictionEntries() {
  return read('docs/friction-log.md').split('\n').filter((l) => /^\| \d+ \|/.test(l)).length;
}
export { root };
