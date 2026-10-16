import { McpClient } from './client.js';
import { runTurn, runImport } from './session.js';
import { createBridge } from './bridge.js';

const $ = (id) => document.getElementById(id);
const rpc = $('rpc');
const client = new McpClient({ log: (e) => { rpc.textContent += `${e.dir === 'out' ? '>>' : '<<'} ${JSON.stringify(e.body)}\n`; rpc.scrollTop = rpc.scrollHeight; } });
const ctx = { now: $('simnow').value, currentBlockId: null };
let cardHtml = '';

function say(cls, text) {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  $('chat').appendChild(d);
  $('chat').scrollTop = $('chat').scrollHeight;
}

let lastResult = null;
const bridge = createBridge({
  send: (m) => $('cardframe').contentWindow.postMessage(m, '*'),
  getHostContext: () => ({ theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', deviceClass: $('device').value, displayMode: 'inline', platform: 'web' }),
  getToolResult: () => lastResult,
});
window.addEventListener('message', (e) => { if (e.source === $('cardframe').contentWindow) bridge.onWidgetMessage(e.data); });
$('device').addEventListener('change', () => bridge.hostContextChanged({ deviceClass: $('device').value }));

function showCard(result) {
  lastResult = result;
  const frame = $('cardframe');
  if (frame.dataset.ready) bridge.pushToolResult();
  else { frame.srcdoc = cardHtml; frame.dataset.ready = '1'; }
}

async function send(text) {
  ctx.now = $('simnow').value.trim() || undefined;
  say('me', text);
  try {
    const turn = await runTurn(client, ctx, text);
    say('bot', turn.reply);
    if (turn.card) showCard({ structuredContent: { card: turn.card } });
  } catch (e) {
    say('bot', `Error: ${e.message}`);
  }
}

$('form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('utterance').value; $('utterance').value = ''; if (v.trim()) send(v); });
$('icsfile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  say('me', `Import calendar: ${file.name}`);
  try {
    const turn = await runImport(client, await file.text());
    say('bot', turn.reply);
    if (turn.card) showCard({ structuredContent: { card: turn.card } });
  } catch (err) {
    say('bot', `Error: ${err.message}`);
  }
  e.target.value = '';
});
document.querySelectorAll('.chips button').forEach((b) => b.addEventListener('click', () => send(b.dataset.say)));

(async () => {
  await client.initialize();
  await client.listTools();
  const tools = await client.listTools();
  cardHtml = (await client.readResource(tools[0]._meta.ui.resourceUri)).text;
  say('bot', 'Connected to the NextOne MCP server. Ask me what is next.');
})().catch((e) => say('bot', `Could not reach the server: ${e.message}`));
