import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/infrastructure/server.js';
import { McpClient } from '../host/client.js';
import { runTurn } from '../host/session.js';
import { validateCard } from '../src/application/presenter.js';

test('3-minute demo scenario: 5 utterances end to end through the real server', async () => {
  const s = await startServer({ port: 0, storePath: join(mkdtempSync(join(tmpdir(), 'nextone-')), 's.json') });
  try {
    const client = new McpClient({ baseUrl: s.url });
    await client.initialize();
    assert.ok((await client.listTools()).length >= 7);
    const ctx = { now: '08:30', currentBlockId: null };
    const turns = [];
    for (const say of ['what should I do now?', "I'm 40 minutes late", 'I did it', 'done, photo desk.jpg', 'what should I do now?']) turns.push(await runTurn(client, ctx, say));

    assert.equal(turns[0].card.title, 'Morning study');
    assert.match(turns[1].card.fields.join(' '), /0 overlaps/);
    assert.equal(turns[2].isError, true);
    assert.equal(turns[2].card.title, 'Not recorded');
    assert.equal(turns[3].isError, false);
    assert.equal(turns[3].card.fields[0], 'Proof: photo, confirmed');
    assert.notEqual(turns[4].card.title, turns[0].card.title);
    for (const t of turns) assert.equal(validateCard(t.card).ok, true);
  } finally { await s.close(); }
});
test('end to end: a photo that is not in the evidence folder is refused and the block stays planned', async () => {
  const s = await startServer({ port: 0, storePath: join(mkdtempSync(join(tmpdir(), 'nextone-')), 's.json') });
  try {
    const client = new McpClient({ baseUrl: s.url });
    await client.initialize();
    const ctx = { now: '08:30', currentBlockId: null };
    await runTurn(client, ctx, 'what should I do now?');
    const t = await runTurn(client, ctx, 'done, photo not-taken.jpg');
    assert.equal(t.isError, true);
    assert.equal(t.card.title, 'Not recorded');
    assert.match(t.card.fields[0], /Not confirmed/);
    const today = await client.callTool('get_today', {});
    assert.equal(today.structuredContent.data.blocks.find((b) => b.id === ctx.currentBlockId).status, 'planned');
  } finally { await s.close(); }
});
test('client re-initializes transparently after a server restart (session 404)', async () => {
  const storePath = join(mkdtempSync(join(tmpdir(), 'nextone-')), 's.json');
  const a = await startServer({ port: 0, storePath });
  const client = new McpClient({ baseUrl: a.url });
  await client.initialize();
  await a.close();
  const b = await startServer({ port: 0, storePath });
  client.baseUrl = b.url; // same service, new process and port: the old session id is unknown now
  try {
    const r = await client.callTool('get_today', {});
    assert.ok(r.structuredContent.data.blocks.length >= 6);
  } finally { await b.close(); }
});
