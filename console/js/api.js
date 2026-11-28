/* API client for the Apps Script web app.
 * Speed (v6.1):
 *  - reads asked for at about the same time travel together in ONE request ("batch"), so Google's start-up wait is paid once;
 *  - pages you have opened are remembered in this browser (also after closing it) and drawn at once, then refreshed quietly;
 *  - after you save something, remembered pages wait up to 2.5 s for fresh data so you never see the old state of your own change.
 */
const KEY = 'osc.session';

export const session = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
  set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } },
  clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
};

/** Last request timing, shown in the user menu: total wait vs. time our server code used. */
export const timing = { last: null };

export class ApiError extends Error {
  constructor(code, message, fields) { super(message); this.code = code; this.fields = fields || null; }
}

let onAuthLost = () => {};
export function setAuthLostHandler(fn) { onAuthLost = fn; }

function apiUrl() {
  const url = (window.OSC_CONFIG || {}).apiUrl;
  if (!url || url.indexOf('script.google.com') < 0) throw new ApiError('CONFIG', 'The server address is not set. Put the Apps Script web app URL in config.js.');
  return url;
}
async function post(body) {
  const url = apiUrl();
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
  } catch (e) {
    throw new ApiError('NETWORK', navigator.onLine ? 'Could not reach the server. Check the internet and try again.' : 'You are offline. Connect to the internet and try again.');
  }
  try { return await res.json(); } catch (e) { throw new ApiError('NETWORK', 'The server sent an unexpected reply. If you just deployed, check the web app access is set to "Anyone".'); }
}
function toError(action, e) {
  const err = new ApiError(e.code, e.message, e.fields);
  if (action !== 'auth.login' && action !== 'auth.changePassword') {
    if (err.code === 'AUTH') { session.clear(); clearRemembered(); onAuthLost(err); }
    if (err.code === 'MUST_CHANGE_PASSWORD') onAuthLost(err);
  }
  return err;
}

/** One action, sent on its own (used for every save). */
export async function api(action, data) {
  const s = session.get();
  const t0 = performance.now();
  const body = await post({ action, data: data || {}, token: s ? s.token : undefined });
  timing.last = { action, totalMs: Math.round(performance.now() - t0), serverMs: body.ms || 0, cached: !!body.cached };
  if (body.ok && READS.indexOf(action) < 0 && action !== 'meta.bootstrap') markAllStale(); // something was saved
  if (body.ok) return body.data;
  throw toError(action, body.error);
}

// ---------- reads travel together ----------
const READS = ['staff.list', 'staff.get', 'companies.list', 'companies.get', 'departments.list', 'users.list', 'users.loginLog', 'settings.list',
  'audit.recent', 'punches.byDate', 'punches.range', 'duties.list', 'exceptions.list', 'rules.list', 'dashboard', 'penalties.list', 'deductions.list', 'decide.list',
  'unrecognised.list', 'devices.list', 'home.summary', 'face.thumb', 'face.summary', 'month.status', 'month.preview', 'month.bills', 'month.compare', 'meta.reasonCodes'];
let waiting = [], timer = null;
function read(action, data) {
  return new Promise((resolve, reject) => {
    waiting.push({ action, data: data || {}, resolve, reject });
    if (waiting.length >= 12) sendWaiting();
    else if (!timer) timer = setTimeout(sendWaiting, 15);
  });
}
async function sendWaiting() {
  clearTimeout(timer); timer = null;
  const list = waiting; waiting = [];
  if (!list.length) return;
  if (list.length === 1) { const x = list[0]; api(x.action, x.data).then(x.resolve, x.reject); return; }
  const s = session.get(), t0 = performance.now();
  try {
    const body = await post({ action: 'batch', items: list.map((x) => ({ action: x.action, data: x.data })), token: s ? s.token : undefined });
    timing.last = { action: list.length + ' pages together', totalMs: Math.round(performance.now() - t0), serverMs: body.ms || 0 };
    if (!body.ok) { const err = toError('batch', body.error); list.forEach((x) => x.reject(err)); return; }
    list.forEach((x, i) => { const r = body.data[i]; if (r && r.ok) x.resolve(r.data); else x.reject(toError(x.action, (r && r.error) || { code: 'INTERNAL', message: 'No answer' })); });
  } catch (e) { list.forEach((x) => x.reject(e)); }
}

// ---------- remembered page data (memory + this browser's storage) ----------
const STORE = 'osc.rc:', INDEX = 'osc.rc.index', WROTE = 'osc.rc.wroteAt', BUDGET = 3500000;
const memo = new Map(), inflight = new Map();
let onStale = () => {};
export function setStaleHandler(fn) { onStale = fn; }
function who() { const s = session.get(); return s && s.user ? s.user.username : ''; }
function wroteAt() { try { return Number(localStorage.getItem(WROTE) || 0); } catch (e) { return 0; } }
function markAllStale() {
  memo.forEach((v) => { v.stale = true; });
  try { localStorage.setItem(WROTE, String(Date.now())); } catch (e) { /* ignore */ }
}
function stored(key) {
  try {
    const raw = localStorage.getItem(STORE + key); if (!raw) return null;
    const v = JSON.parse(raw);
    // older than a save made in the last minute (e.g. save, then page reload), or older than 12 hours: wait briefly for fresh data
    const w = wroteAt();
    v.stale = (v.at < w && Date.now() - w < 60000) || Date.now() - v.at > 12 * 3600000;
    return v;
  } catch (e) { return null; }
}
function keep(key, data) {
  const v = { at: Date.now(), data };
  memo.set(key, v);
  try {
    const raw = JSON.stringify(v);
    if (raw.length > 600000) return;
    let idx = JSON.parse(localStorage.getItem(INDEX) || '[]').filter((k) => k !== key);
    idx.push(key);
    let total = idx.reduce((a, k) => a + (k === key ? raw.length : (localStorage.getItem(STORE + k) || '').length), 0);
    while (total > BUDGET && idx.length > 1) { const old = idx.shift(); total -= (localStorage.getItem(STORE + old) || '').length; localStorage.removeItem(STORE + old); }
    localStorage.setItem(STORE + key, raw);
    localStorage.setItem(INDEX, JSON.stringify(idx));
  } catch (e) { /* storage full or blocked: memory only */ }
}
export function clearRemembered() {
  memo.clear();
  try { JSON.parse(localStorage.getItem(INDEX) || '[]').forEach((k) => localStorage.removeItem(STORE + k)); localStorage.removeItem(INDEX); } catch (e) { /* ignore */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function apiFast(action, data) {
  const key = who() + ' ' + action + ' ' + JSON.stringify(data || {});
  const hit = memo.get(key) || stored(key);
  // the same page already on its way (e.g. clicked while the background loading runs): share that request
  let fresh = inflight.get(key);
  if (!fresh) {
    fresh = read(action, data).then((d) => {
      const changed = !hit || JSON.stringify(hit.data) !== JSON.stringify(d);
      keep(key, d);
      if (hit && changed && !hit.waited) onStale(action);
      return d;
    }).finally(() => inflight.delete(key));
    inflight.set(key, fresh);
  }
  if (!hit) return fresh;
  fresh.catch(() => {});
  if (!hit.stale) return hit.data;
  // after a save (or a day later): wait a moment for the fresh answer, otherwise show the old one and update when it arrives
  hit.waited = true;
  const r = await Promise.race([fresh.then((d) => ({ d }), () => null), sleep(2500).then(() => null)]);
  hit.waited = false;
  if (r) return r.d;
  fresh.then(() => onStale(action)).catch(() => {});
  return hit.data;
}
/** Loads common pages in the background after sign-in (all in one request), so the first click is quick too. */
export function prefetch(list) { list.forEach(([a, d]) => { apiFast(a, d).catch(() => {}); }); }
