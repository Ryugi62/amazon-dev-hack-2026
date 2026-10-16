import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function fileStore(path) {
  const read = () => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
  return {
    load: (id) => read()[id] ?? null,
    save(id, state) {
      mkdirSync(dirname(path), { recursive: true });
      const all = read();
      all[id] = state;
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(all, null, 2));
      renameSync(tmp, path);
    },
  };
}
