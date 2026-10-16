import { DomainError } from '../domain/errors.js';

// iCalendar (RFC 5545) reader for fixed events. Pure text in, plain data out: no file or network access.
// Times with a TZID or no zone are taken as the wall-clock time written in the file; a trailing Z is converted to the device's local time.
const DAY = 1440;
const dayNumber = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
const dayLabel = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const weekday = (n) => new Date(n * 86400000).getUTCDay();

const unfold = (text) => text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
const unescapeText = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim();

function readProps(lines) {
  const props = [];
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const [name, ...params] = line.slice(0, i).split(';');
    props.push({ name: name.toUpperCase(), params: Object.fromEntries(params.map((p) => p.split('=')).map(([k, v]) => [k.toUpperCase(), (v ?? '').toUpperCase()])), value: line.slice(i + 1) });
  }
  return props;
}

// -> { allDay, day, minute } where day is a day number and minute is minutes since midnight (local)
function readStamp(prop) {
  const v = prop.value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m[4] === undefined || prop.params.VALUE === 'DATE') return { allDay: true, day: dayNumber(y, mo, d), minute: 0 };
  if (m[7]) {
    const t = new Date(Date.UTC(y, mo - 1, d, Number(m[4]), Number(m[5])));
    return { allDay: false, day: dayNumber(t.getFullYear(), t.getMonth() + 1, t.getDate()), minute: t.getHours() * 60 + t.getMinutes() };
  }
  return { allDay: false, day: dayNumber(y, mo, d), minute: Number(m[4]) * 60 + Number(m[5]) };
}

function readDuration(value) {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value.trim());
  if (!m) return null;
  return (Number(m[1] ?? 0) * 7 + Number(m[2] ?? 0)) * DAY + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

function readRule(value) {
  const rule = Object.fromEntries(value.split(';').map((p) => p.split('=')).map(([k, v]) => [k.toUpperCase(), v ?? '']));
  return { freq: rule.FREQ, interval: Math.max(1, Number(rule.INTERVAL ?? 1)), count: rule.COUNT ? Number(rule.COUNT) : Infinity, until: rule.UNTIL ? readStamp({ value: rule.UNTIL, params: {} })?.day ?? Infinity : Infinity, byday: rule.BYDAY ? rule.BYDAY.split(',').map((x) => x.replace(/^[+-]?\d+/, '')) : null };
}

function occursOn(rule, startDay, day) {
  if (day < startDay || day > rule.until) return false;
  if (rule.freq === 'DAILY') return (day - startDay) % rule.interval === 0;
  if (rule.freq === 'WEEKLY') {
    const days = rule.byday ?? [WEEKDAYS[weekday(startDay)]];
    if (!days.includes(WEEKDAYS[weekday(day)])) return false;
    const monday = (n) => n - ((weekday(n) + 6) % 7);
    return ((monday(day) - monday(startDay)) / 7) % rule.interval === 0;
  }
  return false;
}

export function parseIcs(text, { date } = {}) {
  const lines = unfold(String(text));
  if (!lines.some((l) => /^BEGIN:VCALENDAR/i.test(l)) || !lines.some((l) => /^BEGIN:VEVENT/i.test(l))) {
    throw new DomainError('bad_calendar', 'That does not look like a calendar file. Export a .ics file from your calendar app and try again.');
  }
  const raw = [];
  let cur = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) cur = [];
    else if (/^END:VEVENT/i.test(line)) { if (cur) raw.push(readProps(cur)); cur = null; } else if (cur) cur.push(line);
  }
  const events = raw.map((props) => {
    const get = (n) => props.find((p) => p.name === n);
    const title = unescapeText(get('SUMMARY')?.value ?? '') || 'Untitled event';
    const start = get('DTSTART') ? readStamp(get('DTSTART')) : null;
    let length = null;
    if (start && get('DTEND')) { const e = readStamp(get('DTEND')); if (e) length = (e.day - start.day) * DAY + e.minute - start.minute; }
    else if (get('DURATION')) length = readDuration(get('DURATION').value);
    return { title, start, length, rule: get('RRULE') ? readRule(get('RRULE').value) : null, exdates: props.filter((p) => p.name === 'EXDATE').flatMap((p) => p.value.split(',').map((v) => readStamp({ value: v, params: {} })?.day)) };
  });

  const timed = events.filter((e) => e.start && !e.start.allDay);
  const chosenDay = date ? dayNumber(...date.split('-').map(Number)) : timed.length ? Math.min(...timed.map((e) => e.start.day)) : null;
  if (chosenDay === null || Number.isNaN(chosenDay)) {
    if (!date) throw new DomainError('bad_calendar', 'That calendar has no timed events. Export a .ics file with at least one event that has a start time.');
    throw new DomainError('bad_calendar', 'Please give the date like 2026-10-21.');
  }

  const out = [];
  const skipped = [];
  for (const e of events) {
    if (!e.start) { skipped.push({ title: e.title, reason: 'no start time' }); continue; }
    if (e.start.allDay) { if (e.start.day === chosenDay) skipped.push({ title: e.title, reason: 'all-day event, not a time block' }); continue; }
    if (e.rule && !['DAILY', 'WEEKLY'].includes(e.rule.freq)) { if (e.start.day <= chosenDay) skipped.push({ title: e.title, reason: 'repeat rule not supported (only daily and weekly)' }); continue; }
    if (e.length === null || e.length <= 0) { if (e.start.day === chosenDay) skipped.push({ title: e.title, reason: 'no end time' }); continue; }
    const hits = (d) => (e.rule ? occursOn(e.rule, e.start.day, d) && !e.exdates.includes(d) : d === e.start.day);
    for (const d of [chosenDay - 1, chosenDay]) {
      if (!hits(d)) continue;
      if (e.rule && Number.isFinite(e.rule.count)) {
        let n = 0;
        for (let x = e.start.day; x <= d; x += 1) if (occursOn(e.rule, e.start.day, x)) n += 1;
        if (n > e.rule.count) continue;
      }
      const from = d * DAY + e.start.minute;
      const to = from + e.length;
      const s = Math.max(from, chosenDay * DAY) - chosenDay * DAY;
      const f = Math.min(to, (chosenDay + 1) * DAY) - chosenDay * DAY;
      if (f > s) out.push({ title: e.title, start: s, end: f });
    }
  }
  return { date: dayLabel(chosenDay), events: out.sort((a, b) => a.start - b.start || a.end - b.end), skipped };
}
