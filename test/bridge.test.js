import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge, APPS_PROTOCOL_VERSION } from '../host/bridge.js';

const setup = (result = { structuredContent: { card: { title: 't', fields: [], action: { label: 'a', tool: 'get_next_up' } } } }) => {
  const sent = [];
  const bridge = createBridge({ send: (m) => sent.push(m), getHostContext: () => ({ theme: 'light', deviceClass: 'echo-show-8', displayMode: 'inline' }), getToolResult: () => result });
  return { bridge, sent };
};

test('bridge: ui/initialize is answered with protocol version and hostContext (same id)', () => {
  const { bridge, sent } = setup();
  bridge.onWidgetMessage({ jsonrpc: '2.0', id: 7, method: 'ui/initialize', params: {} });
  assert.equal(sent[0].id, 7);
  assert.equal(sent[0].result.protocolVersion, APPS_PROTOCOL_VERSION);
  assert.equal(sent[0].result.hostContext.deviceClass, 'echo-show-8');
});
test('bridge: after ui/notifications/initialized the tool result is pushed', () => {
  const { bridge, sent } = setup();
  bridge.onWidgetMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized' });
  assert.equal(sent[0].method, 'ui/notifications/tool-result');
  assert.equal(sent[0].params.structuredContent.card.title, 't');
});
test('bridge: no result yet means nothing is pushed; foreign messages are ignored', () => {
  const { bridge, sent } = setup(null);
  bridge.onWidgetMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized' });
  bridge.onWidgetMessage({ hello: 'x' });
  assert.equal(sent.length, 0);
});
test('bridge: host-context-changed forwards the partial context', () => {
  const { bridge, sent } = setup();
  bridge.hostContextChanged({ theme: 'dark' });
  assert.deepEqual(sent[0].params, { theme: 'dark' });
});
