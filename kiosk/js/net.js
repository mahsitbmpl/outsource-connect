/* Tablet <-> server: signed requests, server clock, queue upload. */
import { kv, queue } from './store.js';

const enc = new TextEncoder();
let creds = null, key = null;
// Server clock: anchored to performance.now(), so changing the tablet's clock cannot move punch times.
let anchor = null; // {serverMs, perfMs}
let lastOffset = 0;

export class NetError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

export async function loadCreds() {
  creds = await kv.get('creds');
  lastOffset = (await kv.get('clockOffset')) || 0;
  if (creds) key = await crypto.subtle.importKey('raw', enc.encode(creds.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return creds;
}
export async function saveCreds(c) { await kv.set('creds', c); return loadCreds(); }
export async function clearCreds() { await kv.del('creds'); creds = null; key = null; }
export const deviceId = () => (creds ? creds.deviceId : null);

/** Best estimate of the server's current time in ms. */
export function serverNow() {
  if (anchor) return anchor.serverMs + (performance.now() - anchor.perfMs);
  return Date.now() + lastOffset;
}
export const clockSynced = () => !!anchor;
function noteServerTime(iso, t0, t1) {
  const ms = Date.parse(iso);
  if (isNaN(ms)) return;
  const mid = (t0 + t1) / 2;
  anchor = { serverMs: ms + (t1 - t0) / 2, perfMs: t1 };
  lastOffset = Math.round(ms - (Date.now() - (performance.now() - mid)));
  kv.set('clockOffset', lastOffset);
}

function b64url(buf) {
  let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function post(body) {
  const url = (window.OSC_CONFIG || {}).apiUrl;
  if (!url || url.indexOf('https://') !== 0) throw new NetError('CONFIG', 'Server address missing in config.js');
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', cache: 'no-store' });
  } catch (e) { throw new NetError('NETWORK', 'Offline'); }
  const t1 = performance.now();
  let out;
  try { out = await res.json(); } catch (e) { throw new NetError('NETWORK', 'Bad reply'); }
  if (out.serverTime) noteServerTime(out.serverTime, t0, t1);
  if (!out.ok) throw new NetError(out.error.code, out.error.message);
  return out.data;
}

/** Unsigned call (only "ping", used to read the server clock before the first signed call). */
export const ping = () => post({ action: 'ping', data: {} });

/** Signed call: HMAC-SHA256 over deviceId, time, nonce, action and the exact payload text. */
export async function call(action, data) {
  if (!creds) throw new NetError('NO_DEVICE', 'Tablet not set up');
  if (!anchor) { try { await ping(); } catch (e) { /* use stored offset */ } }
  const payload = JSON.stringify(data || {});
  const ts = String(Math.round(serverNow()));
  const nonce = crypto.getRandomValues(new Uint32Array(4)).join('-');
  const msg = [creds.deviceId, ts, nonce, action, payload].join('\n');
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  return post({ action, device: { id: creds.deviceId, ts, nonce, sig }, payload });
}

// ---------- queue upload ----------
let flushing = false;
/** Sends queued punches / unrecognised photos / enroll messages. Idempotent: the server ignores ids it already has. */
export async function flush(onResult) {
  if (flushing || !creds) return;
  flushing = true;
  try {
    for (;;) {
      const items = await queue.all();
      if (!items.length) break;
      const punches = items.filter((i) => i.kind === 'punch').slice(0, 8);
      const other = items.filter((i) => i.kind !== 'punch').slice(0, 2);
      if (punches.length) {
        const r = await call('kiosk.punch', { punches: punches.map((p) => p.payload) });
        const done = r.results.filter((x) => x.done).map((x) => x.punchId);
        await queue.remove(done);
        if (onResult) onResult(r);
        if (done.length < punches.length) { await queue.bump(punches.map((p) => p.id).filter((id) => done.indexOf(id) < 0)); break; }
      }
      for (const it of other) {
        await call('kiosk.unrecognised', it.payload);
        await queue.remove([it.id]);
      }
      if (!punches.length && !other.length) break;
    }
  } finally { flushing = false; }
}
