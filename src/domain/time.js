import { DomainError } from './errors.js';

export function parseHHMM(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!m) throw new DomainError('bad_time', 'Please give times like 14:30.');
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) throw new DomainError('bad_time', 'That time is not on the clock. Please give times like 14:30.');
  return h * 60 + min;
}

export function formatHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
