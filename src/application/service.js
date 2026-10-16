import { DomainError, addBlock, completeBlock, createBlock, honestCompletionRate, nextUp, overlapMinutes, runLate, skipBlock } from '../domain/schedule.js';
import { parseHHMM } from '../domain/time.js';
import { demoDay } from './demoDay.js';
import { cards } from './presenter.js';

export const RULES = [
  'No overlaps: a re-plan never leaves two blocks on the same minutes.',
  'Fixed blocks never move; flexible ones jump past them.',
  'Done needs evidence (photo, file, link or device signal). Saying "I did it" is not evidence.',
];

const realClock = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export function createService({ store, userId = 'demo', clock = realClock }) {
  const load = () => store.load(userId) ?? demoDay();
  const save = (state) => store.save(userId, state);
  const at = (now) => (now === undefined ? clock() : typeof now === 'number' ? now : parseHHMM(now));

  const guard = (fn) => {
    try {
      return fn();
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      return { ok: false, error: { code: e.code, message: e.message }, card: cards.failure(e) };
    }
  };

  return {
    getNextUp({ now } = {}) {
      return guard(() => {
        const data = nextUp(load().blocks, at(now));
        return { ok: true, data, card: cards.nextUp(data) };
      });
    },
    reportRunningLate({ minutes, now } = {}) {
      return guard(() => {
        const state = load();
        const result = runLate(state.blocks, at(now), minutes);
        save({ ...state, blocks: result.blocks });
        const data = { minutes, changes: result.changes, overlapMinutes: overlapMinutes(result.blocks) };
        return { ok: true, data, card: cards.rescheduled(data) };
      });
    },
    completeBlock({ blockId, evidence } = {}) {
      return guard(() => {
        const state = load();
        const blocks = completeBlock(state.blocks, blockId, evidence);
        save({ ...state, blocks });
        const block = blocks.find((b) => b.id === blockId);
        return { ok: true, data: { block, honestCompletionRate: honestCompletionRate(blocks) }, card: cards.completed(block) };
      });
    },
    skipBlock({ blockId } = {}) {
      return guard(() => {
        const state = load();
        const blocks = skipBlock(state.blocks, blockId);
        save({ ...state, blocks });
        const block = blocks.find((b) => b.id === blockId);
        return { ok: true, data: { block }, card: cards.skipped(block) };
      });
    },
    addBlock({ title, start, end, fixed = false } = {}) {
      return guard(() => {
        const state = load();
        const id = `b${state.blocks.length + 1}-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}`;
        const block = createBlock({ id, title, start: parseHHMM(start), end: parseHHMM(end), fixed });
        const blocks = addBlock(state.blocks, block);
        save({ ...state, blocks });
        return { ok: true, data: { block }, card: cards.added(block) };
      });
    },
    getToday() {
      return guard(() => {
        const { blocks } = load();
        return { ok: true, data: { blocks, overlapMinutes: overlapMinutes(blocks), honestCompletionRate: honestCompletionRate(blocks) }, card: cards.today(blocks) };
      });
    },
    getRules() {
      return { ok: true, data: { rules: RULES }, card: cards.rules(RULES) };
    },
  };
}
