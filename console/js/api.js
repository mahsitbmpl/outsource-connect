/* API client: one POST per action to the Apps Script web app. */
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

export async function api(action, data) {
  const url = (window.OSC_CONFIG || {}).apiUrl;
  if (!url || url.indexOf('script.google.com') < 0) throw new ApiError('CONFIG', 'The server address is not set. Put the Apps Script web app URL in config.js.');
  const s = session.get();
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data: data || {}, token: s ? s.token : undefined }),
      redirect: 'follow'
    });
  } catch (e) {
    throw new ApiError('NETWORK', navigator.onLine ? 'Could not reach the server. Check the internet and try again.' : 'You are offline. Connect to the internet and try again.');
  }
  let body;
  try { body = await res.json(); } catch (e) { throw new ApiError('NETWORK', 'The server sent an unexpected reply. If you just deployed, check the web app access is set to "Anyone".'); }
  timing.last = { action, totalMs: Math.round(performance.now() - t0), serverMs: body.ms || 0 };
  if (body.ok) return body.data;
  const err = new ApiError(body.error.code, body.error.message, body.error.fields);
  if (action !== 'auth.login' && action !== 'auth.changePassword') {
    if (err.code === 'AUTH') { session.clear(); onAuthLost(err); }
    if (err.code === 'MUST_CHANGE_PASSWORD') onAuthLost(err);
  }
  throw err;
}
