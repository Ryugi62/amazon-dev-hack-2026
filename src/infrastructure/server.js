import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, resolve } from 'node:path';
import { createService } from '../application/service.js';
import { createMcpHandler } from '../adapters/mcp.js';
import { fileStore } from './fileStore.js';
import { createEvidenceVerifier } from './evidenceVerifier.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const localOrigin = (origin, host) => {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.host === host || ['localhost', '127.0.0.1'].includes(u.hostname);
  } catch {
    return false;
  }
};

export async function startServer({ port = 3000, storePath = join(root, '.data', 'state.json'), clock, evidenceDir = process.env.NEXTONE_EVIDENCE_DIR ?? join(root, 'samples', 'evidence'), verifyEvidence = createEvidenceVerifier({ evidenceDir }) } = {}) {
  const service = createService({ store: fileStore(storePath), clock, verifyEvidence });
  const cardHtml = readFileSync(join(root, 'src', 'adapters', 'card.html'), 'utf8');
  const mcp = createMcpHandler({ service, cardHtml });
  const sessions = new Set();

  const send = (res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
  const sendJson = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), { 'content-type': 'application/json', ...headers });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/mcp') {
      if (!localOrigin(req.headers.origin, req.headers.host)) return send(res, 403, 'Forbidden origin');
      if (req.method !== 'POST') return send(res, 405, 'Method Not Allowed', { allow: 'POST' });
      let msg;
      try {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        msg = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      }
      const headers = {};
      if (msg.method === 'initialize') {
        const sid = randomUUID();
        sessions.add(sid);
        headers['mcp-session-id'] = sid;
      } else {
        const sid = req.headers['mcp-session-id'];
        if (!sid) return sendJson(res, 400, { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32600, message: 'Mcp-Session-Id required' } });
        if (!sessions.has(sid)) return sendJson(res, 404, { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32600, message: 'Unknown session' } });
      }
      const out = await mcp.handle(msg);
      if (out === null) return send(res, 202, '');
      return sendJson(res, 200, out, headers);
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/host/'))) {
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice('/host/'.length);
      const file = normalize(join(root, 'host', rel));
      const ext = file.slice(file.lastIndexOf('.'));
      if (!file.startsWith(join(root, 'host') + '/') || !TYPES[ext] || !existsSync(file)) return send(res, 404, 'Not found');
      return send(res, 200, readFileSync(file), { 'content-type': TYPES[ext] });
    }
    return send(res, 404, 'Not found');
  });

  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startServer({ port: Number(process.env.PORT ?? 3000) });
  console.log(`NextOne MCP server: ${s.url}/mcp   simulated host: ${s.url}/`);
}
