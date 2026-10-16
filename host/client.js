// Minimal MCP client over Streamable HTTP (JSON responses). fetch is injectable so Node tests use the same code as the browser.
export class McpClient {
  constructor({ baseUrl = '', fetchImpl = (...a) => fetch(...a), log = () => {} } = {}) {
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
    this.log = log;
    this.sid = null;
    this.nextId = 1;
  }

  async #post(body) {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    if (this.sid) headers['mcp-session-id'] = this.sid;
    this.log({ dir: 'out', body });
    const res = await this.fetch(`${this.baseUrl}/mcp`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.status === 404 && body.method !== 'initialize') {
      this.sid = null;
      await this.initialize();
      return this.#post(body);
    }
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sid = sid;
    if (res.status === 202) return null;
    const json = await res.json();
    this.log({ dir: 'in', body: json });
    return json;
  }

  async initialize() {
    const r = await this.#post({ jsonrpc: '2.0', id: this.nextId++, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'simulated-alexa-plus-host', version: '1.0.0' } } });
    await this.#post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return r.result;
  }

  async listTools() {
    return (await this.#post({ jsonrpc: '2.0', id: this.nextId++, method: 'tools/list' })).result.tools;
  }

  async callTool(name, args) {
    const r = await this.#post({ jsonrpc: '2.0', id: this.nextId++, method: 'tools/call', params: { name, arguments: args } });
    if (r.error) throw new Error(r.error.message);
    return r.result;
  }

  async readResource(uri) {
    return (await this.#post({ jsonrpc: '2.0', id: this.nextId++, method: 'resources/read', params: { uri } })).result.contents[0];
  }
}
