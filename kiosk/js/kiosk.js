/* OutSource Connect kiosk: screens, punch flow, enrollment, sync, heartbeat, self-healing. */
import { kv, queue } from './store.js';
import * as net from './net.js';
import * as cam from './face.js';

const L = window.KioskLogic, OSC = window.OSC;
const VERSION = '3.1.0';
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// English + Hindi shown together
const TXT = {
  look: ['Look at the camera', 'कैमरे की ओर देखें'], blink: ['Please blink once', 'एक बार पलक झपकाएँ'],
  blinkMore: ['Blink, or turn your head a little', 'पलक झपकाएँ या सिर थोड़ा घुमाएँ'], closer: ['Come a little closer', 'थोड़ा पास आएँ'],
  inOk: ['IN accepted', 'IN दर्ज'], outOk: ['OUT recorded', 'OUT दर्ज'], dup: ['Already punched', 'पहले ही दर्ज'],
  notRec: ['Not recognised', 'पहचान नहीं हुई'], tryAgain: ['Please try again', 'पुनः प्रयास करें'],
  welcome: ['Welcome', 'स्वागत है'], thanks: ['Thank you', 'धन्यवाद'], noNeed: ['No need to punch again', 'दोबारा पंच की ज़रूरत नहीं'],
  stepCloser: ['Step closer and look straight at the camera', 'पास आकर सीधे कैमरे में देखें'],
  enrolling: ['Enrolling', 'नामांकन'], straight: ['Look straight at the camera', 'सीधे कैमरे में देखें'], dark: ['Too dark: face the light', 'बहुत अंधेरा है'],
  bright: ['Too bright behind you', 'पीछे बहुत रोशनी है'], blurry: ['Hold still', 'स्थिर रहें'], farther: ['Move back a little', 'थोड़ा पीछे जाएँ'],
  unclear: ['Face not clear', 'चेहरा साफ़ नहीं'], testPunch: ['Test punch: look at the camera again', 'परीक्षण: फिर से कैमरे में देखें'],
  enrolled: ['Face enrolled', 'चेहरा दर्ज हो गया'], notCounted: ['Test punch is not counted as attendance', 'यह उपस्थिति में नहीं गिना जाएगा']
};
const t2 = (k) => `<span>${esc(TXT[k][0])}</span><span class="hi">${esc(TXT[k][1])}</span>`;
const LIMITS = { minFaceRatio: 0.2, maxFaceRatio: 0.65, maxYaw: 0.14, maxRoll: 12, minBright: 55, maxBright: 215, minSharp: 25, minScore: 0.75 };

const S = {
  mode: 'loading', people: [], byId: {}, gallery: [], last: {}, config: null, facesVersion: null, enroll: null,
  live: L.Liveness(), consensus: L.Consensus(2, 3), presenceAt: 0, lostAt: 0, unknown: 0, lastUnrecAt: 0, cooldown: {},
  resultUntil: 0, camFails: 0, audio: null, wake: null, backend: '', lastPunchAt: '',
  // self-repair (v3.1): the loop and the camera are watched; the app restarts itself quietly when needed
  loopAt: 0, lastFaceAt: 0, stallsInRow: 0, needReload: '', tensorBase: 0, hiddenAt: 0, visibleAt: 0, detectBase: 0,
  diag: { loopStalls: 0, camRestarts: 0, reloadReason: '' }
};
try { const r = JSON.parse(localStorage.getItem('osc.k.reload') || 'null'); if (r) S.diag.reloadReason = r.reason + ' at ' + new Date(r.at + 19800000).toISOString().slice(11, 16); } catch (e) { /* none */ }
/** Restarts the app (quick: everything is cached on the tablet) and remembers why, for the Tablet page in the console. */
function restartApp(reason) {
  try { localStorage.setItem('osc.k.reload', JSON.stringify({ reason, at: Date.now() })); } catch (e) { /* ignore */ }
  location.reload();
}

// ---------- screens ----------
const app = () => $('#app');
function setMode(m) { S.mode = m; document.body.dataset.mode = m; }
function clockParts() {
  const ms = net.serverNow(), d = new Date(ms + 19800000);
  const date = OSC.fmtDate(OSC.todayIST(ms));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return { time: OSC.fmtTime12(d.getUTCHours(), d.getUTCMinutes()), short: OSC.pad(d.getUTCHours() % 12 || 12) + ':' + OSC.pad(d.getUTCMinutes()), date: wd + ', ' + date };
}
function topBar(sub) {
  const c = clockParts();
  return `<header class="k-top"><div class="k-logo"><img src="img/logo.png" alt="Marengo Asia Hospitals"></div><div class="k-clock"><b data-clock>${c.time}</b><span>${esc(sub || c.date)}</span></div></header>`;
}
function statusChip() {
  const on = navigator.onLine;
  return `<span class="k-chip" data-net>${on ? '● Online' : '○ Offline · punches saved on tablet'}</span>`;
}
function showIdle() {
  setMode('idle');
  app().innerHTML = `<div class="k-idle"><div class="k-idle-c" id="drift"><b data-clockshort>${clockParts().short}</b><span>${esc(TXT.look[0])} · <span class="hi">${esc(TXT.look[1])}</span></span></div>
    <div class="k-idle-dot">${S.audio && S.audio.state !== 'running' ? '<span>Tap screen once to turn on sound</span>' : ''}<span data-q></span><span>${navigator.onLine ? 'online' : 'offline'}</span><span>v${VERSION}</span></div></div>`;
  driftClock();
}
function showScan(promptKey) {
  if (S.mode !== 'scan') {
    setMode('scan');
    app().innerHTML = `<div class="k-screen k-scan">${topBar()}<div class="k-stage"><div class="k-ring"></div><div class="k-prompt" id="prompt">${t2(promptKey || 'look')}</div></div><footer class="k-foot"><span>${esc(S.config ? S.config.orgName : '')}</span>${statusChip()}</footer></div>`;
  } else if (promptKey) { const p = $('#prompt'); if (p && p.dataset.k !== promptKey) { p.dataset.k = promptKey; p.innerHTML = t2(promptKey); } }
}
function photoBox(staffId, cls) {
  const p = staffId && S.byId[staffId];
  return `<div class="k-photo ${cls || ''}">${p && p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="9" r="5"/><path d="M3 22c1.5-5 5-7 9-7s7.5 2 9 7"/></svg>'}</div>`;
}
function showResult(kind, o) {
  setMode('result');
  S.resultUntil = performance.now() + (kind === 'bad' ? 3500 : 4500);
  const cls = { IN: 'in', OUT: 'out', DUP: 'dup', bad: 'bad', ok: 'in', fail: 'bad' }[kind];
  const icon = { IN: '✓', OUT: '⇥', DUP: '⧉', bad: '✕', ok: '✓', fail: '✕' }[kind];
  app().innerHTML = `<div class="k-screen k-res ${cls}">${topBar()}
    <div class="k-body">${photoBox(o.staffId, kind === 'bad' ? 'dashed' : '')}
      <div class="k-text"><span class="k-status"><i aria-hidden="true">${icon}</i>${o.status}</span>
        <div class="k-name">${esc(o.name)}</div><div class="k-meta">${esc(o.meta || '')}</div>
        ${o.time ? `<div class="k-time">${esc(o.time)}</div>` : ''}${o.sub ? `<div class="k-sub">${o.sub}</div>` : ''}</div></div>
    <footer class="k-foot"><span class="langs">${o.foot || ''}</span>${o.chip || statusChip()}</footer></div>`;
  beep(kind);
}
function showSetup(msg) {
  setMode('setup');
  app().innerHTML = `<div class="k-setup"><div class="k-logo big"><img src="img/logo.png" alt="Marengo Asia Hospitals"></div>
    <h1>OutSource Connect · Tablet setup</h1><p>Enter the setup code from the console (Admin, then Tablet, then Add tablet).</p>
    <form id="setupForm" autocomplete="off"><input id="code" placeholder="TAB1-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false" aria-label="Setup code">
    <button type="submit">Connect</button></form><p class="err" id="setupErr">${esc(msg || '')}</p><p class="ver">Version ${VERSION}</p></div>`;
  $('#setupForm').onsubmit = async (e) => {
    e.preventDefault();
    unlockAudio();
    const c = L.parseSetupCode($('#code').value);
    if (!c) { $('#setupErr').textContent = 'That code is not complete. Check every group of 4 characters.'; return; }
    $('#setupErr').textContent = 'Connecting…';
    await net.saveCreds(c);
    try { await sync(true); start(); }
    catch (err) { await net.clearCreds(); $('#setupErr').textContent = err.code === 'NETWORK' ? 'No internet. Connect the tablet to Wi-Fi and try again.' : err.message; }
  };
}
function showLoading(step, total, msg) {
  setMode('loading');
  app().innerHTML = `<div class="k-setup"><div class="k-logo big"><img src="img/logo.png" alt=""></div><h1>Starting…</h1><div class="k-bar"><i style="width:${Math.round(step / total * 100)}%"></i></div><p>${esc(msg || '')}</p></div>`;
}
function showFatal(msg) {
  setMode('error');
  app().innerHTML = `<div class="k-setup"><div class="k-logo big"><img src="img/logo.png" alt=""></div><h1>Tablet problem</h1><p class="err">${esc(msg)}</p><p>Retrying in 30 seconds…</p></div>`;
  setTimeout(() => location.reload(), 30000);
}

// ---------- sound ----------
function unlockAudio() {
  try { if (!S.audio) S.audio = new (window.AudioContext || window.webkitAudioContext)(); if (S.audio.state !== 'running') S.audio.resume(); } catch (e) { /* no audio */ }
}
function beep(kind) {
  if (!S.audio || S.audio.state !== 'running') return;
  const seq = { IN: [[880, 0.12], [1320, 0.16]], ok: [[880, 0.12], [1320, 0.16]], OUT: [[660, 0.22]], DUP: [[600, 0.1], [600, 0.1]], bad: [[220, 0.35]], fail: [[220, 0.35]] }[kind] || [];
  let tt = S.audio.currentTime;
  seq.forEach(([f, d]) => {
    const o = S.audio.createOscillator(), g = S.audio.createGain();
    o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.25, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + d);
    o.connect(g).connect(S.audio.destination); o.start(tt); o.stop(tt + d); tt += d + 0.05;
  });
}

// ---------- data ----------
function applySync(d) {
  S.config = d.config; S.facesVersion = d.facesVersion; S.people = d.people;
  S.byId = {}; d.people.forEach((p) => { S.byId[p.staffId] = p; });
  S.gallery = d.people.map((p) => ({ staffId: p.staffId, descriptors: p.descriptors }));
  d.people.forEach((p) => {
    const mine = S.last[p.staffId];
    if (p.last && (!mine || p.last.at >= mine.at)) S.last[p.staffId] = { type: p.last.type, at: p.last.at };
  });
}
async function sync(throwErrors) {
  try {
    const d = await net.call('kiosk.sync', {});
    applySync(d);
    await kv.set('sync', d); await kv.set('last', S.last);
    return d;
  } catch (e) { handleNetError(e); if (throwErrors) throw e; return null; }
}
function handleNetError(e) {
  if (e && (e.code === 'DEVICE_REVOKED' || e.code === 'DEVICE_AUTH')) { net.clearCreds().then(() => showSetup(e.message)); }
}

// ---------- recognition loop ----------
function resetPresence() { S.live.reset(); S.consensus.reset(); S.unknown = 0; S.presenceAt = performance.now(); }

async function tick() {
  if (S.mode === 'setup' || S.mode === 'loading' || S.mode === 'error') return;
  if (S.mode === 'result') { if (performance.now() < S.resultUntil) return; showScan('look'); }
  if (S.enroll) return enrollTick();
  const f = await cam.closestFace(S.mode === 'idle');
  if (f) S.lastFaceAt = performance.now();
  const minRatio = (S.config ? S.config.minFacePct : 16) / 100;
  if (!f || f.widthRatio < minRatio * 0.6) {
    if (S.mode === 'scan') { if (!S.lostAt) S.lostAt = performance.now(); if (performance.now() - S.lostAt > 1500) showIdle(); }
    return;
  }
  S.lostAt = 0;
  if (S.mode !== 'scan') { showScan('look'); resetPresence(); return; } // next round looks again with the full detector
  if (f.widthRatio < minRatio) { showScan('closer'); return; }
  const cfg = S.config || {};
  if (cfg.liveness && !S.live.passed()) {
    S.live.feed({ ear: f.ear, yaw: f.yaw }, performance.now());
    if (!S.live.passed()) { showScan(performance.now() - S.presenceAt > 6000 ? 'blinkMore' : 'blink'); return; }
  }
  if (!S.gallery.length) { showScan('look'); return; }
  const desc = await cam.describe(f);
  const m = L.bestMatch(desc, S.gallery, cfg.threshold || 0.45, cfg.margin || 0.06);
  if (m.ok && (S.cooldown[m.staffId] || 0) > performance.now()) return; // just punched: ignore quietly
  const winner = S.consensus.push(m.ok ? m.staffId : null);
  if (winner) return punch(winner, m);
  if (!m.ok && ++S.unknown >= 6) { S.unknown = 0; S.consensus.reset(); notRecognised(m); }
}

async function punch(staffId, m) {
  const p = S.byId[staffId], cfg = S.config;
  const now = Math.round(net.serverNow());
  const d = L.decideType(S.last[staffId], now, cfg.dupWindowMin, cfg.newInAfterHours);
  S.cooldown[staffId] = performance.now() + 15000;
  resetPresence();
  const timeOf = (ms) => { const x = new Date(ms + 19800000); return OSC.fmtTime12(x.getUTCHours(), x.getUTCMinutes()); };
  const meta = `${staffId} · ${p.dept} · ${p.designation}`;
  if (d.kind === 'DUP') {
    showResult('DUP', { staffId, name: p.name, status: t2('dup'), meta: `${staffId} · ${d.last.type} was recorded`, time: timeOf(d.last.at), sub: t2('noNeed'), foot: t2('dup') });
    return;
  }
  const rec = { punchId: L.uuid(), staffId, type: d.kind, at: now, deviceTime: Date.now(), distance: m.distance, liveness: S.live.passed() || (cfg.liveness ? 'none' : 'off'),
    offline: !navigator.onLine, photo: cam.snapshot(320, 0.6) };
  S.last[staffId] = { type: d.kind, at: now };
  S.lastPunchAt = OSC.nowISTString(now);
  await queue.add({ id: rec.punchId, kind: 'punch', at: now, payload: rec });
  kv.set('last', S.last);
  const chip = navigator.onLine ? statusChip() : '<span class="k-chip">○ Saved on tablet · will sync</span>';
  if (d.kind === 'IN') showResult('IN', { staffId, name: p.name, status: t2('inOk'), meta, time: timeOf(now), foot: t2('welcome'), chip });
  else {
    // hours under the attendance rules (same engine as the server); the final figure can still change after review
    let hrs = L.elapsedText(now - d.last.at);
    if (cfg.rules && window.OSCRules) { const r = window.OSCRules.computeDuty(d.last.at, now, window.OSCRules.normalise(cfg.rules).rules); if (r.hours != null) hrs = r.hours.toFixed(2) + ' hrs'; }
    showResult('OUT', { staffId, name: p.name, status: t2('outOk'), meta, time: timeOf(now), sub: `This duty: ${hrs} · IN ${timeOf(d.last.at)}`, foot: t2('thanks'), chip });
  }
  flushSoon();
}

function notRecognised(m) {
  showResult('bad', { name: TXT.tryAgain[0], status: t2('notRec'), meta: TXT.stepCloser[0], sub: `<span class="hi">${esc(TXT.tryAgain[1])}</span>`, foot: 'Photo saved for review' });
  const now = Date.now();
  if (now - S.lastUnrecAt < 60000) return; // at most one photo a minute
  S.lastUnrecAt = now;
  const id = L.uuid();
  queue.add({ id, kind: 'unrec', at: now, payload: { id, at: Math.round(net.serverNow()), photo: cam.snapshot(480, 0.65), bestStaffId: m.staffId || '', bestDistance: m.distance } }).then(flushSoon);
}

// ---------- enrollment ----------
async function beginEnroll(req) {
  S.enroll = { req, phase: 'capture', samples: [], thumb: '', quality: [], startedAt: performance.now(), lastShot: 0, testAt: 0 };
  setMode('enroll');
  renderEnroll('straight');
  try { await net.call('kiosk.enrollStart', { reqId: req.reqId }); } catch (e) { /* retried by poll */ }
}
function renderEnroll(hintKey, done) {
  const e = S.enroll; if (!e) return;
  const n = e.samples.length;
  app().innerHTML = `<div class="k-screen k-enroll">${topBar('Enrollment mode · started from the console')}
    <div class="k-en"><div class="k-stage small"><div class="k-ring ${done ? 'ok' : ''}"></div></div>
      <div><h3>${t2('enrolling')}</h3><div class="k-name">${esc(e.req.name)}</div><div class="k-meta">${esc(e.req.staffId)}${e.req.mode === 'sample' ? ' · adding another sample' : ''}</div>
      <div class="k-frames">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? 'f' : ''}"></i>`).join('')}</div>
      <div class="k-hint">${hintKey ? t2(hintKey) : ''}</div></div></div>
    <footer class="k-foot"><span>Front face only. 5 photos, then a test punch that is not counted.</span>${statusChip()}</footer></div>`;
}
async function enrollTick() {
  const e = S.enroll, cfg = S.config || {};
  if (performance.now() - e.startedAt > 120000) return endEnroll('fail', 'Enrollment timed out (2 minutes)');
  const f = await cam.closestFace();
  if (e.phase === 'test') {
    if (!f || performance.now() < e.testAt) return;
    const desc = await cam.describe(f);
    const d = Math.min(...e.samples.map((s) => L.dist(desc, s)));
    if (d < (cfg.threshold || 0.45)) {
      try { await net.call('kiosk.enrollConfirm', { reqId: e.req.reqId, distance: L.round4(d) }); }
      catch (err) { return renderEnroll(null); }
      return endEnroll('ok');
    }
    if (performance.now() - e.testAt > 15000) return endEnroll('fail', 'Test punch did not match. Please enroll again.');
    return;
  }
  if (!f) return renderEnroll('straight');
  const q = Object.assign({ faceWidthRatio: f.widthRatio, score: f.score, yaw: f.yaw, roll: f.roll }, cam.quality(f));
  const problem = L.enrollProblem(q, LIMITS);
  if (problem) return renderEnroll(problem);
  if (performance.now() - e.lastShot < 350) return;
  e.lastShot = performance.now();
  const desc = L.packDescriptor(await cam.describe(f));
  if (!e.thumb) e.thumb = cam.thumbnail(f, 128);
  e.samples.push(desc); e.quality.push({ b: Math.round(q.brightness), s: Math.round(q.sharpness), w: L.round4(q.faceWidthRatio) });
  renderEnroll(null);
  if (e.samples.length < 5) return;
  if (!L.samplesConsistent(e.samples, 0.4)) { e.samples = []; e.quality = []; return renderEnroll('blurry'); }
  // local duplicate check (the server checks again)
  const others = S.gallery.filter((g) => g.staffId !== e.req.staffId);
  const dupe = e.samples.map((s) => L.bestMatch(s, others, cfg.threshold || 0.45, 0)).find((m) => m.ok);
  if (dupe) return endEnroll('fail', 'This face is already enrolled as ' + dupe.staffId);
  try {
    const r = await net.call('kiosk.enrollSubmit', { reqId: e.req.reqId, descriptors: e.samples, thumb: e.thumb, quality: e.quality });
    if (r.status === 'Failed') return endEnroll('fail', r.message, true);
  } catch (err) { e.samples = []; return renderEnroll(null); }
  e.phase = 'test'; e.testAt = performance.now() + 1500;
  app().querySelector('.k-hint').innerHTML = t2('testPunch');
}
async function endEnroll(result, message, alreadyReported) {
  const e = S.enroll; S.enroll = null;
  if (result === 'ok') {
    showResult('ok', { staffId: e.req.staffId, name: e.req.name, status: t2('enrolled'), meta: e.req.staffId, sub: t2('notCounted'), foot: '' });
    await sync();
  } else {
    if (!alreadyReported) { try { await net.call('kiosk.enrollFail', { reqId: e.req.reqId, message }); } catch (x) { /* ignore */ } }
    showResult('fail', { staffId: e.req.staffId, name: e.req.name, status: 'Enrollment stopped', meta: message, foot: 'The Ops manager can start it again' });
  }
}

// ---------- background jobs ----------
let flushTimer = null;
function flushSoon() { clearTimeout(flushTimer); flushTimer = setTimeout(() => net.flush().catch(handleNetError).finally(updateQueueChip), 300); }
async function updateQueueChip() { const n = await queue.count(); const el = document.querySelector('[data-q]'); if (el) el.textContent = n ? n + ' waiting to sync' : ''; }
async function poll() {
  if (!navigator.onLine) return;
  try {
    const r = await net.call('kiosk.poll', {});
    if (r.facesVersion !== S.facesVersion) await sync();
    if (r.enroll && !S.enroll && ['Requested', 'InProgress'].includes(r.enroll.status) && S.mode !== 'result') beginEnroll(r.enroll);
    if (!r.enroll && S.enroll) { S.enroll = null; showIdle(); }
  } catch (e) { handleNetError(e); }
}
async function heartbeat() {
  let battery = null, charging = null;
  try { if (navigator.getBattery) { const b = await navigator.getBattery(); battery = Math.round(b.level * 100); charging = b.charging; } } catch (e) { /* not available */ }
  try {
    await net.call('kiosk.heartbeat', { battery, charging, queueSize: await queue.count(), cameraOk: cam.cameraOk(), appVersion: VERSION, backend: S.backend,
      lastPunchAt: S.lastPunchAt, userAgent: navigator.userAgent.slice(0, 180),
      diag: { uptimeMin: performance.now() / 60000, loopStalls: S.diag.loopStalls, camRestarts: S.diag.camRestarts, reloadReason: S.diag.reloadReason, recogMs: cam.stats.recogMs,
        detectMs: cam.stats.detectMs, tensors: cam.tensors(), faces: S.gallery.length, camRes: cam.stats.camRes, lastLoopSec: S.loopAt ? (performance.now() - S.loopAt) / 1000 : null } });
  } catch (e) { handleNetError(e); }
}
async function watchdog() {
  if (document.visibilityState !== 'visible') return; // the screen is off: nothing to check
  const now = performance.now();
  // 1. the face loop must keep going round (it can get stuck inside the graphics chip after the screen sleeps)
  if (S.loopAt && now - S.loopAt > 20000 && now - S.visibleAt > 20000 && S.mode !== 'setup' && S.mode !== 'error') return restartApp('face loop stopped');
  // 2. the camera must deliver moving pictures
  if (cam.cameraOk()) { S.camFails = 0; return; }
  S.camFails++;
  if (S.camFails >= 2) {
    S.diag.camRestarts++;
    try { await cam.startCamera($('#cam')); } catch (e) { /* retry next time */ }
  }
  if (S.camFails >= 5) restartApp('camera not delivering pictures');
}
function everyMinute() {
  const c = new Date(net.serverNow() + 19800000), hm = OSC.pad(c.getUTCHours()) + ':' + OSC.pad(c.getUTCMinutes());
  const quiet = (S.mode === 'idle' || S.mode === 'scan') && !S.enroll && performance.now() > 120000 && performance.now() - S.lastFaceAt > 120000;
  if (S.config && hm === S.config.reloadTime && quiet) return restartApp('daily refresh');
  // memory slowly filling up inside the face models: refresh when nobody is at the tablet
  const n = cam.tensors();
  if (S.tensorBase && n > S.tensorBase + 400) S.needReload = S.needReload || 'memory clean-up';
  // recognition became much slower than when the app started (graphics chip tired): refresh when nobody is in front
  const det = cam.stats.detectMs;
  if (!S.detectBase && performance.now() > 300000 && det) S.detectBase = det;
  if (S.detectBase && det > Math.max(400, 3 * S.detectBase)) S.needReload = S.needReload || 'recognition slowed down';
  if (S.needReload && quiet) return restartApp(S.needReload);
  driftClock();
}
/** Screen back on, or the app brought to the front again: wake the camera and the loop. */
async function resume(why) {
  if (document.visibilityState !== 'visible' || !started) return;
  keepAwake();
  S.loopAt = performance.now(); S.visibleAt = S.loopAt; S.camFails = 0;
  const hiddenFor = S.hiddenAt ? performance.now() - S.hiddenAt : 0; S.hiddenAt = 0;
  await cam.resumeVideo();
  if (!cam.cameraOk() || hiddenFor > 60000) { S.diag.camRestarts++; try { await cam.startCamera($('#cam')); } catch (e) { /* watchdog retries */ } }
  if (!S.enroll && S.mode !== 'setup' && S.mode !== 'error') { resetPresence(); showIdle(); }
  void why;
}
function driftClock() { const d = $('#drift'); if (d) d.style.transform = `translate(${Math.round((Math.random() - 0.5) * 30)}vw, ${Math.round((Math.random() - 0.5) * 30)}vh)`; }
function tickClock() {
  const c = clockParts();
  document.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = c.time; });
  document.querySelectorAll('[data-clockshort]').forEach((el) => { el.textContent = c.short; });
}
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && (!S.wake || S.wake.released)) {
      S.wake = await navigator.wakeLock.request('screen');
      S.wake.addEventListener('release', () => { if (document.visibilityState === 'visible') setTimeout(keepAwake, 1000); });
    }
  } catch (e) { /* not allowed now */ }
}

// ---------- start ----------
let started = false;
async function start() {
  if (started) return; started = true;
  try {
    showLoading(1, 6, 'Loading face models');
    S.backend = await cam.loadModels((n) => showLoading(n + 1, 6, 'Loading face models'));
    showLoading(5, 6, 'Starting camera');
    await cam.startCamera($('#cam'));
    await cam.warmUp();
    S.tensorBase = cam.tensors();
    cam.onGraphicsLost(() => restartApp('graphics reset by the tablet'));
  } catch (e) {
    started = false;
    return showFatal(e && e.name === 'NotAllowedError' ? 'Camera permission is blocked. Allow the camera for this site in Chrome settings.' : 'Could not start: ' + (e.message || e));
  }
  showLoading(6, 6, 'Getting staff list');
  const cached = await kv.get('sync');
  S.last = (await kv.get('last')) || {};
  if (cached) applySync(cached);
  await sync();
  if (!S.config) return showFatal('No staff list on this tablet yet and no internet. Connect to Wi-Fi.');
  keepAwake();
  showIdle();
  setInterval(poll, 15000); setInterval(heartbeat, 180000); setInterval(watchdog, 5000); setInterval(everyMinute, 60000);
  setInterval(() => net.flush().catch(handleNetError).finally(updateQueueChip), 30000);
  setInterval(tickClock, 1000);
  setInterval(() => { if (S.mode !== 'scan' && S.mode !== 'enroll') sync(); }, 30 * 60000);
  heartbeat(); flushSoon(); poll();
  for (;;) {
    const t0 = performance.now();
    S.loopAt = t0;
    if (document.visibilityState !== 'visible') { await sleep(1000); continue; } // screen off: rest, resume() wakes the camera
    // one round must not take more than 8 seconds; a stuck round is abandoned (twice in a row = restart the app)
    const r = await Promise.race([tick().then(() => 'ok', (e) => { console.error(e); return 'error'; }), sleep(8000).then(() => 'stuck')]);
    if (r === 'stuck') {
      S.diag.loopStalls++; S.stallsInRow++;
      if (S.stallsInRow >= 2) { restartApp('face loop stuck'); return; }
      try { await cam.startCamera($('#cam')); S.diag.camRestarts++; } catch (e) { /* watchdog retries */ }
      continue;
    }
    S.stallsInRow = 0;
    const wait = S.mode === 'idle' ? 450 : 40;
    await sleep(Math.max(10, wait - (performance.now() - t0)));
  }
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resume('visible'); else S.hiddenAt = performance.now(); });
window.addEventListener('pageshow', (e) => { if (e.persisted) resume('pageshow'); });
window.addEventListener('focus', () => { if (S.loopAt && performance.now() - S.loopAt > 5000) resume('focus'); });
document.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('online', () => { flushSoon(); poll(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__kiosk = { S, showResult, showIdle, showScan, showSetup, t2, VERSION, face: cam.testHooks }; // used by the automated screen test

(async function boot() {
  const c = await net.loadCreds();
  if (!c) showSetup(); else start();
})();
