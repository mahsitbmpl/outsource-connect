'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { ready, ok } = require('./helpers');

const W = (o) => Object.assign({ reasonCode: 'Other', note: 'Checked with supervisor' }, o);
const raw = (env, body) => { env.newRequest(); return JSON.parse(env.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).content); };
const signedBeat = (env, data) => {
  const payload = JSON.stringify(data), ts = String(env.ctx.Clock.nowMs()), nonce = crypto.randomBytes(4).readUInt32BE(0) + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  const sig = crypto.createHmac('sha256', env.creds.secret).update([env.creds.deviceId, ts, nonce, 'kiosk.heartbeat', payload].join('\n')).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return raw(env, { action: 'kiosk.heartbeat', device: { id: env.creds.deviceId, ts, nonce, sig }, payload });
};

test('speed: repeated reads come from the cache without opening the Sheet; any save makes them fresh', () => {
  const env = ready();
  env.punch(env.staff[0], 'IN', '2026-11-20 08:00');
  const first = env.call('punches.byDate', { date: '2026-11-20' }, env.admin);
  assert.equal(first.ok, true); assert.ok(!first.cached);
  env.resetStats();
  const again = env.call('punches.byDate', { date: '2026-11-20' }, env.admin);
  assert.equal(again.cached, true);
  assert.equal(env.stats.readCells, 0, 'answered without reading the Sheet');
  assert.deepEqual(again.data, first.data);
  // a new punch changes the data version: next read is fresh and includes it
  env.punch(env.staff[1], 'IN', '2026-11-20 08:01');
  const fresh = env.call('punches.byDate', { date: '2026-11-20' }, env.admin);
  assert.ok(!fresh.cached); assert.equal(fresh.data.length, 2);
  // a save made by the Ops manager also makes it fresh
  ok(env.api('penalties.add', { date: '2026-11-20', deptCode: 'HK', amount: 100, reason: 'Late reporting' }));
  const pl = env.call('penalties.list', { month: '2026-11' }, env.admin);
  assert.equal(pl.data.length, 1);
  // results are kept per role: Ops does not get an Admin-only answer
  assert.equal(env.call('settings.list', {}, env.admin).cached, undefined, 'settings are never cached');
});

test('batch: several reads in one request, each with its own result or error; sign-in still required', () => {
  const env = ready();
  const r = raw(env, { action: 'batch', token: env.admin, items: [{ action: 'staff.list', data: {} }, { action: 'dashboard' }, { action: 'nope' }, { action: 'users.list' }] });
  assert.equal(r.ok, true);
  assert.equal(r.data.length, 4);
  assert.equal(r.data[0].ok, true); assert.equal(r.data[0].data.length, 4);
  assert.equal(r.data[1].ok, true); assert.ok('onDuty' in r.data[1].data);
  assert.equal(r.data[2].error.code, 'BAD_REQUEST');
  assert.equal(r.data[3].ok, true);
  assert.equal(raw(env, { action: 'batch', items: [{ action: 'staff.list' }] }).error.code, 'AUTH');
  assert.equal(raw(env, { action: 'batch', token: env.admin, items: [] }).error.code, 'BAD_REQUEST');
  assert.equal(raw(env, { action: 'batch', token: env.admin, items: [{ action: 'batch' }] }).data[0].error.code, 'BAD_REQUEST');
});

test('exceptions: ignore (single and many) leaves the list, survives recalculation, can be restored; bill no longer blocked', () => {
  const env = ready('2026-11-25T09:00:00+05:30');
  const [A, B] = env.staff;
  env.punch(A, 'IN', '2026-11-02 08:00');                       // missing OUT
  env.punch(B, 'IN', '2026-11-03 08:00'); env.punch(B, 'OUT', '2026-11-03 21:00'); // 13 h -> over 12
  env.process();
  let open = env.exc();
  const mo = open.find((x) => x.type === 'MISSING_OUT'), ld = open.find((x) => x.type === 'LONG_DUTY');
  assert.ok(mo && ld);
  assert.ok(env.api('exceptions.ignore', { items: [{ id: mo.exceptionId, dutyDate: mo.dutyDate }] }).error.fields.reasonCode, 'reason needed');
  const r = ok(env.api('exceptions.ignore', W({ items: [{ id: mo.exceptionId, dutyDate: mo.dutyDate }, { id: ld.exceptionId, dutyDate: ld.dutyDate }, { id: 'X:1', dutyDate: '2026-11-01' }] })));
  assert.equal(r.changed, 2); assert.equal(r.skipped.length, 1);
  open = env.exc();
  assert.ok(!open.some((x) => x.exceptionId === mo.exceptionId || x.exceptionId === ld.exceptionId));
  // recalculation keeps them ignored
  env.newRequest(); env.ctx.DutyEngine.rebuild('2026-11-01');
  assert.ok(!env.exc().some((x) => x.exceptionId === mo.exceptionId));
  const ign = ok(env.api('exceptions.list', { status: 'Ignored' }));
  assert.equal(ign.length, 2); assert.match(ign[0].resolution, /^Ignored · Other: Checked/);
  assert.ok(ok(env.api('audit.recent', { limit: 5 })).some((a) => a.action === 'exceptions.ignore'));
  // month end: the ignored items no longer block the lock; the extra hour is not billed
  env.setNow('2026-12-02T10:00:00+05:30'); env.login();
  const pv = ok(env.api('month.preview', { month: '2026-11', deptCode: 'HK', companyId: env.co.companyId }));
  assert.deepEqual(pv.blockers.map((b) => b.type), []);
  assert.equal(pv.lines[0].netH, 12, 'B billed 12 h; A missing OUT counts 0');
  // restore puts one back on the list
  ok(env.api('exceptions.restore', { items: [{ id: mo.exceptionId, dutyDate: mo.dutyDate }], note: 'Need to check again' }));
  assert.ok(env.exc().some((x) => x.exceptionId === mo.exceptionId));
  // locked months refuse
  ok(env.api('exceptions.ignore', W({ items: [{ id: mo.exceptionId, dutyDate: mo.dutyDate }] })));
  ok(env.api('month.lock', { month: '2026-11', deptCode: 'HK' }));
  const lr = ok(env.api('exceptions.restore', { items: [{ id: mo.exceptionId, dutyDate: mo.dutyDate }] }));
  assert.equal(lr.changed, 0); assert.match(lr.skipped[0], /locked/);
});

test('punches by date range with filters; unrecognised faces dismissed in bulk; tablet diagnostics stored', () => {
  const env = ready('2026-11-25T09:00:00+05:30');
  const [A, B] = env.staff;
  env.punch(A, 'IN', '2026-11-20 08:00'); env.punch(A, 'OUT', '2026-11-20 20:00');
  env.punch(B, 'IN', '2026-11-24 08:00'); env.punch(A, 'IN', '2026-11-25 08:00');
  let r = ok(env.api('punches.range', { from: '2026-11-20', to: '2026-11-24' }));
  assert.equal(r.total, 3); assert.equal(r.rows[0].staffId, B, 'newest first');
  r = ok(env.api('punches.range', { from: '2026-11-01', to: '2026-11-30', staffId: A.toLowerCase(), type: 'IN' }));
  assert.equal(r.total, 2);
  r = ok(env.api('punches.range', { from: '2026-11-24', to: '2026-11-24' }));
  assert.equal(r.total, 1);
  assert.ok(env.api('punches.range', { from: '2026-08-01', to: '2026-11-24' }).error.fields.to, 'max 62 days');
  assert.ok(env.api('punches.range', { from: '2026-11-24', to: '2026-11-20' }).error.fields.to);
  // unrecognised: three photos, dismiss two by id, then the rest by date
  ['2026-11-23T10:00:00+05:30', '2026-11-24T10:00:00+05:30', '2026-11-24T11:00:00+05:30'].forEach((at, i) => env.ctx.Db.insert('UnrecognisedFaces', { unrecId: 'U' + i, at, status: 'Open', photoFileId: '', bestStaffId: '', bestDistance: 0.6 }));
  env.newRequest();
  assert.equal(ok(env.api('unrecognised.list', { status: 'Open', from: '2026-11-24', to: '2026-11-24' })).length, 2);
  assert.equal(ok(env.api('unrecognised.dismissMany', { ids: ['U0', 'U1'], reason: 'Visitor, not staff' })).dismissed, 2);
  assert.equal(ok(env.api('unrecognised.dismissMany', { from: '2026-11-01', to: '2026-11-30', reason: 'Clean-up' })).dismissed, 1);
  assert.equal(ok(env.api('unrecognised.list', { status: 'Open' })).length, 0);
  assert.ok(env.api('unrecognised.dismissMany', { reason: 'x' }).error.fields);
  // tablet diagnostics
  const hb = signedBeat(env, { battery: 80, charging: true, queueSize: 0, cameraOk: true, appVersion: '3.1.0', diag: { uptimeMin: 245.37, loopStalls: 1, camRestarts: 2, recogMs: 180, reloadReason: 'idle refresh', evil: '<b>' } });
  assert.equal(hb.ok, true, JSON.stringify(hb));
  const dev = ok(env.api('devices.list'))[0];
  assert.deepEqual(dev.diag, { uptimeMin: 245.4, loopStalls: 1, camRestarts: 2, reloadReason: 'idle refresh', recogMs: 180 });
});
