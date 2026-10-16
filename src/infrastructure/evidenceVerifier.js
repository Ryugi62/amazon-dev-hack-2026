import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

// Port implementation: checks what an evidence ref really points to.
//  link        -> HTTP HEAD (GET if HEAD is refused); only status 200 counts
//  photo/file  -> a non-empty regular file inside the evidence folder; size and sha256 are recorded
//  third_party -> a sensor/device/receipt id cannot be opened by this server; recorded as reference_only
const no = (reason) => ({ ok: false, reason });

async function checkLink(ref, timeoutMs) {
  let url;
  try { url = new URL(ref); } catch { return no('that link is not a web address'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return no('only http or https links can be checked');
  const ask = async (method) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, signal: ctl.signal, redirect: 'follow' });
      await res.body?.cancel();
      return res.status;
    } finally { clearTimeout(timer); }
  };
  try {
    let status = await ask('HEAD');
    if (status === 405 || status === 501) status = await ask('GET');
    if (status !== 200) return no(`the link answered ${status}, not 200`);
    return { ok: true, status: 'confirmed', httpStatus: status, checkedAt: new Date().toISOString() };
  } catch (e) {
    return no(e?.name === 'AbortError' ? 'the link timed out and did not answer in time' : 'the link did not answer');
  }
}

function sha256Of(path) {
  return new Promise((ok, fail) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (c) => h.update(c)).on('end', () => ok(h.digest('hex'))).on('error', fail);
  });
}

async function checkFile(ref, evidenceDir) {
  const root = resolve(evidenceDir);
  const full = resolve(root, ref);
  const rel = relative(root, full);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return no('that file is outside the evidence folder');
  let st;
  try { st = statSync(full); } catch { return no('no such file in the evidence folder'); }
  if (!st.isFile()) return no('that is not a file');
  if (st.size === 0) return no('that file is empty');
  try {
    return { ok: true, status: 'confirmed', bytes: st.size, sha256: await sha256Of(full), checkedAt: new Date().toISOString() };
  } catch { return no('that file could not be read'); }
}

export function createEvidenceVerifier({ evidenceDir, timeoutMs = 400 }) {
  return async function verify(evidence) {
    const ref = evidence.ref.trim();
    if (evidence.kind === 'link') return checkLink(ref, timeoutMs);
    if (evidence.kind === 'photo' || evidence.kind === 'file') return checkFile(ref, evidenceDir);
    if (evidence.kind === 'third_party') return { ok: true, status: 'reference_only', checkedAt: new Date().toISOString() };
    return no('unknown kind of proof');
  };
}
