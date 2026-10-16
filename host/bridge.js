// Host side of the MCP Apps postMessage bridge (spec 2026-01-26, @modelcontextprotocol/ext-apps 2.0.3).
// The widget (our card) sends ui/initialize; the host answers with hostContext, then pushes the tool result.
export const APPS_PROTOCOL_VERSION = '2026-01-26';

export function createBridge({ send, getHostContext, getToolResult }) {
  return {
    onWidgetMessage(m) {
      if (!m || m.jsonrpc !== '2.0') return;
      if (m.method === 'ui/initialize') {
        send({
          jsonrpc: '2.0',
          id: m.id,
          result: {
            protocolVersion: APPS_PROTOCOL_VERSION,
            hostInfo: { name: 'simulated-alexa-plus-host', version: '1.0.0' },
            hostCapabilities: { message: {} },
            hostContext: getHostContext(),
          },
        });
      } else if (m.method === 'ui/notifications/initialized') {
        const result = getToolResult();
        if (result) send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result });
      }
    },
    pushToolResult() {
      const result = getToolResult();
      if (result) send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: result });
    },
    hostContextChanged(partial) {
      send({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: partial });
    },
  };
}
