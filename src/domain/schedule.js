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

const NEXT_STEP = {
  link: 'Check that the link opens, then say it again.',
  photo: 'Put the photo in the evidence folder, then say it again.',
  file: 'Put the file in the evidence folder, then say it again.',
  third_party: 'Send a reference the sensor, device or receipt gave you, then say it again.',
};

// `verification` is the outcome of checking the ref (made by an adapter; the domain does no I/O).
// undefined = no verifier configured (shape check only); otherwise ok must be true.
export function completeBlock(blocks, id, evidence, verification) {
  const block = find(blocks, id);
  if (block.status !== 'planned') throw new DomainError('not_planned', `${block.title} is already ${block.status}.`);
  if (!isValidEvidence(evidence)) {
    throw new DomainError('evidence_required', 'Done needs proof: a photo, a file, a link or a third_party signal. Saying it out loud is not proof.');
  }
  if (verification !== undefined && !verification.ok) {
    throw new DomainError('evidence_unverified', `Not confirmed: ${verification.reason ?? 'the proof could not be checked'}. ${NEXT_STEP[evidence.kind]}`);
  }
  const stored = { kind: evidence.kind, ref: evidence.ref.trim() };
  if (verification !== undefined) {
    const { ok, reason, ...facts } = verification;
    stored.verified = facts;
  }
  return blocks.map((b) => (b.id === id ? { ...b, status: 'done', evidence: stored } : b));
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

// Fixed events imported from a calendar become fixed blocks. Events that overlap an earlier one are
// dropped and reported, because a fixed block can never move and two of them on the same minutes would break the zero-overlap rule.
export function fixedBlocksFromEvents(events) {
  const ordered = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const blocks = [];
  const rejected = [];
  for (const ev of ordered) {
    const clash = blocks.find((b) => b.start < ev.end && ev.start < b.end);
    if (clash) { rejected.push({ title: ev.title, reason: `overlaps ${clash.title}` }); continue; }
    const id = `cal${blocks.length + 1}-${String(ev.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}`;
    blocks.push(createBlock({ id, title: ev.title, start: ev.start, end: ev.end, fixed: true }));
  }
  return { blocks, rejected };
}
