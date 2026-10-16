import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpHandler, PROTOCOL_VERSION, CARD_MIME } from '../src/adapters/mcp.js';
import { createService } from '../src/application/service.js';
import { memoryStore } from '../src/infrastructure/memoryStore.js';

const handler = () => createMcpHandler({ service: createService({ store: memoryStore() }), cardHtml: '<html>card</html>' });
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });

test('initialize negotiates 2025-11-25 and advertises tools + resources', async () => {
  const r = await handler().handle(rpc('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 't', version: '1' } }));
  assert.equal(r.result.protocolVersion, '2025-11-25');
  assert.ok(r.result.capabilities.tools);
  assert.ok(r.result.capabilities.resources);
  assert.equal(r.result.serverInfo.name, 'nextone');
});
test('notifications get no response', async () => {
  assert.equal(await handler().handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});
test('ping returns empty result', async () => {
  assert.deepEqual((await handler().handle(rpc('ping'))).result, {});
});
test('tools/list returns >= 7 tools with schemas and the card resource link', async () => {
  const { result } = await handler().handle(rpc('tools/list'));
  assert.ok(result.tools.length >= 7);
  for (const t of result.tools) {
    assert.ok(t.name && t.description && t.inputSchema.type === 'object');
  }
  const next = result.tools.find((t) => t.name === 'get_next_up');
  assert.match(next._meta.ui.resourceUri, /^ui:\/\/nextone\/card-[0-9a-f]{8}\.html$/);
  assert.deepEqual(next._meta.ui.csp, { connectDomains: [], resourceDomains: [] });
});
test('tools/call get_next_up returns text + structuredContent with a card', async () => {
  const { result } = await handler().handle(rpc('tools/call', { name: 'get_next_up', arguments: { now: '08:00' } }));
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.structuredContent.card.title);
});
test('tools/call domain failure is a tool result with isError true, not a protocol error', async () => {
  const { result, error } = await handler().handle(rpc('tools/call', { name: 'complete_block', arguments: { block_id: 'x' } }));
  assert.equal(error, undefined);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, 'not_found');
});
test('evidence_required surfaces through MCP', async () => {
  const h = handler();
  const first = (await h.handle(rpc('tools/call', { name: 'get_next_up', arguments: { now: '08:00' } }))).result.structuredContent.data.next.id;
  const { result } = await h.handle(rpc('tools/call', { name: 'complete_block', arguments: { block_id: first, evidence: { kind: 'self_report', ref: 'trust me' } } }));
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, 'evidence_required');
});
test('unknown tool and bad arguments are JSON-RPC -32602', async () => {
  const h = handler();
  assert.equal((await h.handle(rpc('tools/call', { name: 'nope', arguments: {} }))).error.code, -32602);
  assert.equal((await h.handle(rpc('tools/call', { name: 'report_running_late', arguments: { minutes: 'abc' } }))).error.code, -32602);
});
test('unknown method is -32601; malformed envelope is -32600', async () => {
  const h = handler();
  assert.equal((await h.handle(rpc('nope/nope'))).error.code, -32601);
  assert.equal((await h.handle({ id: 1, method: 'ping' })).error.code, -32600);
});
test('resources/list and resources/read serve the MCP App card', async () => {
  const h = handler();
  const CARD_URI = h.cardUri;
  const list = (await h.handle(rpc('resources/list'))).result.resources;
  assert.equal(list[0].uri, CARD_URI);
  assert.equal(list[0].mimeType, CARD_MIME);
  const read = (await h.handle(rpc('resources/read', { uri: CARD_URI }))).result.contents[0];
  assert.equal(read.mimeType, 'text/html;profile=mcp-app');
  assert.match(read.text, /card/);
  assert.equal((await h.handle(rpc('resources/read', { uri: 'ui://other' }))).error.code, -32002);
});
