import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/infrastructure/server.js';

const post = (url, body, headers = {}) => fetch(`${url}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) });
const init = async (url) => {
  const r = await post(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  return { sid: r.headers.get('mcp-session-id'), body: await r.json() };
};
const call = async (url, sid, name, args, id = 2) => (await (await post(url, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, { 'mcp-session-id': sid })).json()).result;
const tmpStore = () => join(mkdtempSync(join(tmpdir(), 'nextone-')), 'state.json');

test('HTTP: initialize issues a session id, tools/list works with it', async () => {
  const s = await startServer({ port: 0, storePath: tmpStore() });
  try {
    const { sid, body } = await init(s.url);
    assert.ok(sid);
    assert.equal(body.result.protocolVersion, '2025-11-25');
    const list = await (await post(s.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': sid })).json();
    assert.ok(list.result.tools.length >= 7);
  } finally { await s.close(); }
});
test('HTTP: initialized notification gets 202', async () => {
  const s = await startServer({ port: 0, storePath: tmpStore() });
  try {
    const { sid } = await init(s.url);
    const r = await post(s.url, { jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-session-id': sid });
    assert.equal(r.status, 202);
  } finally { await s.close(); }
});
test('HTTP: missing session on non-initialize is 400, unknown session is 404', async () => {
  const s = await startServer({ port: 0, storePath: tmpStore() });
  try {
    assert.equal((await post(s.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).status, 400);
    assert.equal((await post(s.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': 'nope' })).status, 404);
  } finally { await s.close(); }
});
test('HTTP: foreign Origin is rejected with 403, GET /mcp is 405, bad JSON is 400', async () => {
  const s = await startServer({ port: 0, storePath: tmpStore() });
  try {
    assert.equal((await post(s.url, { jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await fetch(`${s.url}/mcp`)).status, 405);
    const bad = await fetch(`${s.url}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    assert.equal(bad.status, 400);
  } finally { await s.close(); }
});
test('HTTP: state written by server A is read by restarted server B (persistence)', async () => {
  const storePath = tmpStore();
  const a = await startServer({ port: 0, storePath });
  let before;
  try {
    const { sid } = await init(a.url);
    before = (await call(a.url, sid, 'get_next_up', { now: '08:00' })).structuredContent.data.next;
    await call(a.url, sid, 'report_running_late', { minutes: 40, now: '08:00' });
  } finally { await a.close(); }
  const b = await startServer({ port: 0, storePath });
  try {
    const { sid } = await init(b.url);
    const after = (await call(b.url, sid, 'get_next_up', { now: '08:00' })).structuredContent.data.next;
    assert.equal(before.id, 'study');
    assert.equal(after.id, 'lecture'); // study moved past the fixed lecture, so the lecture is now next
    const study = (await call(b.url, sid, 'get_today', {})).structuredContent.data.blocks.find((x) => x.id === 'study');
    assert.equal(study.start, 11 * 60 + 30);
    assert.equal((await call(b.url, sid, 'get_today', {})).structuredContent.data.overlapMinutes, 0);
  } finally { await b.close(); }
});
test('HTTP: host simulator page is served and labelled simulated', async () => {
  const s = await startServer({ port: 0, storePath: tmpStore() });
  try {
    const html = await (await fetch(`${s.url}/`)).text();
    assert.match(html, /id="utterance"/);
    assert.match(html, /simulated/i);
    assert.equal((await fetch(`${s.url}/host/intent.js`)).status, 200);
    assert.equal((await fetch(`${s.url}/host/../package.json`)).status, 404);
  } finally { await s.close(); }
});
test('HTTP: the card resource is served over resources/read', async () => {
  const s = await startServer({ port: 0, storePath: tmpStore() });
  try {
    const { sid } = await init(s.url);
    const tools = await (await post(s.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': sid })).json();
    const uri = tools.result.tools[0]._meta.ui.resourceUri;
    const r = await (await post(s.url, { jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri } }, { 'mcp-session-id': sid })).json();
    assert.match(r.result.contents[0].text, /<html/i);
  } finally { await s.close(); }
});
