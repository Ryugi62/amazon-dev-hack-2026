export function memoryStore() {
  const m = new Map();
  return {
    load: (id) => (m.has(id) ? structuredClone(m.get(id)) : null),
    save: (id, state) => { m.set(id, structuredClone(state)); },
  };
}
