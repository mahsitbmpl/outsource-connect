'use strict';
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { makeEnv } = require('./gas-mock');
const L = require('../kiosk/js/logic.js');

const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.data; };
const ms = (s) => Date.parse(s.replace(' ', 'T') + ':00+05:30');
const iso = (s) => s.replace(' ', 'T') + ':00+05:30';

/** System with admin signed in, 1 company (HK, SS), rates, 4 HK staff and a tablet. */
function ready(nowIso) {
  const env = makeEnv(nowIso ? { now: Date.parse(nowIso) } : {});
  env.ctx.setup();
  const temp = /Temporary password: (\S+)/.exec(env.alerts[env.alerts.length - 1].text)[1];
  const t = ok(env.call('auth.login', { username: 'admin', password: temp })).token;
  env.call('auth.changePassword', { oldPassword: temp, newPassword: 'Hospital2026x' }, t);
  env.login = () => { env.admin = ok(env.call('auth.login', { username: 'admin', password: 'Hospital2026x' })).token; return env.admin; };
  env.login();
  const co = ok(env.call('companies.save', { name: 'Alpha Facility Services', code: 'ALPHA', deptCodes: 'HK,SS', contractStart: '2026-04-01', status: 'Active' }, env.admin));
  env.co = co;
  ok(env.call('rates.add', { companyId: co.companyId, deptCode: 'HK', designation: 'Staff', ratePerDuty: 800, gstPct: 18, effectiveFrom: '2026-04-01' }, env.admin));
  env.staff = [0, 1, 2, 3].map((i) => ok(env.call('staff.create', { title: 'Mr.', fullName: 'Worker ' + 'ABCD'[i], dob: '1990-01-01', mobile: '98100000' + (10 + i), deptCode: 'HK', designation: 'Staff', companyId: co.companyId, joinDate: '2026-11-01' }, env.admin)).staffId);
  env.creds = L.parseSetupCode(ok(env.call('devices.create', { name: 'Lobby' }, env.admin)).setupCode);
  env.punch = (staffId, type, when) => {
    const data = { punches: [{ punchId: crypto.randomUUID(), staffId, type, at: ms(when), deviceTime: ms(when), distance: 0.3, liveness: 'blink' }] };
    const payload = JSON.stringify(data), ts = String(env.ctx.Clock.nowMs()), nonce = crypto.randomBytes(4).readUInt32BE(0) + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    const sig = crypto.createHmac('sha256', env.creds.secret).update([env.creds.deviceId, ts, nonce, 'kiosk.punch', payload].join('\n')).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    env.ctx.Db.reset();
    const r = JSON.parse(env.ctx.doPost({ postData: { contents: JSON.stringify({ action: 'kiosk.punch', device: { id: env.creds.deviceId, ts, nonce, sig }, payload }) } }).content);
    assert.equal(r.ok, true, JSON.stringify(r.error));
    return data.punches[0].punchId;
  };
  env.process = () => ok(env.call('duties.processNow', {}, env.admin));
  env.duties = (from, to) => ok(env.call('duties.list', { from, to: to || from }, env.admin));
  env.exc = (status) => ok(env.call('exceptions.list', { status: status || 'Open' }, env.admin));
  env.api = (action, data) => env.call(action, data, env.admin);
  return env;
}
module.exports = { ready, ok, ms, iso };
