'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { makeEnv } = require('./gas-mock');
const L = require('../kiosk/js/logic.js');

const NEW_PW = 'Hospital2026x';
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.data; };

function ready() {
  const env = makeEnv();
  env.ctx.setup();
  const temp = /Temporary password: (\S+)/.exec(env.alerts[env.alerts.length - 1].text)[1];
  let r = ok(env.call('auth.login', { username: 'admin', password: temp }));
  env.call('auth.changePassword', { oldPassword: temp, newPassword: NEW_PW }, r.token);
  env.admin = ok(env.call('auth.login', { username: 'admin', password: NEW_PW })).token;
  const co = ok(env.call('companies.save', { name: 'Alpha Facility Services', code: 'ALPHA', deptCodes: 'HK,SS,SC', contractStart: '2026-04-01', status: 'Active' }, env.admin));
  env.staff = [0, 1, 2].map((i) => ok(env.call('staff.create', { title: 'Mr.', fullName: 'Person ' + 'ABC'[i], dob: '1990-01-01', mobile: '98000000' + (10 + i), deptCode: 'HK', designation: 'Staff', companyId: co.companyId, joinDate: '2026-11-01' }, env.admin)));
  const d = ok(env.call('devices.create', { name: 'Lobby tablet' }, env.admin));
  env.creds = L.parseSetupCode(d.setupCode);
  return env;
}
/** Signs exactly like kiosk/js/net.js does in the browser. */
function signed(env, action, data, opts) {
  opts = opts || {};
  const c = opts.creds || env.creds;
  const payload = JSON.stringify(data || {});
  const ts = String(opts.ts != null ? opts.ts : env.ctx.Clock.nowMs());
  const nonce = opts.nonce || crypto.randomBytes(8).readUInt32BE(0) + '-' + crypto.randomBytes(8).readUInt32BE(0);
  const msg = [c.deviceId, ts, nonce, action, payload].join('\n');
  let sig = crypto.createHmac('sha256', Buffer.from(c.secret, 'utf8')).update(Buffer.from(msg, 'utf8')).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (opts.badSig) sig = sig.slice(0, -2) + 'AA';
  env.ctx.Db.reset();
  const out = env.ctx.doPost({ postData: { contents: JSON.stringify({ action, device: { id: c.deviceId, ts, nonce, sig }, payload }) } });
  return JSON.parse(out.content);
}
function face(seed, jitter) {
  // deterministic fake 128-d descriptor (not a real face), unit-ish length
  const rnd = (n) => { const x = Math.sin(seed * 9301 + n * 49297) * 10000; return x - Math.floor(x); };
  return Array.from({ length: 128 }, (_, i) => Math.round(((rnd(i) - 0.5) * 0.18 + (jitter ? (rnd(i + 500 + jitter) - 0.5) * 0.01 : 0)) * 10000) / 10000);
}
function enroll(env, staffId, seed) {
  const req = ok(env.call('face.requestEnroll', { staffId }, env.admin));
  const poll = ok(signed(env, 'kiosk.poll', {}));
  assert.equal(poll.enroll.staffId, staffId);
  ok(signed(env, 'kiosk.enrollStart', { reqId: req.reqId }));
  const sub = ok(signed(env, 'kiosk.enrollSubmit', { reqId: req.reqId, descriptors: [1, 2, 3, 4, 5].map((j) => face(seed, j)), thumb: 'data:image/jpeg;base64,AAAA', quality: { sharp: 120 } }));
  if (sub.status !== 'Captured') return sub;
  ok(signed(env, 'kiosk.enrollConfirm', { reqId: req.reqId, distance: 0.21 }));
  return sub;
}
const punchOf = (staffId, type, atMs, extra) => Object.assign({ punchId: crypto.randomUUID(), staffId, type, at: atMs, deviceTime: atMs, distance: 0.3, liveness: 'blink', offline: false, photo: 'data:image/jpeg;base64,/9j/AAAA' }, extra || {});

// ---------- device security ----------
test('setup code format and signed requests: good, wrong signature, replay, clock, revoked', () => {
  const env = ready();
  assert.match(env.creds.deviceId, /^TAB1$/);
  assert.equal(env.creds.secret.length, 32);
  ok(signed(env, 'kiosk.poll', {}));
  assert.equal(signed(env, 'kiosk.poll', {}, { badSig: true }).error.code, 'DEVICE_AUTH');
  ok(signed(env, 'kiosk.poll', {}, { nonce: '11-22-33' }));
  assert.equal(signed(env, 'kiosk.poll', {}, { nonce: '11-22-33' }).error.code, 'REPLAY');
  assert.equal(signed(env, 'kiosk.poll', {}, { ts: env.ctx.Clock.nowMs() - 11 * 60000 }).error.code, 'CLOCK');
  // a console token cannot call kiosk routes, and kiosk calls without a signature fail
  assert.equal(env.call('kiosk.sync', {}, env.admin).error.code, 'DEVICE_AUTH');
  ok(env.call('devices.revoke', { deviceId: 'TAB1', reason: 'Tablet replaced' }, env.admin));
  assert.equal(signed(env, 'kiosk.poll', {}).error.code, 'DEVICE_REVOKED');
  assert.equal(env.props.get('DEVICE_SECRET_TAB1'), undefined, 'secret deleted on revoke');
});

test('Ops manager cannot create tablets; device list shows heartbeat data', () => {
  const env = ready();
  const u = ok(env.call('users.create', { username: 'ops.one', fullName: 'Ops One' }, env.admin));
  let t = ok(env.call('auth.login', { username: 'ops.one', password: u.tempPassword })).token;
  env.call('auth.changePassword', { oldPassword: u.tempPassword, newPassword: 'Opsmanager2026' }, t);
  t = ok(env.call('auth.login', { username: 'ops.one', password: 'Opsmanager2026' })).token;
  assert.equal(env.call('devices.create', { name: 'x' }, t).error.code, 'FORBIDDEN');
  ok(signed(env, 'kiosk.heartbeat', { battery: 18, charging: false, queueSize: 3, cameraOk: true, appVersion: '2.0.0', backend: 'webgl' }));
  const list = ok(env.call('devices.list', {}, t));
  assert.equal(list[0].battery, 18);
  assert.equal(list[0].queueSize, 3);
  assert.equal(list[0].online, true);
  env.advanceMinutes(16);
  assert.equal(ok(env.call('devices.list', {}, t))[0].online, false, 'silent for 16 minutes');
  assert.equal(env.sheet('Heartbeats').rows.length, 2, 'one history row');
});

// ---------- enrollment ----------
test('enrollment: request, capture, test punch, then the tablet sync includes the person', () => {
  const env = ready();
  const [a] = env.staff;
  assert.equal(ok(signed(env, 'kiosk.sync', {})).people.length, 0);
  const v0 = ok(signed(env, 'kiosk.poll', {})).facesVersion;
  enroll(env, a.staffId, 1);
  const s = ok(env.call('staff.get', { staffId: a.staffId }, env.admin));
  assert.equal(s.faceStatus, 'Active');
  const sync = ok(signed(env, 'kiosk.sync', {}));
  assert.equal(sync.people.length, 1);
  assert.equal(sync.people[0].descriptors.length, 5);
  assert.equal(sync.people[0].name, 'Mr. Person A');
  assert.equal(sync.config.threshold, 0.45);
  assert.notEqual(ok(signed(env, 'kiosk.poll', {})).facesVersion, v0, 'tablet is told to re-sync');
  assert.equal(ok(signed(env, 'kiosk.poll', {})).enroll, null);
  assert.equal(ok(env.call('face.summary', { staffId: a.staffId }, env.admin)).samples, 5);
  // add another sample keeps the old ones; re-enroll replaces them
  const r2 = ok(env.call('face.requestEnroll', { staffId: a.staffId, mode: 'sample' }, env.admin));
  ok(signed(env, 'kiosk.enrollSubmit', { reqId: r2.reqId, descriptors: [7, 8, 9].map((j) => face(1, j)) }));
  ok(signed(env, 'kiosk.enrollConfirm', { reqId: r2.reqId }));
  assert.equal(ok(signed(env, 'kiosk.sync', {})).people[0].descriptors.length, 8);
  enroll(env, a.staffId, 1);
  assert.equal(ok(signed(env, 'kiosk.sync', {})).people[0].descriptors.length, 5);
});

test('enrollment refuses a face already enrolled for someone else, and one request at a time', () => {
  const env = ready();
  const [a, b, c] = env.staff;
  enroll(env, a.staffId, 1);
  const res = enroll(env, b.staffId, 1); // same fake face as A
  assert.equal(res.status, 'Failed');
  assert.equal(res.duplicateOf, a.staffId);
  assert.equal(ok(env.call('staff.get', { staffId: b.staffId }, env.admin)).faceStatus, 'Not enrolled');
  const r = ok(env.call('face.requestEnroll', { staffId: b.staffId }, env.admin));
  assert.equal(env.call('face.requestEnroll', { staffId: c.staffId }, env.admin).error.code, 'BUSY');
  ok(env.call('face.cancelEnroll', { reqId: r.reqId }, env.admin));
  ok(env.call('face.requestEnroll', { staffId: c.staffId }, env.admin));
  assert.equal(ok(signed(env, 'kiosk.poll', {})).enroll.staffId, c.staffId);
  // bad descriptors are refused
  assert.equal(signed(env, 'kiosk.enrollSubmit', { reqId: ok(signed(env, 'kiosk.poll', {})).enroll.reqId, descriptors: [[1, 2, 3]] }).error.code, 'BAD_REQUEST');
});

test('exit switches face data off at once; the tablet stops recognising that person', () => {
  const env = ready();
  enroll(env, env.staff[0].staffId, 1);
  enroll(env, env.staff[1].staffId, 2);
  assert.equal(ok(signed(env, 'kiosk.sync', {})).people.length, 2);
  ok(env.call('staff.exit', { staffId: env.staff[0].staffId, exitDate: '2026-11-20', exitReason: 'Resigned' }, env.admin));
  const people = ok(signed(env, 'kiosk.sync', {})).people;
  assert.deepEqual(people.map((p) => p.staffId), [env.staff[1].staffId]);
  const fd = env.sheet('FaceData').rows.slice(1).filter((r) => r[1] === env.staff[0].staffId);
  assert.ok(fd.every((r) => r[6] === 'Disabled'));
});

// ---------- punches ----------
test('punch upload is idempotent, saves the photo and updates the last punch', () => {
  const env = ready();
  const id = env.staff[0].staffId, t = env.ctx.Clock.nowMs();
  const p1 = punchOf(id, 'IN', t - 3600000, { offline: true });
  let r = ok(signed(env, 'kiosk.punch', { punches: [p1] }));
  assert.equal(r.results[0].status, 'Accepted');
  r = ok(signed(env, 'kiosk.punch', { punches: [p1] }));
  assert.equal(r.results[0].status, 'Exists');
  assert.equal(r.results[0].done, true);
  env.cacheStore.clear(); // even after the cache is gone, the sheet check finds it
  assert.equal(ok(signed(env, 'kiosk.punch', { punches: [p1] })).results[0].status, 'Exists');
  const rows = env.sheet('Punches_2026').rows.slice(1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][3], '2026-11-20T10:00:00+05:30');
  assert.ok(rows[0][11], 'photo file id stored');
  assert.equal(env.files.size, 1);
  const list = ok(env.call('punches.byDate', { date: '2026-11-20' }, env.admin));
  assert.equal(list[0].type, 'IN');
  assert.equal(list[0].offline, true);
  const ph = ok(env.call('punches.photo', { punchId: p1.punchId, date: '2026-11-20' }, env.admin));
  assert.match(ph.dataUrl, /^data:image\/jpeg;base64,/);
  // last punch is sent back to the tablet in sync
  enroll(env, id, 1);
  assert.equal(ok(signed(env, 'kiosk.sync', {})).people[0].last.type, 'IN');
});

test('server marks a repeat of the same type within 3 minutes as Duplicate; older offline punches do not move the last punch back', () => {
  const env = ready();
  const id = env.staff[0].staffId, t = env.ctx.Clock.nowMs();
  ok(signed(env, 'kiosk.punch', { punches: [punchOf(id, 'IN', t - 60000)] }));
  const r = ok(signed(env, 'kiosk.punch', { punches: [punchOf(id, 'IN', t)] }));
  assert.equal(r.results[0].status, 'Duplicate');
  ok(signed(env, 'kiosk.punch', { punches: [punchOf(id, 'OUT', t + 1000), punchOf(id, 'IN', t - 86400000)] }));
  const st = env.ctx.Db.find('StaffState', id);
  assert.equal(st.lastType, 'OUT');
  const bad = ok(signed(env, 'kiosk.punch', { punches: [{ punchId: 'nope' }, punchOf('HK999', 'IN', t)] }));
  assert.deepEqual(bad.results.map((x) => x.status), ['Rejected', 'Rejected']);
  const ahead = ok(signed(env, 'kiosk.punch', { punches: [punchOf(env.staff[1].staffId, 'IN', t + 10 * 60000)] }));
  assert.equal(ahead.results[0].status, 'Accepted');
  assert.match(env.sheet('Punches_2026').rows.slice(-1)[0][12], /ahead/);
});

test('unrecognised faces are stored once with a photo and can be dismissed with a reason', () => {
  const env = ready();
  const id = crypto.randomUUID();
  ok(signed(env, 'kiosk.unrecognised', { id, at: env.ctx.Clock.nowMs(), photo: 'data:image/jpeg;base64,/9j/BBBB', bestStaffId: 'HK001', bestDistance: 0.52 }));
  ok(signed(env, 'kiosk.unrecognised', { id, at: env.ctx.Clock.nowMs(), photo: 'data:image/jpeg;base64,/9j/BBBB' }));
  const list = ok(env.call('unrecognised.list', { status: 'Open' }, env.admin));
  assert.equal(list.length, 1);
  assert.match(ok(env.call('punches.photo', { unrecId: id }, env.admin)).dataUrl, /^data:image/);
  assert.ok(env.call('unrecognised.dismiss', { unrecId: id }, env.admin).error.fields.reason);
  ok(env.call('unrecognised.dismiss', { unrecId: id, reason: 'Visitor, not staff' }, env.admin));
  assert.equal(ok(env.call('unrecognised.list', { status: 'Open' }, env.admin)).length, 0);
});

test('new face settings are validated', () => {
  const env = ready();
  assert.ok(env.call('settings.update', { key: 'faceMatchThreshold', value: 'strict', reason: 'tune' }, env.admin).error.fields.value);
  ok(env.call('settings.update', { key: 'faceMatchThreshold', value: '0.42', reason: 'Pilot tuning' }, env.admin));
  assert.equal(ok(signed(env, 'kiosk.sync', {})).config.threshold, 0.42);
});

// ---------- tablet logic ----------
test('matching: best person, too far, and too close to call', () => {
  const g = [{ staffId: 'HK001', descriptors: [face(1, 1), face(1, 2)] }, { staffId: 'HK002', descriptors: [face(2, 1)] }];
  let m = L.bestMatch(face(1, 3), g, 0.45, 0.06);
  assert.equal(m.ok, true); assert.equal(m.staffId, 'HK001');
  m = L.bestMatch(face(3, 1), g, 0.45, 0.06);
  assert.equal(m.ok, false); assert.equal(m.reason, 'far');
  const twin = [{ staffId: 'HK001', descriptors: [face(1, 1)] }, { staffId: 'HK009', descriptors: [face(1, 2)] }];
  m = L.bestMatch(face(1, 3), twin, 0.45, 0.06);
  assert.equal(m.ok, false); assert.equal(m.reason, 'ambiguous');
  assert.equal(L.bestMatch(face(1, 1), [], 0.45, 0.06).reason, 'empty');
});

test('consensus needs 2 of the last 3 recognitions', () => {
  const c = L.Consensus(2, 3);
  assert.equal(c.push('HK001'), null);
  assert.equal(c.push('HK002'), null);
  assert.equal(c.push('HK001'), 'HK001');
  c.reset();
  assert.equal(c.push(null), null);
});

test('IN/OUT decision from the last punch', () => {
  const h = 3600000, now = Date.parse('2026-11-20T20:32:00+05:30');
  assert.equal(L.decideType(null, now, 3, 36).kind, 'IN');
  assert.equal(L.decideType({ type: 'IN', at: now - 12.5 * h }, now, 3, 36).kind, 'OUT');
  assert.equal(L.decideType({ type: 'OUT', at: now - 1 * h }, now, 3, 36).kind, 'IN');
  assert.equal(L.decideType({ type: 'IN', at: now - 2 * 60000 }, now, 3, 36).kind, 'DUP');
  assert.equal(L.decideType({ type: 'OUT', at: now - 179000 }, now, 3, 36).kind, 'DUP');
  assert.equal(L.decideType({ type: 'IN', at: now - 30 * h }, now, 3, 36).kind, 'OUT', '30-hour duty still closes');
  assert.equal(L.decideType({ type: 'IN', at: now - 37 * h }, now, 3, 36).kind, 'IN', 'forgotten OUT');
});

test('liveness: blink passes, steady photo does not, head turn passes', () => {
  const lv = L.Liveness();
  const frames = [0.31, 0.3, 0.32, 0.31, 0.3, 0.31];
  frames.forEach((e, i) => assert.equal(lv.feed({ ear: e, yaw: 0.01 }, i * 100), null, 'a photo never blinks'));
  lv.feed({ ear: 0.15, yaw: 0.01 }, 700);
  assert.equal(lv.feed({ ear: 0.3, yaw: 0.01 }, 850), 'blink');
  const lv2 = L.Liveness();
  lv2.feed({ ear: 0.3, yaw: 0.02 }, 0);
  assert.equal(lv2.feed({ ear: 0.3, yaw: 0.25 }, 400), 'turn');
  const lv3 = L.Liveness(); // eyes closed too long is not a blink
  lv3.feed({ ear: 0.3, yaw: 0 }, 0); lv3.feed({ ear: 0.1, yaw: 0 }, 100);
  assert.equal(lv3.feed({ ear: 0.3, yaw: 0 }, 1500), null);
});

test('pose from 68 landmarks and image quality maths', () => {
  const pts = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }));
  const eye = (cx) => [{ x: cx - 10, y: 0 }, { x: cx - 4, y: -3 }, { x: cx + 4, y: -3 }, { x: cx + 10, y: 0 }, { x: cx + 4, y: 3 }, { x: cx - 4, y: 3 }];
  eye(-30).forEach((p, i) => { pts[36 + i] = p; }); eye(30).forEach((p, i) => { pts[42 + i] = p; });
  pts[30] = { x: 0, y: 20 };
  const p = L.pose(pts);
  assert.ok(Math.abs(p.ear - 0.3) < 0.001); assert.equal(p.yaw, 0); assert.equal(p.roll, 0);
  const flat = new Float32Array(64 * 64).fill(120), noisy = flat.map((v, i) => (i % 2 ? 40 : 200));
  assert.equal(L.sharpness(flat, 64, 64), 0);
  assert.ok(L.sharpness(noisy, 64, 64) > 1000);
  assert.equal(L.brightness(flat), 120);
  const lim = { minFaceRatio: 0.2, maxFaceRatio: 0.6, maxYaw: 0.15, maxRoll: 12, minBright: 60, maxBright: 210, minSharp: 40, minScore: 0.7 };
  const good = { faceWidthRatio: 0.3, score: 0.9, yaw: 0.02, roll: 2, brightness: 130, sharpness: 120 };
  assert.equal(L.enrollProblem(good, lim), null);
  assert.equal(L.enrollProblem(Object.assign({}, good, { faceWidthRatio: 0.1 }), lim), 'closer');
  assert.equal(L.enrollProblem(Object.assign({}, good, { brightness: 30 }), lim), 'dark');
  assert.equal(L.enrollProblem(Object.assign({}, good, { sharpness: 5 }), lim), 'blurry');
  assert.equal(L.enrollProblem(Object.assign({}, good, { yaw: 0.3 }), lim), 'straight');
  assert.equal(L.samplesConsistent([face(1, 1), face(1, 2), face(1, 3)], 0.35), true);
  assert.equal(L.samplesConsistent([face(1, 1), face(2, 1)], 0.35), false);
});

test('setup code parsing tolerates spaces, dashes and lower case', () => {
  assert.deepEqual(L.parseSetupCode(' tab1-abcd-efgh-ijkl-mnop-qrst-uvwx-yz23-4567 '), { deviceId: 'TAB1', secret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' });
  assert.equal(L.parseSetupCode('TAB1-ABC'), null);
  assert.equal(L.elapsedText(12.5 * 3600000), '12 h 30 m');
});
