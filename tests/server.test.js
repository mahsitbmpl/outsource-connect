'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { makeEnv } = require('./gas-mock');

const NEW_PW = 'Hospital2026x';

/** Fresh system: setup + admin password changed + signed in. */
function ready() {
  const env = makeEnv();
  env.ctx.setup();
  const temp = /Temporary password: (\S+)/.exec(env.alerts[env.alerts.length - 1].text)[1];
  let r = env.call('auth.login', { username: 'admin', password: temp });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  env.call('auth.changePassword', { oldPassword: temp, newPassword: NEW_PW }, r.data.token);
  r = env.call('auth.login', { username: 'admin', password: NEW_PW });
  env.admin = r.data.token;
  return env;
}
function ok(r) { assert.equal(r.ok, true, JSON.stringify(r.error)); return r.data; }
function companyAndRates(env) {
  const co = ok(env.call('companies.save', { name: 'Alpha Facility Services', code: 'ALPHA', deptCodes: 'HK,SS', contractStart: '2026-04-01', status: 'Active' }, env.admin));
  ok(env.call('rates.add', { companyId: co.companyId, deptCode: 'HK', designation: 'Staff', ratePerDuty: 800, gstPct: 18, effectiveFrom: '2026-04-01' }, env.admin));
  const sec = ok(env.call('companies.save', { name: 'Beta Guarding', code: 'BETA', deptCodes: 'SC', contractStart: '2026-04-01', status: 'Active' }, env.admin));
  return { co, sec };
}
let mob = 9800000000;
function staff(extra) {
  mob++;
  return Object.assign({ title: 'Mr.', fullName: 'Test Person', dob: '1990-05-05', mobile: String(mob), deptCode: 'HK', designation: 'Staff', companyCode: 'ALPHA', joinDate: '2026-11-01' }, extra || {});
}

test('PBKDF2 implementation matches Node crypto (RFC 8018)', () => {
  const env = makeEnv();
  const salt = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const ours = Buffer.from(env.ctx.Auth.pbkdf2('correct horse', salt, 1000).map((b) => b & 0xff)).toString('hex');
  const node = crypto.pbkdf2Sync('correct horse', Buffer.from(salt), 1000, 32, 'sha256').toString('hex');
  assert.equal(ours, node);
  const h = env.ctx.Auth.hashPassword('Secret12345');
  assert.match(h, /^pbkdf2-sha256\$2000\$/);
  assert.equal(env.ctx.Auth.verifyPassword('Secret12345', h), true);
  assert.equal(env.ctx.Auth.verifyPassword('Secret12346', h), false);
});

test('setup creates tabs, settings, departments and a one-time Admin; re-run is harmless', () => {
  const env = makeEnv();
  env.ctx.setup();
  ['Settings', 'Departments', 'Companies', 'Rates', 'Staff', 'StaffHistory', 'Users', 'Sessions', 'LoginLog', 'AuditLog', 'MonthLocks']
    .forEach((t) => assert.ok(env.sheet(t), t + ' tab missing'));
  assert.equal(env.sheet('Sheet1'), null, 'empty Sheet1 removed');
  assert.match(env.alerts[0].text, /Temporary password/);
  const deps = env.sheet('Departments').rows.slice(1).map((r) => r[0]);
  assert.deepEqual(deps, ['HK', 'SS', 'SC']);
  const userRows = env.sheet('Users').rows.length;
  env.ctx.setup();
  assert.equal(env.sheet('Users').rows.length, userRows, 'second setup must not add users');
  assert.match(env.alerts[1].text, /already set up/);
  assert.equal(env.props.get('SPREADSHEET_ID'), 'TEST_SHEET_ID');
});

test('first sign-in forces a password change; weak passwords are refused', () => {
  const env = makeEnv(); env.ctx.setup();
  const temp = /Temporary password: (\S+)/.exec(env.alerts[0].text)[1];
  const r = ok(env.call('auth.login', { username: 'ADMIN', password: temp }));
  assert.equal(r.user.mustChange, true);
  const blocked = env.call('staff.list', {}, r.token);
  assert.equal(blocked.error.code, 'MUST_CHANGE_PASSWORD');
  const weak = env.call('auth.changePassword', { oldPassword: temp, newPassword: 'admin12345678' }, r.token);
  assert.equal(weak.error.code, 'VALIDATION');
  assert.ok(weak.error.fields.newPassword);
  ok(env.call('auth.changePassword', { oldPassword: temp, newPassword: NEW_PW }, r.token));
  assert.equal(ok(env.call('staff.list', {}, r.token)).length, 0);
});

test('lockout after 5 wrong passwords, then auto-unlock after 30 minutes', () => {
  const env = ready();
  for (let i = 0; i < 4; i++) assert.equal(env.call('auth.login', { username: 'admin', password: 'wrong' }).error.code, 'AUTH');
  assert.equal(env.call('auth.login', { username: 'admin', password: 'wrong' }).error.code, 'LOCKED');
  assert.equal(env.call('auth.login', { username: 'admin', password: NEW_PW }).error.code, 'LOCKED', 'correct password still locked');
  env.advanceMinutes(31);
  ok(env.call('auth.login', { username: 'admin', password: NEW_PW }));
  const log = env.sheet('LoginLog').rows.slice(1).map((r) => r[2]);
  assert.ok(log.includes('LOCKED') && log.includes('OK') && log.includes('FAIL'));
});

test('sessions end after 30 idle minutes and after 8 hours; logout revokes', () => {
  const env = ready();
  env.advanceMinutes(29); ok(env.call('auth.me', {}, env.admin));
  env.advanceMinutes(31);
  assert.equal(env.call('auth.me', {}, env.admin).error.code, 'AUTH');
  const t2 = ok(env.call('auth.login', { username: 'admin', password: NEW_PW })).token;
  for (let i = 0; i < 16; i++) { env.advanceMinutes(29); ok(env.call('auth.me', {}, t2)); } // 464 minutes
  env.advanceMinutes(29);
  assert.equal(env.call('auth.me', {}, t2).error.code, 'AUTH', 'absolute 8 hour limit');
  const t3 = ok(env.call('auth.login', { username: 'admin', password: NEW_PW })).token;
  ok(env.call('auth.logout', {}, t3));
  assert.equal(env.call('auth.me', {}, t3).error.code, 'AUTH');
  env.cacheStore.clear(); // cache eviction must not revive a session
  assert.equal(env.call('auth.me', {}, t3).error.code, 'AUTH');
});

test('Admin manages Ops managers; Ops cannot reach Admin actions', () => {
  const env = ready();
  const u = ok(env.call('users.create', { username: 'rina.shah', fullName: 'Rina Shah', role: 'OPS' }, env.admin));
  assert.ok(u.tempPassword.length >= 12);
  assert.equal(env.call('users.create', { username: 'rina.shah', fullName: 'Rina Shah' }, env.admin).error.fields.username, 'This username already exists');
  let t = ok(env.call('auth.login', { username: 'rina.shah', password: u.tempPassword })).token;
  ok(env.call('auth.changePassword', { oldPassword: u.tempPassword, newPassword: 'Opsmanager2026' }, t));
  assert.equal(env.call('users.list', {}, t).error.code, 'FORBIDDEN');
  assert.equal(env.call('settings.update', { key: 'titles', value: 'Mr.', reason: 'test' }, t).error.code, 'FORBIDDEN');
  ok(env.call('staff.list', {}, t));
  // disable revokes sessions
  assert.equal(env.call('users.setActive', { username: 'rina.shah', active: false }, env.admin).error.fields.reason !== undefined, true);
  ok(env.call('users.setActive', { username: 'rina.shah', active: false, reason: 'Left the job' }, env.admin));
  assert.equal(env.call('auth.me', {}, t).error.code, 'AUTH');
  // cannot disable the last admin
  assert.equal(env.call('users.setActive', { username: 'admin', active: false, reason: 'test' }, env.admin).error.code, 'VALIDATION');
  // reset password
  ok(env.call('users.setActive', { username: 'rina.shah', active: true, reason: 'Back' }, env.admin));
  const rp = ok(env.call('users.resetPassword', { username: 'rina.shah', reason: 'Forgot' }, env.admin));
  t = ok(env.call('auth.login', { username: 'rina.shah', password: rp.tempPassword }));
  assert.equal(t.user.mustChange, true);
});

test('settings are validated and audited', () => {
  const env = ready();
  assert.ok(env.call('settings.update', { key: 'emailMorningTime', value: '9 am', reason: 'change' }, env.admin).error.fields.value);
  ok(env.call('settings.update', { key: 'emailMorningTime', value: '09:15', reason: 'Owner asked' }, env.admin));
  assert.ok(env.call('settings.update', { key: 'emailTo', value: 'a@b.com, not-an-email', reason: 'x1x' }, env.admin).error.fields.value);
  const list = ok(env.call('settings.list', {}, env.admin));
  assert.equal(list.find((s) => s.key === 'emailMorningTime').value, '09:15');
  const audit = ok(env.call('audit.recent', { entity: 'Settings' }, env.admin));
  assert.equal(audit[0].action, 'settings.update');
  assert.equal(audit[0].reason, 'Owner asked');
});

test('companies: validation, unique code, update needs reason', () => {
  const env = ready();
  const bad = env.call('companies.save', { name: 'X', code: '1', deptCodes: '', contractStart: '' }, env.admin);
  assert.deepEqual(Object.keys(bad.error.fields).sort(), ['code', 'contractStart', 'deptCodes', 'name']);
  const { co } = companyAndRates(env);
  assert.equal(co.companyId, 'CO001');
  assert.ok(env.call('companies.save', { name: 'Other', code: 'ALPHA', deptCodes: 'HK', contractStart: '2026-04-01' }, env.admin).error.fields.code);
  const upd = Object.assign({}, co, { contactName: 'New Contact', deptCodes: co.deptCodes.join(',') });
  assert.ok(env.call('companies.save', upd, env.admin).error.fields.reason);
  ok(env.call('companies.save', Object.assign(upd, { reason: 'Contact changed' }), env.admin));
});

test('rate cards: new rate closes the old one, lookups by date, locked months are protected', () => {
  const env = ready();
  const { co } = companyAndRates(env);
  ok(env.call('rates.add', { companyId: co.companyId, deptCode: 'HK', designation: 'Staff', ratePerDuty: 850, gstPct: 18, effectiveFrom: '2026-12-01' }, env.admin));
  const det = ok(env.call('companies.get', { companyId: co.companyId }, env.admin));
  const hk = det.rates.filter((r) => r.deptCode === 'HK' && r.designation === 'Staff');
  assert.equal(hk.length, 2);
  assert.equal(hk[0].effectiveTo, '2026-11-30');
  assert.equal(env.ctx.Rates.rateFor(co.companyId, 'HK', 'Staff', '2026-11-30').ratePerDuty, 800);
  assert.equal(env.ctx.Rates.rateFor(co.companyId, 'HK', 'Staff', '2026-12-01').ratePerDuty, 850);
  assert.equal(env.ctx.Rates.rateFor(co.companyId, 'HK', 'Staff', '2026-03-31'), null);
  // older start date than the latest is refused
  assert.ok(env.call('rates.add', { companyId: co.companyId, deptCode: 'HK', designation: 'Staff', ratePerDuty: 900, gstPct: 18, effectiveFrom: '2026-10-01' }, env.admin).error.fields.effectiveFrom);
  // company that does not serve SC
  assert.ok(env.call('rates.add', { companyId: co.companyId, deptCode: 'SC', designation: 'Staff', ratePerDuty: 900, gstPct: 18, effectiveFrom: '2027-01-01' }, env.admin).error.fields.deptCode);
  // locked month
  env.sheet('MonthLocks').appendRow(['ML1', '2027-01', 'HK', 'LOCKED', '', 'admin', '', '', '']);
  env.ctx.Db.invalidate('MonthLocks');
  assert.match(env.call('rates.add', { companyId: co.companyId, deptCode: 'HK', designation: 'Staff', ratePerDuty: 900, gstPct: 18, effectiveFrom: '2027-01-15' }, env.admin).error.fields.effectiveFrom, /locked/);
  assert.equal(env.call('rates.void', { rateId: hk[1].rateId, reason: 'Wrong amount' }, env.admin).error.code, 'VALIDATION', 'Dec rate stays open into locked Jan');
  const v = ok(env.call('rates.void', { rateId: hk[0].rateId, reason: 'Typed wrong' }, env.admin));
  assert.equal(v.status, 'Void');
});

test('staff: department-coded IDs, validation, restricted data stays server-side validated', () => {
  const env = ready();
  companyAndRates(env);
  const a = ok(env.call('staff.create', staff(), env.admin));
  const b = ok(env.call('staff.create', staff({ designation: 'Supervisor' }), env.admin));
  const c = ok(env.call('staff.create', staff({ deptCode: 'SC', companyCode: 'BETA' }), env.admin));
  assert.deepEqual([a.staffId, b.staffId, c.staffId], ['HK001', 'HK002', 'SC001']);
  assert.equal(a.age, 36);
  assert.equal(a.faceStatus, 'Not enrolled');
  const dup = env.call('staff.create', staff({ mobile: a.mobile }), env.admin);
  assert.match(dup.error.fields.mobile, /HK001/);
  const young = env.call('staff.create', staff({ dob: '2010-01-01' }), env.admin);
  assert.ok(young.error.fields.dob);
  const wrongCo = env.call('staff.create', staff({ deptCode: 'SC' }), env.admin);
  assert.match(wrongCo.error.fields.companyId, /does not serve/);
  // formula injection in a free-text field is neutralised in the sheet and read back clean
  const upd = ok(env.call('staff.update', { staffId: 'HK001', title: 'Mr.', fullName: 'Test Person', dob: '1990-05-05', mobile: a.mobile, vendorCode: '=IMPORTXML("http://x")', reason: 'Vendor code' }, env.admin));
  assert.equal(upd.vendorCode, '=IMPORTXML("http://x")');
  const cell = env.sheet('Staff').rows[1][13];
  assert.equal(cell, '\'=IMPORTXML("http://x")');
  // dates stay as text
  assert.equal(env.sheet('Staff').rows[1][3], '1990-05-05');
});

test('staff: transfer keeps ID and records history; exit and re-join', () => {
  const env = ready();
  companyAndRates(env);
  env.setNow('2026-11-25T10:00:00+05:30');
  env.admin = ok(env.call('auth.login', { username: 'admin', password: NEW_PW })).token;
  const a = ok(env.call('staff.create', staff({ joinDate: '2026-11-01' }), env.admin));
  // SS is served by ALPHA too
  const t = ok(env.call('staff.transfer', { staffId: a.staffId, deptCode: 'SS', effectiveFrom: '2026-11-20', reason: 'Needed in Support' }, env.admin));
  assert.equal(t.staffId, 'HK001');
  assert.equal(t.deptCode, 'SS');
  assert.equal(env.ctx.Staff.valueOn('HK001', 'department', '2026-11-19'), 'HK');
  assert.equal(env.ctx.Staff.valueOn('HK001', 'department', '2026-11-20'), 'SS');
  assert.equal(env.ctx.Staff.valueOn('HK001', 'company', '2026-11-25'), 'CO001');
  assert.ok(env.call('staff.transfer', { staffId: 'HK001', deptCode: 'SC', effectiveFrom: '2026-11-24', reason: 'x1x' }, env.admin).error.fields.companyId);
  assert.ok(env.call('staff.transfer', { staffId: 'HK001', deptCode: 'HK', effectiveFrom: '2026-12-24', reason: 'x1x' }, env.admin).error.fields.effectiveFrom, 'future date refused');
  // exit
  const ex = ok(env.call('staff.exit', { staffId: 'HK001', exitDate: '2026-11-24', exitReason: 'Resigned' }, env.admin));
  assert.equal(ex.status, 'Exited');
  assert.equal(env.ctx.Staff.valueOn('HK001', 'department', '2026-11-25'), null);
  // a new joiner may reuse the exited person's mobile
  ok(env.call('staff.create', staff({ mobile: a.mobile }), env.admin));
  const rj = env.call('staff.reactivate', { staffId: 'HK001', rejoinDate: '2026-11-25', reason: 'Came back' }, env.admin);
  assert.match(rj.error.fields.rejoinDate, /HK002/);
  const full = ok(env.call('staff.get', { staffId: 'HK001' }, env.admin));
  assert.equal(full.history.length, 4); // joined x3 + department change
  assert.ok(full.history.every((h) => h.effectiveTo), 'all history rows closed at exit');
});

test('bulk import: dry run reports every problem, commit is all-or-nothing', () => {
  const env = ready();
  companyAndRates(env);
  const rows = [staff(), staff({ dob: '31-02-1990' }), staff({ companyCode: 'NOPE' }), staff()];
  rows[3].mobile = rows[0].mobile;
  const dry = ok(env.call('staff.import', { rows, commit: true }, env.admin));
  assert.equal(dry.committed, false);
  assert.equal(dry.invalid, 3);
  assert.ok(dry.report[1].errors.dob);
  assert.ok(dry.report[2].errors.companyId);
  assert.match(dry.report[3].errors.mobile, /row 2/);
  assert.equal(ok(env.call('staff.list', {}, env.admin)).length, 0);
  const good = [staff(), staff({ deptCode: 'SS' }), staff({ title: 'Ms.', fullName: "Neha D'Souza" })];
  const res = ok(env.call('staff.import', { rows: good, commit: true }, env.admin));
  assert.equal(res.committed, true);
  assert.deepEqual(res.created, ['HK001', 'SS001', 'HK002']);
});

test('demo data: add and remove; ID counters restart after real staff', () => {
  const env = ready();
  env.ctx.seedDemoData();
  assert.equal(ok(env.call('staff.list', {}, env.admin)).length, 30);
  companyAndRates(env);
  ok(env.call('staff.create', staff(), env.admin)); // real HK015
  env.ctx.removeDemoData();
  const list = ok(env.call('staff.list', {}, env.admin));
  assert.deepEqual(list.map((s) => s.staffId), ['HK015']);
  const next = ok(env.call('staff.create', staff(), env.admin));
  assert.equal(next.staffId, 'HK016');
  const sc = ok(env.call('staff.create', staff({ deptCode: 'SC', companyCode: 'BETA' }), env.admin));
  assert.equal(sc.staffId, 'SC001');
});

test('API envelope: bad JSON, unknown action, missing token, internal errors hidden', () => {
  const env = ready();
  let out = JSON.parse(env.ctx.doPost({ postData: { contents: '{bad' } }).content);
  assert.equal(out.error.code, 'BAD_REQUEST');
  assert.equal(env.call('nope', {}).error.code, 'BAD_REQUEST');
  assert.equal(env.call('staff.list', {}).error.code, 'AUTH');
  assert.match(env.call('ping').serverTime, /\+05:30$/);
  env.ctx.ROUTES['boom'] = ['*', () => { throw new TypeError('secret detail'); }];
  out = env.call('boom');
  assert.equal(out.error.code, 'INTERNAL');
  assert.ok(!out.error.message.includes('secret'));
});

test('Date objects coming back from Sheets are read as IST dates', () => {
  const env = ready();
  companyAndRates(env);
  ok(env.call('staff.create', staff(), env.admin));
  // someone types a date into the sheet by hand: Sheets stores a Date (midnight IST)
  env.sheet('Staff').rows[1][8] = new Date('2026-11-01T00:00:00+05:30');
  env.ctx.Db.invalidate('Staff');
  assert.equal(ok(env.call('staff.get', { staffId: 'HK001' }, env.admin)).joinDate, '2026-11-01');
});
