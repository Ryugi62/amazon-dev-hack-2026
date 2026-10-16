import { createHash } from 'node:crypto';

// MCP JSON-RPC adapter (spec 2025-11-25). Pure: takes a message, returns a response or null.
export const PROTOCOL_VERSION = '2025-11-25';
export const CARD_MIME = 'text/html;profile=mcp-app';

const csp = { connectDomains: [], resourceDomains: [] }; // the card talks only to the host bridge
const evidenceSchema = {
  type: 'object',
  properties: { kind: { type: 'string', enum: ['photo', 'file', 'link', 'third_party'] }, ref: { type: 'string' } },
  required: ['kind', 'ref'],
};
const nowProp = { type: 'string', description: 'Optional simulated clock, HH:MM. Default: server clock.' };

const buildTools = (ui) => [
  { name: 'get_next_up', description: 'Answer "what should I do now?": the next planned block plus two previews, as one card.',
    inputSchema: { type: 'object', properties: { now: nowProp } }, _meta: ui,
    run: (s, a) => s.getNextUp({ now: a.now }) },
  { name: 'report_running_late', description: 'The user is late by N minutes: rebuild the rest of the day with zero overlaps; fixed blocks never move.',
    inputSchema: { type: 'object', properties: { minutes: { type: 'integer', minimum: 1, maximum: 240 }, now: nowProp }, required: ['minutes'] }, _meta: ui,
    run: (s, a) => s.reportRunningLate({ minutes: a.minutes, now: a.now }) },
  { name: 'complete_block', description: 'Mark a block done. Rejected unless evidence (photo, file, link, third_party) is supplied.',
    inputSchema: { type: 'object', properties: { block_id: { type: 'string' }, evidence: evidenceSchema }, required: ['block_id'] }, _meta: ui,
    run: (s, a) => s.completeBlock({ blockId: a.block_id, evidence: a.evidence }) },
  { name: 'skip_block', description: 'Skip a block. Skipped is never counted as done.',
    inputSchema: { type: 'object', properties: { block_id: { type: 'string' } }, required: ['block_id'] }, _meta: ui,
    run: (s, a) => s.skipBlock({ blockId: a.block_id }) },
  { name: 'add_block', description: 'Add a block (HH:MM start and end). Rejected if it overlaps an existing block.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, fixed: { type: 'boolean' } }, required: ['title', 'start', 'end'] }, _meta: ui,
    run: (s, a) => s.addBlock({ title: a.title, start: a.start, end: a.end, fixed: a.fixed }) },
  { name: 'get_today', description: "Today's blocks with status, overlap minutes and the honest-completion rate.",
    inputSchema: { type: 'object', properties: {} }, _meta: ui, run: (s) => s.getToday() },
  { name: 'get_rules', description: 'The three rules NextOne enforces.',
    inputSchema: { type: 'object', properties: {} }, _meta: ui, run: (s) => s.getRules() },
];

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function validateArgs(tool, args) {
  const props = tool.inputSchema.properties ?? {};
  for (const key of tool.inputSchema.required ?? []) if (args[key] === undefined) return `Missing argument "${key}"`;
  for (const [key, spec] of Object.entries(props)) {
    const v = args[key];
    if (v === undefined) continue;
    if (spec.type === 'integer' && !Number.isInteger(v)) return `"${key}" must be an integer`;
    if (spec.type === 'string' && typeof v !== 'string') return `"${key}" must be a string`;
    if (spec.type === 'boolean' && typeof v !== 'boolean') return `"${key}" must be a boolean`;
    if (spec.type === 'object' && (typeof v !== 'object' || v === null)) return `"${key}" must be an object`;
  }
  return null;
}

export function createMcpHandler({ service, cardHtml }) {
  // Versioned by content hash so a caching host refreshes the widget only when it changes (Alexa+ layout guide).
  const cardUri = `ui://nextone/card-${createHash('sha256').update(cardHtml).digest('hex').slice(0, 8)}.html`;
  const TOOLS = buildTools({ ui: { resourceUri: cardUri, csp } });
  return {
    cardUri,
    async handle(msg) {
      if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(msg?.id, -32600, 'Invalid Request');
      const isNotification = msg.id === undefined;
      if (isNotification) return null;
      const { id, method, params = {} } = msg;
      switch (method) {
        case 'initialize':
          return ok(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
            serverInfo: { name: 'nextone', title: 'NextOne day operator', version: '1.0.0' },
            instructions: 'Ask what is next, say when you are late, and give evidence to mark things done.',
          });
        case 'ping':
          return ok(id, {});
        case 'tools/list':
          return ok(id, { tools: TOOLS.map(({ run, ...t }) => t) });
        case 'tools/call': {
          const tool = TOOLS.find((t) => t.name === params.name);
          if (!tool) return err(id, -32602, `Unknown tool: ${params.name}`);
          const args = params.arguments ?? {};
          const bad = validateArgs(tool, args);
          if (bad) return err(id, -32602, bad);
          const r = tool.run(service, args);
          const text = r.ok ? `${r.card.title}. ${r.card.fields.join('. ')}.` : `${r.card.title}. ${r.error.message}`;
          const result = { content: [{ type: 'text', text }], structuredContent: r.ok ? { data: r.data, card: r.card } : { error: r.error, card: r.card } };
          if (!r.ok) result.isError = true;
          return ok(id, result);
        }
        case 'resources/list':
          return ok(id, { resources: [{ uri: cardUri, name: 'nextone-card', title: 'NextOne card', mimeType: CARD_MIME, _meta: { ui: { csp } } }] });
        case 'resources/read':
          if (params.uri !== cardUri) return err(id, -32002, `Resource not found: ${params.uri}`);
          return ok(id, { contents: [{ uri: cardUri, mimeType: CARD_MIME, text: cardHtml, _meta: { ui: { csp } } }] });
        default:
          return err(id, -32601, `Method not found: ${method}`);
      }
    },
  };
}
