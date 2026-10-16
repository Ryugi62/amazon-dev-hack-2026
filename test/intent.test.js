import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUtterance } from '../host/intent.js';

test('what should I do now -> get_next_up', () => {
  assert.equal(parseUtterance('What should I do now?').tool, 'get_next_up');
  assert.equal(parseUtterance("what's next").tool, 'get_next_up');
});
test('"I\'m 40 minutes late" -> report_running_late with minutes 40', () => {
  const p = parseUtterance("I'm 40 minutes late");
  assert.equal(p.tool, 'report_running_late');
  assert.deepEqual(p.args, { minutes: 40 });
});
test('"I am running late" asks how many minutes, calls nothing', () => {
  const p = parseUtterance('I am running late');
  assert.equal(p.tool, undefined);
  assert.match(p.reply, /How many minutes/);
});
test('"I did it" -> complete_block with NO evidence (server must reject)', () => {
  const p = parseUtterance('I did it', { currentBlockId: 'study' });
  assert.equal(p.tool, 'complete_block');
  assert.equal(p.args.evidence, undefined);
});
test('"done, photo desk.jpg" -> evidence kind photo', () => {
  const p = parseUtterance('done, photo desk.jpg', { currentBlockId: 'study' });
  assert.deepEqual(p.args, { block_id: 'study', evidence: { kind: 'photo', ref: 'desk.jpg' } });
});
test('link and file evidence are parsed', () => {
  assert.equal(parseUtterance('finished link https://x.dev/a', { currentBlockId: 'a' }).args.evidence.kind, 'link');
  assert.equal(parseUtterance('finished file notes.pdf', { currentBlockId: 'a' }).args.evidence.kind, 'file');
});
test('done without a known current block asks to check what is next first', () => {
  assert.match(parseUtterance('I did it').reply, /what should I do now/);
});
test('add block parses title, times and fixed flag', () => {
  const p = parseUtterance('add Dentist from 14:00 to 14:30 fixed');
  assert.deepEqual(p.args, { title: 'Dentist', start: '14:00', end: '14:30', fixed: true });
});
test('gibberish and empty input give a help reply, never a tool call', () => {
  assert.equal(parseUtterance('asdf qwer').tool, undefined);
  assert.equal(parseUtterance('   ').tool, undefined);
});
