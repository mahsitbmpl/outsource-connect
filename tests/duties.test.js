'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { makeEnv } = require('./gas-mock');
const L = require('../kiosk/js/logic.js');

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.data; };
const ms = (s) => Date.parse(s.replace(' ', 'T') + ':00+05:30');

function ready() {
  const env = makeEnv();
  env.ctx.setup();
  const temp = /Temporary password: (\S+)/.exec(env.alerts[env.alerts.length - 1].text)[1];
  const t = ok(env.call('auth.login', { username: 'admin', password: temp })).token;
  env.call('auth.changePassword', { oldPassword: temp, newPassword: 'Hospital2026x' }, t);
  env.admin = ok(env.call('auth.login', { username: 'admin', password: 'Hospital2026x' })).token;
  const co = ok(env.call('companies.save', { name: 'Alpha Facility Services', code: 'ALPHA', deptCodes: 'HK,SS', contractStart: '2026-04-01', status: 'Active' }, env.admin));
  ok(env.call('rates.add', { companyId: co.companyId, deptCode: 'HK', designation: 'Staff', ratePerDuty: 800, gstPct: 18, effectiveFrom: '2026-04-01' }, env.admin));
  ok(env.call('rates.add', { companyId: co.companyId, deptCode: 'SS', designation: 'Staff', ratePerDuty: 820, gstPct: 18, effectiveFrom: '2026-04-01' }, env.admin));
  env.staff = [0, 1, 2, 3].map((i) => ok(env.call('staff.create', { title: 'Mr.', fullName: 'Worker ' + 'ABCD'[i], dob: '1990-01-01', mobile: '98100000' + (10 + i), deptCode: 'HK', designation: 'Staff', companyId: co.companyId, joinDate: '2026-11-01' }, env.admin)).staffId);
  env.creds = L.parseSetupCode(ok(env.call('devices.create', { name: 'Lobby' }, env.admin)).setupCode);
  return env;
}
function punch(env, staffId, type, when) {
  const data = { punches: [{ punchId: crypto.randomUUID(), staffId, type, at: ms(when), deviceTime: ms(when), distance: 0.3, liveness: 'blink', offline: false }] };
  const payload = JSON.stringify(data), ts = String(env.ctx.Clock.nowMs()), nonce = crypto.randomBytes(4).readUInt32BE(0) + '-' + Date.now();
  const sig = crypto.createHmac('sha256', env.creds.secret).update([env.creds.deviceId, ts, nonce, 'kiosk.punch', payload].join('\n')).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  env.ctx.Db.reset();
  const r = JSON.parse(env.ctx.doPost({ postData: { contents: JSON.stringify({ action: 'kiosk.punch', device: { id: env.creds.deviceId, ts, nonce, sig }, payload }) } }).content);
  assert.equal(r.ok, true, JSON.stringify(r.error));
}
const process = (env) => ok(env.call('duties.processNow', {}, env.admin));
const list = (env, from, to) => ok(env.call('duties.list', { from, to: to || from }, env.admin));
const exc = (env, status) => ok(env.call('exceptions.list', { status: status || 'Open' }, env.admin));
function decide(env, key, kind, staffId, date, value) {
  env.ctx.Db.reset();
  env.ctx.Db.insert('DutyDecisions', { decisionKey: key, kind, staffId, dutyDate: date, value, reasonCode: 'Test', note: '', status: 'Active', by: 'admin', at: env.ctx.Clock.now() });
  env.ctx.Db.reset();
}

test('punches become a duty with hours, split, rate snapshot, rule version; 0.5 h over 12 waits for approval', () => {
  const env = ready(), a = env.staff[0];
  punch(env, a, 'IN', '2026-11-18 08:05'); punch(env, a, 'OUT', '2026-11-18 20:32');
  const r = process(env);
  assert.equal(r.duties, 1);
  const l = list(env, '2026-11-18');
  assert.equal(l.duties.length, 1);
  const d = l.duties[0];
  assert.equal(d.systemHours, 12.5); assert.equal(d.finalHours, 12.5); assert.equal(d.status, 'Closed'); assert.equal(d.shift, 'Day');
  assert.equal(d.ratePerDuty, 800); assert.equal(d.gstPct, 18); assert.equal(d.companyId, 'CO001'); assert.equal(d.ruleId, 'RV1');
  assert.match(d.explain, /grace/);
  assert.deepEqual([l.days[0].h8, l.days[0].h4, l.days[0].dd, l.days[0].pending, l.days[0].billable], [8, 4, 0.5, 0.5, 12]);
  const e = exc(env);
  assert.deepEqual(e.map((x) => x.type), ['LONG_DUTY']);
  // approval decision clears it and makes the 0.5 h billable
  decide(env, 'APPROVE:' + a + ':2026-11-18', 'APPROVE', a, '2026-11-18', { approved: true });
  ok(env.call('duties.rebuild', { from: '2026-11-18', reason: 'test approval' }, env.admin));
  assert.equal(exc(env).length, 0);
  assert.equal(list(env, '2026-11-18').days[0].billable, 12.5);
  assert.equal(exc(env, 'All')[0].status, 'AutoClosed');
});

test('late arrival 09:05: strict 10 h, grace decision gives 11 h', () => {
  const env = ready(), a = env.staff[0];
  punch(env, a, 'IN', '2026-11-18 09:05'); punch(env, a, 'OUT', '2026-11-18 20:00');
  process(env);
  let d = list(env, '2026-11-18').duties[0];
  assert.equal(d.systemHours, 10); assert.equal(d.graceHours, 11); assert.equal(d.finalHours, 10); assert.equal(d.lateGrace, true);
  const types = exc(env).map((x) => x.type).sort();
  assert.deepEqual(types, ['LATE_GRACE', 'SHORT_DUTY']);
  decide(env, 'GRACE:' + d.dutyId, 'GRACE', a, '2026-11-18', { choice: 'grace' });
  ok(env.call('duties.rebuild', { from: '2026-11-18', reason: 'grace given' }, env.admin));
  d = list(env, '2026-11-18').duties[0];
  assert.equal(d.finalHours, 11); assert.equal(d.finalSource, 'grace');
  assert.deepEqual(exc(env).map((x) => x.type), ['SHORT_DUTY']);
});

test('forgotten OUT and forgotten IN raise exceptions with suggested times', () => {
  const env = ready(), [a, b] = env.staff;
  punch(env, a, 'IN', '2026-11-17 08:02'); punch(env, a, 'IN', '2026-11-18 08:00'); punch(env, a, 'OUT', '2026-11-18 20:00');
  punch(env, b, 'OUT', '2026-11-18 20:03');
  process(env);
  const e = exc(env);
  const mo = e.find((x) => x.type === 'MISSING_OUT'), mi = e.find((x) => x.type === 'MISSING_IN');
  assert.equal(mo.staffId, a); assert.equal(mo.suggestion.outAt, '2026-11-17T20:00:00+05:30');
  assert.equal(mi.staffId, b); assert.equal(mi.suggestion.inAt, '2026-11-18T08:00:00+05:30'); assert.equal(mi.dutyDate, '2026-11-18');
  const l = list(env, '2026-11-17', '2026-11-18');
  assert.equal(l.duties.find((d) => d.staffId === a && d.dutyDate === '2026-11-18').systemHours, 12);
  assert.equal(l.duties.find((d) => d.status === 'MissingOut').finalHours, null, 'no hours until the OUT is fixed');
});

test('open duty: Open while under 24 h, Missing OUT after; the 5-minute job notices without new punches', () => {
  const env = ready(), a = env.staff[0];
  env.setNow('2026-11-20T09:00:00+05:30');
  env.admin = ok(env.call('auth.login', { username: 'admin', password: 'Hospital2026x' })).token;
  punch(env, a, 'IN', '2026-11-20 08:00');
  process(env);
  assert.equal(list(env, '2026-11-20').duties[0].status, 'Open');
  env.setNow('2026-11-21T08:30:00+05:30');
  env.admin = ok(env.call('auth.login', { username: 'admin', password: 'Hospital2026x' })).token;
  process(env);
  assert.equal(list(env, '2026-11-20').duties[0].status, 'MissingOut');
  assert.equal(exc(env)[0].type, 'MISSING_OUT');
  // OUT finally uploaded from the tablet queue: becomes a normal (long) duty and the exception closes itself
  punch(env, a, 'OUT', '2026-11-20 20:10');
  process(env);
  const d = list(env, '2026-11-20').duties[0];
  assert.equal(d.status, 'Closed'); assert.equal(d.systemHours, 12);
  assert.ok(!exc(env).some((x) => x.type === 'MISSING_OUT'));
});

test('incremental processing: nothing new means nothing rewritten; two duties on one date add up', () => {
  const env = ready(), a = env.staff[0];
  punch(env, a, 'IN', '2026-11-18 08:00'); punch(env, a, 'OUT', '2026-11-18 20:00');
  punch(env, a, 'IN', '2026-11-18 20:05'); punch(env, a, 'OUT', '2026-11-19 08:00');
  assert.equal(process(env).duties, 2);
  assert.equal(process(env).staff, 0, 'no new punches, no open duties');
  const day = list(env, '2026-11-18').days[0];
  assert.deepEqual([day.total, day.h8, day.h4, day.dd, day.pending], [24, 8, 4, 12, 12]);
  assert.equal(list(env, '2026-11-18').duties.find((d) => d.inAt.endsWith('20:05:00+05:30')).shift, 'Night');
});

test('locked month: duties are frozen even if punches change', () => {
  const env = ready(), a = env.staff[0];
  env.setNow('2026-12-02T10:00:00+05:30');
  env.admin = ok(env.call('auth.login', { username: 'admin', password: 'Hospital2026x' })).token;
  punch(env, a, 'IN', '2026-11-28 08:00'); punch(env, a, 'OUT', '2026-11-28 20:00');
  process(env);
  env.sheet('MonthLocks').appendRow(['ML1', '2026-11', 'HK', 'LOCKED', '', 'admin', '', '', '']);
  env.ctx.Db.invalidate('MonthLocks');
  punch(env, a, 'OUT', '2026-11-28 21:00'); // late upload into a locked month
  process(env);
  const d = list(env, '2026-11-28').duties;
  assert.equal(d.length, 1); assert.equal(d[0].systemHours, 12);
});

test('rule versions: start on the 1st, preview shows the impact, rebuild applies from that date only', () => {
  const env = ready(), a = env.staff[0];
  punch(env, a, 'IN', '2026-11-18 08:14'); punch(env, a, 'OUT', '2026-11-18 20:00');
  process(env);
  assert.equal(list(env, '2026-11-18').duties[0].systemHours, 11);
  const pv = ok(env.call('rules.preview', { params: { graceMin: 15 }, from: '2026-11-01' }, env.admin));
  assert.equal(pv.changed, 1); assert.equal(pv.sample[0].before, 11); assert.equal(pv.sample[0].after, 12);
  assert.ok(env.call('rules.add', { params: { graceMin: 15 }, effectiveFrom: '2026-11-15', reason: 'x1x' }, env.admin).error.fields.effectiveFrom);
  assert.ok(env.call('rules.add', { params: { graceMin: 999 }, effectiveFrom: '2026-12-01', reason: 'x1x' }, env.admin).error.fields.graceMin);
  ok(env.call('rules.add', { params: { graceMin: 15 }, effectiveFrom: '2026-11-01', reason: 'Union agreement' }, env.admin));
  ok(env.call('duties.rebuild', { from: '2026-11-01', reason: 'new rules' }, env.admin));
  const d = list(env, '2026-11-18').duties[0];
  assert.equal(d.systemHours, 12); assert.equal(d.ruleId, 'RV2');
  assert.equal(ok(env.call('rules.list', {}, env.admin)).versions.length, 2);
  assert.equal(env.call('rules.add', { params: {}, effectiveFrom: '2027-01-01', reason: 'x1x' }, ok(env.call('auth.login', { username: 'admin', password: 'Hospital2026x' })).token).ok, true);
});

test('transfer: duties before the transfer keep the old department and rate', () => {
  const env = ready(), a = env.staff[0];
  env.setNow('2026-11-25T10:00:00+05:30');
  env.admin = ok(env.call('auth.login', { username: 'admin', password: 'Hospital2026x' })).token;
  punch(env, a, 'IN', '2026-11-18 08:00'); punch(env, a, 'OUT', '2026-11-18 20:00');
  ok(env.call('staff.transfer', { staffId: a, deptCode: 'SS', effectiveFrom: '2026-11-20', reason: 'Needed in SS' }, env.admin));
  punch(env, a, 'IN', '2026-11-21 08:00'); punch(env, a, 'OUT', '2026-11-21 20:00');
  process(env);
  const l = list(env, '2026-11-18', '2026-11-21').duties;
  assert.deepEqual(l.map((d) => [d.dutyDate, d.deptCode, d.ratePerDuty]).sort(), [['2026-11-18', 'HK', 800], ['2026-11-21', 'SS', 820]]);
});

test('tablet sync carries the current rules; triggers install once', () => {
  const env = ready();
  env.ctx.installTriggers(); env.ctx.installTriggers();
  assert.equal(env.ctx.ScriptApp.getProjectTriggers().length, 1);
  assert.equal(env.ctx.Kiosk.config().rules.graceMin, 10);
  assert.ok(env.sheet('Rules').rows.length === 2, 'default rule version created by setup');
});
