import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const layers = ['domain', 'application', 'adapters', 'infrastructure'];

test('Clean Architecture: no layer imports from a layer outside of itself or below; domain imports no node: modules', () => {
  for (const [i, layer] of layers.entries()) {
    for (const file of readdirSync(join(src, layer)).filter((f) => f.endsWith('.js'))) {
      const text = readFileSync(join(src, layer, file), 'utf8');
      for (const m of text.matchAll(/from '([^']+)'/g)) {
        const spec = m[1];
        if (layer === 'domain') assert.ok(!spec.startsWith('node:'), `${layer}/${file} imports ${spec}`);
        const target = layers.findIndex((l) => spec.includes(`/${l}/`));
        if (target !== -1) assert.ok(target <= i, `${layer}/${file} imports upward: ${spec}`);
      }
    }
  }
});
