import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_FILES, findTraces, root } from '../scripts/lib/docs-checks.js';

function walk(dir, out = []) {
  for (const f of readdirSync(join(root, dir))) {
    const rel = `${dir}/${f}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}
const textFiles = (dir) => walk(dir).filter((f) => /\.(md|js|html|json)$/.test(f));

test('findTraces flags Hangul, vault paths, TODO, Jarvis and absolute home paths (planted samples)', () => {
  for (const bad of ['한국어', 'see ~/jarvis/notes', 'projects/foo', 'TODO fix', 'Jarvis said', '/Users/someone/x', 'the vault note', 'handoff/drop', 'Obsidian', 'board.md', '[[link]]']) {
    assert.ok(findTraces(bad).length > 0, bad);
  }
  assert.deepEqual(findTraces('A plain English sentence about a day plan.'), []);
});

test('every document under docs/ and every markdown file at the top level is in the public list', () => {
  const docs = walk('docs').filter((f) => f.endsWith('.md'));
  const top = readdirSync(root).filter((f) => f.endsWith('.md'));
  for (const f of [...docs, ...top]) assert.ok(PUBLIC_FILES.includes(f), `${f} is not checked`);
  for (const f of ['README.md', 'SPEC.md', 'docs/description.md', 'package.json', 'LICENSE']) assert.ok(PUBLIC_FILES.includes(f), f);
});

test('README, SPEC, docs, description, package.json, src, host, scripts and test files hold no Hangul and no internal traces', () => {
  // The checker's own source holds the patterns it searches for, so it is the one file skipped.
  const files = [...new Set([...PUBLIC_FILES, ...textFiles('src'), ...textFiles('scripts'), ...textFiles('host')])].filter((f) => f !== 'scripts/lib/docs-checks.js');
  const hits = [];
  for (const f of files) {
    const t = readFileSync(join(root, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const h of findTraces(t, f)) hits.push(`${f}: ${h}`);
  }
  assert.deepEqual(hits, []);
});

test('test files contain no Hangul except the trace-checker samples', () => {
  const hits = textFiles('test').filter((f) => f !== 'test/docs-english.test.js' && /[ㄱ-ㆎ가-힣]/.test(readFileSync(join(root, f), 'utf8')));
  assert.deepEqual(hits, []);
});
