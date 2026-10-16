import { formatHHMM } from '../domain/time.js';

const range = (b) => `${formatHHMM(b.start)}-${formatHHMM(b.end)}`;

export function card(title, fields, action) {
  return { title, fields: fields.slice(0, 2), action };
}

export function validateCard(c) {
  const problems = [];
  if (!c || typeof c.title !== 'string' || c.title.trim() === '') problems.push('title missing');
  if (!c || !Array.isArray(c.fields) || c.fields.length > 2) problems.push('fields must be an array of at most 2');
  if (!c || !c.action || typeof c.action.label !== 'string' || typeof c.action.tool !== 'string' || c.actions) problems.push('exactly one action required');
  return { ok: problems.length === 0, problems };
}

export const cards = {
  nextUp({ next, preview }) {
    if (!next) return card('All clear', ['Nothing planned for the rest of today'], { label: 'Add a block', tool: 'add_block' });
    const then = preview.map((b) => b.title).join(', ');
    return card(next.title, [range(next), then ? `Then: ${then}` : 'Last one today'], { label: "I'm running late", tool: 'report_running_late' });
  },
  rescheduled({ minutes, changes, overlapMinutes }) {
    const moved = changes.filter((c) => c.kind === 'moved').length;
    const deferred = changes.filter((c) => c.kind === 'deferred').length;
    const tail = deferred ? `, ${deferred} deferred` : '';
    return card(`Re-planned for ${minutes} min late`, [`${moved} moved${tail}`, `${overlapMinutes} overlaps`], { label: "What's next?", tool: 'get_next_up' });
  },
  completed(block) {
    return card(`Done: ${block.title}`, [`Proof: ${block.evidence.kind}`], { label: "What's next?", tool: 'get_next_up' });
  },
  skipped(block) {
    return card(`Skipped: ${block.title}`, ['Not counted as done'], { label: "What's next?", tool: 'get_next_up' });
  },
  added(block) {
    return card(`Added: ${block.title}`, [range(block), block.fixed ? 'Fixed' : 'Flexible'], { label: "What's next?", tool: 'get_next_up' });
  },
  today(blocks) {
    const open = blocks.filter((b) => b.status === 'planned').length;
    const done = blocks.filter((b) => b.status === 'done').length;
    return card('Today', [`${open} planned`, `${done} done with proof`], { label: "What's next?", tool: 'get_next_up' });
  },
  rules(rules) {
    return card('How NextOne works', [rules[0], rules[1]], { label: "What's next?", tool: 'get_next_up' });
  },
  failure(error) {
    const tool = error.code === 'evidence_required' ? 'complete_block' : 'get_next_up';
    const label = error.code === 'evidence_required' ? 'Add proof' : "What's next?";
    const title = error.code === 'evidence_required' ? 'Not recorded' : 'Could not do that';
    const field = error.code === 'evidence_required' ? 'Needs a photo, file, link or device signal' : error.message.slice(0, 90);
    return card(title, [field], { label, tool });
  },
};
