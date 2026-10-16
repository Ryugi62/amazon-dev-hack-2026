// Stand-in for the host LLM: maps an English utterance to one MCP tool call.
// The real Alexa+ host does this with a model; this rule set exists so the demo is reproducible offline.
export function parseUtterance(text, ctx = {}) {
  const t = String(text).trim();
  const low = t.toLowerCase();
  if (!t) return { reply: 'Say something like "what should I do now?"' };

  const late = /(\d+)\s*(?:min|mins|minutes|m)\b/.exec(low);
  if (/\blate\b|\bbehind\b|\bdelayed\b/.test(low)) {
    if (!late) return { reply: 'How many minutes late are you?' };
    return { tool: 'report_running_late', args: { minutes: Number(late[1]) } };
  }
  if (/\b(done|finished|completed|did it)\b/.test(low)) {
    if (!ctx.currentBlockId) return { reply: 'Ask "what should I do now?" first so I know which block you mean.' };
    const args = { block_id: ctx.currentBlockId };
    const photo = /photo\s+(\S+)/.exec(t);
    const link = /link\s+(https?:\/\/\S+)/.exec(t);
    const file = /file\s+(\S+)/.exec(t);
    const device = /(?:device|sensor|receipt)\s+(\S+)/.exec(t);
    if (photo) args.evidence = { kind: 'photo', ref: photo[1] };
    else if (link) args.evidence = { kind: 'link', ref: link[1] };
    else if (file) args.evidence = { kind: 'file', ref: file[1] };
    else if (device) args.evidence = { kind: 'third_party', ref: device[1] };
    return { tool: 'complete_block', args };
  }
  if (/\bskip\b/.test(low)) {
    if (!ctx.currentBlockId) return { reply: 'Ask "what should I do now?" first so I know which block to skip.' };
    return { tool: 'skip_block', args: { block_id: ctx.currentBlockId } };
  }
  const add = /add\s+(.+?)\s+from\s+(\d{1,2}:\d{2})\s+to\s+(\d{1,2}:\d{2})(\s+fixed)?/i.exec(t);
  if (add) return { tool: 'add_block', args: { title: add[1], start: add[2], end: add[3], fixed: Boolean(add[4]) } };
  if (/\b(what|whats|what's)\b.*\b(now|next)\b|\bwhat should i do\b|\bnext up\b/.test(low)) return { tool: 'get_next_up', args: {} };
  if (/\btoday\b|\bmy day\b|\bschedule\b/.test(low)) return { tool: 'get_today', args: {} };
  if (/\brules\b|\bhow does\b|\bhow do you work\b/.test(low)) return { tool: 'get_rules', args: {} };
  return { reply: 'I can answer "what should I do now?", handle "I\'m 40 minutes late", and mark things done when you give proof.' };
}
