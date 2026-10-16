import { createBlock } from '../domain/schedule.js';
import { parseHHMM } from '../domain/time.js';

// Synthetic demo day. No personal data.
const rows = [
  ['study', 'Morning study', '08:30', '09:30', false],
  ['lecture', 'Data Structures lecture', '10:00', '11:30', true],
  ['lunch', 'Lunch', '12:00', '13:00', false],
  ['project', 'Project work', '13:30', '15:00', false],
  ['gym', 'Gym', '15:30', '16:30', false],
  ['groceries', 'Grocery run', '17:00', '18:00', false],
  ['dinner', 'Dinner with a friend', '19:00', '20:00', true],
  ['laundry', 'Laundry and tidy up', '20:30', '21:30', false],
];

export function demoDay() {
  return {
    date: 'demo',
    blocks: rows.map(([id, title, start, end, fixed]) => createBlock({ id, title, start: parseHHMM(start), end: parseHHMM(end), fixed })),
  };
}
