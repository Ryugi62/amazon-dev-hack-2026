import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function renderReadme() {
  const tpl = readFileSync(join(root, 'docs', 'README.tpl.md'), 'utf8');
  const metrics = JSON.parse(readFileSync(join(root, 'docs', 'metrics.json'), 'utf8'));
  return tpl.replace(/\{\{([a-z_.]+)\}\}/g, (_, path) => {
    const v = path.split('.').reduce((o, k) => o?.[k], metrics);
    if (v === undefined) throw new Error(`README placeholder without metric: ${path}`);
    return String(v);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeFileSync(join(root, 'README.md'), renderReadme());
