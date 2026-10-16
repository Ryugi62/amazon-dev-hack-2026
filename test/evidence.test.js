import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createService } from '../src/application/service.js';
import { memoryStore } from '../src/infrastructure/memoryStore.js';
import { createEvidenceVerifier } from '../src/infrastructure/evidenceVerifier.js';
import { completeBlock, createBlock, honestCompletionRate } from '../src/domain/schedule.js';

const localServer = async () => {
  const hits = [];
  const s = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    if (req.url === '/ok') { res.writeHead(200); return res.end('hi'); }
    if (req.url === '/head-not-allowed') { res.writeHead(req.method === 'HEAD' ? 405 : 200); return res.end('hi'); }
    if (req.url === '/slow') return setTimeout(() => { res.writeHead(200); res.end('late'); }, 1500);
    res.writeHead(404); res.end('no');
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${s.address().port}`, hits, close: () => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }) };
};
const dir = () => { const d = mkdtempSync(join(tmpdir(), 'nextone-ev-')); return d; };

test('link: HTTP 200 is confirmed and the status is recorded', async () => {
  const srv = await localServer();
  try {
    const v = await createEvidenceVerifier({ evidenceDir: dir() })({ kind: 'link', ref: `${srv.base}/ok` });
    assert.equal(v.ok, true);
    assert.equal(v.httpStatus, 200);
    assert.equal(v.status, 'confirmed');
  } finally { await srv.close(); }
});
test('link: 404 is not confirmed', async () => {
  const srv = await localServer();
  try {
    const v = await createEvidenceVerifier({ evidenceDir: dir() })({ kind: 'link', ref: `${srv.base}/missing` });
    assert.equal(v.ok, false);
    assert.match(v.reason, /404/);
  } finally { await srv.close(); }
});
test('link: HEAD refused (405) falls back to GET', async () => {
  const srv = await localServer();
  try {
    const v = await createEvidenceVerifier({ evidenceDir: dir() })({ kind: 'link', ref: `${srv.base}/head-not-allowed` });
    assert.equal(v.ok, true);
    assert.deepEqual(srv.hits, ['HEAD /head-not-allowed', 'GET /head-not-allowed']);
  } finally { await srv.close(); }
});
test('link: timeout and connection failure are "not confirmed", never a pass', async () => {
  const srv = await localServer();
  try {
    const verify = createEvidenceVerifier({ evidenceDir: dir(), timeoutMs: 200 });
    const slow = await verify({ kind: 'link', ref: `${srv.base}/slow` });
    assert.equal(slow.ok, false);
    assert.match(slow.reason, /timed out|did not answer/);
    const base = srv.base;
    await srv.close();
    const down = await verify({ kind: 'link', ref: `${base}/ok` });
    assert.equal(down.ok, false);
  } finally { await srv.close().catch(() => {}); }
});
test('link: a ref that is not an http(s) URL is rejected', async () => {
  const verify = createEvidenceVerifier({ evidenceDir: dir() });
  assert.equal((await verify({ kind: 'link', ref: 'ftp://x.y/z' })).ok, false);
  assert.equal((await verify({ kind: 'link', ref: 'not a url' })).ok, false);
});
test('file and photo: existing file in the evidence folder is hashed (sha256, bytes)', async () => {
  const d = dir();
  writeFileSync(join(d, 'desk.jpg'), 'pixels');
  const verify = createEvidenceVerifier({ evidenceDir: d });
  const v = await verify({ kind: 'photo', ref: 'desk.jpg' });
  assert.equal(v.ok, true);
  assert.equal(v.bytes, 6);
  assert.equal(v.sha256, createHash('sha256').update('pixels').digest('hex'));
  assert.equal((await verify({ kind: 'file', ref: 'desk.jpg' })).ok, true);
});
test('file: missing, empty, directory and path escape are not confirmed', async () => {
  const d = dir();
  writeFileSync(join(d, 'empty.txt'), '');
  mkdirSync(join(d, 'sub'));
  const verify = createEvidenceVerifier({ evidenceDir: d });
  for (const ref of ['nope.jpg', 'empty.txt', 'sub', '../../etc/passwd', '/etc/passwd']) {
    const v = await verify({ kind: 'file', ref });
    assert.equal(v.ok, false, ref);
  }
});
test('third_party: recorded as a reference that the server cannot open (said plainly)', async () => {
  const v = await createEvidenceVerifier({ evidenceDir: dir() })({ kind: 'third_party', ref: 'receipt-123' });
  assert.equal(v.ok, true);
  assert.equal(v.status, 'reference_only');
});

test('domain: completeBlock with a failed verification is rejected with a next step; block stays planned', () => {
  const day = [createBlock({ id: 'a', title: 'A', start: 540, end: 600 })];
  assert.throws(
    () => completeBlock(day, 'a', { kind: 'link', ref: 'https://x.y' }, { ok: false, reason: 'the link answered 404' }),
    (e) => e.code === 'evidence_unverified' && /404/.test(e.message) && /again/.test(e.message),
  );
  assert.equal(day[0].status, 'planned');
});
test('domain: verified evidence stores sha256, bytes and status with the block', () => {
  const day = [createBlock({ id: 'a', title: 'A', start: 540, end: 600 })];
  const out = completeBlock(day, 'a', { kind: 'photo', ref: 'd.jpg' }, { ok: true, status: 'confirmed', bytes: 3, sha256: 'ab', checkedAt: '2026-10-17T00:00:00Z' });
  assert.deepEqual(out[0].evidence.verified, { status: 'confirmed', bytes: 3, sha256: 'ab', checkedAt: '2026-10-17T00:00:00Z' });
  assert.equal(honestCompletionRate(out), 1);
});

test('service: with a verifier, a dead link leaves the block planned and the card says what to do', async () => {
  const srv = await localServer();
  try {
    const s = createService({ store: memoryStore(), verifyEvidence: createEvidenceVerifier({ evidenceDir: dir() }) });
    const id = s.getNextUp({ now: '08:00' }).data.next.id;
    const bad = await s.completeBlock({ blockId: id, evidence: { kind: 'link', ref: `${srv.base}/missing` } });
    assert.equal(bad.ok, false);
    assert.equal(bad.error.code, 'evidence_unverified');
    assert.equal(bad.card.title, 'Not recorded');
    assert.match(bad.card.fields[0], /not confirmed|Not confirmed/i);
    assert.equal(s.getToday().data.blocks.find((b) => b.id === id).status, 'planned');
    const good = await s.completeBlock({ blockId: id, evidence: { kind: 'link', ref: `${srv.base}/ok` } });
    assert.equal(good.ok, true);
    assert.equal(good.data.block.evidence.verified.httpStatus, 200);
  } finally { await srv.close(); }
});
test('service: no evidence is still rejected before any I/O', async () => {
  let called = 0;
  const s = createService({ store: memoryStore(), verifyEvidence: async () => { called += 1; return { ok: true, status: 'confirmed' }; } });
  const r = await s.completeBlock({ blockId: 'study' });
  assert.equal(r.error.code, 'evidence_required');
  assert.equal(called, 0);
});
