import { parseUtterance } from './intent.js';

// One conversational turn: utterance -> tool call -> spoken reply + card.
export async function runTurn(client, ctx, text) {
  const plan = parseUtterance(text, ctx);
  if (!plan.tool) return { reply: plan.reply, card: null, tool: null };
  const args = { ...plan.args };
  if (ctx.now && ['get_next_up', 'report_running_late'].includes(plan.tool)) args.now = ctx.now;
  const result = await client.callTool(plan.tool, args);
  const sc = result.structuredContent;
  if (plan.tool === 'get_next_up' && !result.isError) ctx.currentBlockId = sc.data.next ? sc.data.next.id : null;
  return { reply: result.content[0].text, card: sc.card, tool: plan.tool, args, isError: Boolean(result.isError) };
}
