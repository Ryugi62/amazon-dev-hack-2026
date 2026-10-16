import { DomainError } from './errors.js';

export { DomainError };

const DAY_END = 1440;
export const EVIDENCE_KINDS = ['photo', 'file', 'link', 'third_party'];
export const MAX_LATE_MINUTES = 240;

export function createBlock({ id, title, start, end, fixed = false, status = 'planned', evidence = null }) {
  if (!id || !title) throw new DomainError('bad_block', 'Please give the item a name.');
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > DAY_END || end <= start) {
    throw new DomainError('bad_block', 'Please give a start and end time within one day, like 14:00 to 14:30.');
  }
  return { id, title, start, end, fixed: Boolean(fixed), status, evidence };
}

const sorted = (blocks) => [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);

export function overlapMinutes(blocks) {
  const marks = new Map();
  for (const b of blocks) {
    if (b.status === 'deferred' || b.status === 'skipped') continue;
    for (let t = b.start; t < b.end; t += 1) marks.set(t, (marks.get(t) ?? 0) + 1);
  }
  let total = 0;
  for (const n of marks.values()) if (n > 1) total += 1;
  return total;
}

export function addBlock(blocks, block) {
  if (blocks.some((b) => b.id === block.id)) throw new DomainError('duplicate_id', 'That item is already on the plan.');
  const clash = blocks.find((b) => (b.status === 'planned' || b.status === 'done') && b.start < block.end && block.start < b.end);
  if (clash) throw new DomainError('overlap', `${block.title} would overlap ${clash.title}. Pick another time.`);
  return sorted([...blocks, block]);
}

export function nextUp(blocks, now) {
  const open = sorted(blocks).filter((b) => b.status === 'planned' && b.end > now);
  return { next: open[0] ?? null, preview: open.slice(1, 3) };
}

export function runLate(blocks, now, minutes, dayEnd = DAY_END) {
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_LATE_MINUTES) {
    throw new DomainError('bad_minutes', `Tell me a number of minutes between 1 and ${MAX_LATE_MINUTES}.`);
  }
  const ordered = sorted(blocks).map((b) => ({ ...b }));
  const queue = ordered.filter((b) => b.status === 'planned' && b.end > now);
  const target = queue[0];
  if (!target) throw new DomainError('nothing_to_move', 'Nothing is left on today\'s plan to move.');
  if (target.fixed) throw new DomainError('fixed_block', `${target.title} is fixed, so I cannot move it.`);

  const fixedAhead = queue.filter((b) => b.fixed);
  const changes = [];
  let cursor = target.start + minutes;
  for (const b of queue) {
    if (b.fixed) continue;
    const duration = b.end - b.start;
    let start = Math.max(b.start, cursor);
    let moved = true;
    while (moved) {
      moved = false;
      for (const f of fixedAhead) {
        if (start < f.end && f.start < start + duration) {
          start = f.end;
          moved = true;
        }
      }
    }
    const from = { start: b.start, end: b.end };
    if (start + duration > dayEnd) {
      b.status = 'deferred';
      changes.push({ id: b.id, kind: 'deferred', from, to: null });
      continue;
    }
    b.start = start;
    b.end = start + duration;
    cursor = b.end;
    if (from.start !== b.start) changes.push({ id: b.id, kind: 'moved', from, to: { start: b.start, end: b.end } });
  }
  return { blocks: sorted(ordered), changes };
}

export function isValidEvidence(evidence) {
  return Boolean(evidence) && EVIDENCE_KINDS.includes(evidence.kind) && typeof evidence.ref === 'string' && evidence.ref.trim().length > 0;
}

function find(blocks, id) {
  const block = blocks.find((b) => b.id === id);
  if (!block) throw new DomainError('not_found', 'I could not find that on today\'s plan.');
  return block;
}

export function completeBlock(blocks, id, evidence) {
  const block = find(blocks, id);
  if (block.status !== 'planned') throw new DomainError('not_planned', `${block.title} is already ${block.status}.`);
  if (!isValidEvidence(evidence)) {
    throw new DomainError('evidence_required', 'Done needs proof: a photo, a file, a link or a third_party signal. Saying it out loud is not proof.');
  }
  return blocks.map((b) => (b.id === id ? { ...b, status: 'done', evidence: { kind: evidence.kind, ref: evidence.ref.trim() } } : b));
}

export function skipBlock(blocks, id) {
  const block = find(blocks, id);
  if (block.status !== 'planned') throw new DomainError('not_planned', `${block.title} is already ${block.status}.`);
  return blocks.map((b) => (b.id === id ? { ...b, status: 'skipped' } : b));
}

export function honestCompletionRate(blocks) {
  const done = blocks.filter((b) => b.status === 'done');
  if (done.length === 0) return 1;
  return done.filter((b) => isValidEvidence(b.evidence)).length / done.length;
}
