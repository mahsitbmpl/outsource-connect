'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { ready, ok, iso } = require('./helpers');

const W = (o) => Object.assign({ reasonCode: 'Other', note: 'Checked with supervisor' }, o);
const bytes = (b64) => Buffer.from(b64, 'base64');
const at = (env, when) => { env.setNow(when); env.login(); };

/** November with one of each problem: over 12 h, late arrival, missing OUT; a deduction and a penalty. */
function november() {
  const env = ready('2026-11-25T09:00:00+05:30');
  const [A, B, C, D] = env.staff;
  env.punch(A, 'IN', '2026-11-02 08:00'); env.punch(A, 'OUT', '2026-11-02 20:00');
  env.punch(B, 'IN', '2026-11-02 08:05'); env.punch(B, 'OUT', '2026-11-02 20:32');
  env.punch(C, 'IN', '2026-11-03 09:05'); env.punch(C, 'OUT', '2026-11-03 20:00');
  env.punch(D, 'IN', '2026-11-04 08:00');
  env.process();
  ok(env.api('penalties.add', { date: '2026-11-10', deptCode: 'HK', amount: 500, reason: 'Grooming not as per SOP' }));
  ok(env.api('deductions.add', { date: '2026-11-02', staffId: A, hours: 4, reason: 'Left early without relief' }));
  ok(env.api('settings.update', { key: 'emailTo', value: 'ops@example.com', reason: 'Set up emails' }));
  return env;
}
function fixAll(env) {
  const [, B, C] = env.staff;
  ok(env.api('decide.approve', W({ staffId: B, date: '2026-11-02', approve: true, reasonCode: 'Emergency', note: 'ICU cover' })));
  const dc = env.duties('2026-11-03').duties.find((d) => d.staffId === C);
  ok(env.api('decide.grace', W({ dutyId: dc.dutyId, dutyDate: dc.dutyDate, choice: 'grace', reasonCode: 'Transport problem', note: 'Bus late' })));
  const mo = env.exc().find((x) => x.type === 'MISSING_OUT');
  ok(env.api('fix.setOut', W({ dutyId: mo.dutyId, dutyDate: mo.dutyDate, at: mo.suggestion.outAt, reasonCode: 'Forgot to punch' })));
}

test('month end: blockers, draft files, lock, final bill, locked edits refused, summary email, unlock and revision', () => {
  const env = november();
  // the month is not over yet
  let st = ok(env.api('month.status', { month: '2026-11' }));
  assert.equal(st.monthOver, false);
  assert.match(env.api('month.lock', { month: '2026-11', deptCode: 'HK' }).error.message, /not over yet/);

  at(env, '2026-12-02T10:00:00+05:30');
  env.process();
  st = ok(env.api('month.status', { month: '2026-11' }));
  const hk = st.departments.find((d) => d.deptCode === 'HK');
  assert.equal(hk.companies.length, 1);
  assert.equal(hk.companies[0].ready, false);
  const types = hk.companies[0].blockers.map((b) => b.type).sort();
  assert.deepEqual(types, ['EXC_LATE_GRACE', 'EXC_LONG_DUTY', 'EXC_MISSING_OUT', 'OPEN_DUTY', 'PENDING_HOURS'].filter((t) => types.includes(t)));
  assert.ok(types.includes('EXC_MISSING_OUT') && types.includes('EXC_LATE_GRACE') && types.includes('EXC_LONG_DUTY'));
  const nr = env.api('month.lock', { month: '2026-11', deptCode: 'HK' });
  assert.equal(nr.error.code, 'NOT_READY');
  assert.match(nr.error.message, /Missing OUT/);
  assert.ok(env.api('month.lock', { month: '2026-11', deptCode: 'HK', force: true }).error.fields.reason, 'forced lock needs a reason');

  fixAll(env);
  const pv = ok(env.api('month.preview', { month: '2026-11', deptCode: 'HK', companyId: env.co.companyId }));
  assert.equal(pv.ready, true, JSON.stringify(pv.blockers));
  assert.equal(pv.lines.length, 1);
  const l = pv.lines[0];
  assert.deepEqual([l.h8, l.h4, l.dd, l.total, l.dedH, l.netH], [32, 15, 0.5, 47.5, 4, 43.5]);
  assert.equal(l.amount, 2900);
  assert.deepEqual([pv.gross, pv.penaltyTotal, pv.taxable, pv.gst, pv.net, pv.payable], [2900, 500, 2400, 432, 2832, 2832]);
  assert.equal(pv.words, 'Rupees Two Thousand Eight Hundred Thirty Two Only');

  // draft downloads
  const dx = ok(env.api('month.file', { month: '2026-11', deptCode: 'HK', companyId: env.co.companyId, kind: 'xlsx' }));
  assert.match(dx.name, /^OSC_HK_2026-11_ALPHA_DRAFT\.xlsx$/);
  assert.equal(bytes(dx.base64).slice(0, 2).toString(), 'PK');
  assert.equal(dx.final, false);
  const dp = ok(env.api('month.file', { month: '2026-11', deptCode: 'HK', companyId: env.co.companyId, kind: 'pdf' }));
  assert.ok(bytes(dp.base64).toString('latin1').includes('(DRAFT)'));

  // lock HK
  const lk = ok(env.api('month.lock', { month: '2026-11', deptCode: 'HK' }));
  assert.equal(lk.bills.length, 1);
  assert.equal(lk.bills[0].billNo, 'MAH-OSC/HK/2026-11/ALPHA');
  assert.equal(lk.bills[0].payable, 2832);
  assert.equal(lk.summaryEmail, null, 'other departments still open, no summary yet');
  const fin = ok(env.api('month.file', { month: '2026-11', deptCode: 'HK', companyId: env.co.companyId, kind: 'pdf' }));
  assert.equal(fin.final, true);
  assert.match(fin.name, /^OSC_HK_2026-11_ALPHA_bill\.pdf$/);
  assert.ok(!bytes(fin.base64).toString('latin1').includes('(DRAFT)'));
  assert.ok(bytes(fin.base64).toString('latin1').includes('MAH-OSC/HK/2026-11/ALPHA'));
  const bill = ok(env.api('month.bills', { month: '2026-11' }))[0];
  assert.equal(bill.status, 'Final');
  assert.ok(bill.xlsxFileId && bill.pdfFileId);
  // nothing in a locked month can change
  assert.match(env.api('penalties.add', { date: '2026-11-20', deptCode: 'HK', amount: 100, reason: 'Late' }).error.fields.date, /locked/);
  assert.match(env.api('deductions.add', { date: '2026-11-20', staffId: env.staff[0], hours: 2, reason: 'Late' }).error.fields.date, /locked/);
  assert.equal(env.api('month.lock', { month: '2026-11', deptCode: 'HK' }).error.code, 'VALIDATION');
  const audit = ok(env.api('audit.recent', { limit: 20 }));
  assert.ok(audit.some((a) => a.action === 'month.lock'));

  // lock the other departments (no duties there) -> monthly summary email with the PDF attached
  ok(env.api('month.lock', { month: '2026-11', deptCode: 'SS' }));
  const last = ok(env.api('month.lock', { month: '2026-11', deptCode: 'SC' }));
  assert.equal(last.summaryEmail.status, 'SENT');
  const mail = env.mails[env.mails.length - 1];
  assert.match(mail.subject, /Monthly summary · Nov-2026 · net payable ₹ 2,832/);
  assert.equal(mail.to, 'ops@example.com');
  assert.equal(mail.attachments.length, 1);
  assert.match(mail.htmlBody, /MAH-OSC\/HK\/2026-11\/ALPHA/);

  // unlock (Admin, reason) and lock again -> revision R1, old bill superseded
  assert.ok(env.api('month.unlock', { month: '2026-11', deptCode: 'HK' }).error);
  ok(env.api('month.unlock', { month: '2026-11', deptCode: 'HK', reason: 'Vendor disputed one duty' }));
  ok(env.api('penalties.add', { date: '2026-11-20', deptCode: 'HK', amount: 100, reason: 'Late reporting' }));
  const lk2 = ok(env.api('month.lock', { month: '2026-11', deptCode: 'HK' }));
  assert.equal(lk2.bills[0].billNo, 'MAH-OSC/HK/2026-11/ALPHA-R1');
  assert.equal(lk2.bills[0].payable, Math.round((2900 - 600) * 1.18));
  const bills = ok(env.api('month.bills', { month: '2026-11' }));
  assert.deepEqual(bills.filter((b) => b.deptCode === 'HK').map((b) => b.status).sort(), ['Final', 'Superseded']);
});

test('Ops manager cannot force a lock or unlock', () => {
  const env = november();
  at(env, '2026-12-02T10:00:00+05:30');
  ok(env.api('users.create', { username: 'opsmgr', fullName: 'Ops Manager', role: 'OPS', reason: 'New user' }));
  const temp = env.alerts.length ? null : null; void temp;
  const u = env.ctx.Db.find('Users', 'opsmgr'); assert.ok(u);
  // sign in as Ops: reset with a known password through the server helpers
  env.ctx.Db.update('Users', 'opsmgr', { pwHash: env.ctx.Auth.hashPassword('Opsmanager2026'), mustChange: false });
  env.newRequest();
  const t = ok(env.call('auth.login', { username: 'opsmgr', password: 'Opsmanager2026' })).token;
  assert.equal(env.call('month.lock', { month: '2026-11', deptCode: 'HK', force: true, reason: 'Vendor deadline' }, t).error.code, 'FORBIDDEN');
  assert.equal(env.call('month.unlock', { month: '2026-11', deptCode: 'HK', reason: 'x' }, t).error.code, 'FORBIDDEN');
  // Admin may force with a reason
  const f = ok(env.api('month.lock', { month: '2026-11', deptCode: 'HK', force: true, reason: 'Vendor deadline, items checked on paper' }));
  assert.equal(f.locked, true);
  assert.equal(ok(env.api('month.bills', { month: '2026-11' }))[0].forced, 'Vendor deadline, items checked on paper');
});

test('company comparison and rule what-if use the same hours', () => {
  const env = november();
  at(env, '2026-12-02T10:00:00+05:30');
  env.process(); fixAll(env);
  const beta = ok(env.api('companies.save', { name: 'Beta Services', code: 'BETA', deptCodes: 'HK', contractStart: '2026-04-01', status: 'Active' }));
  ok(env.api('rates.add', { companyId: beta.companyId, deptCode: 'HK', designation: 'Staff', ratePerDuty: 750, gstPct: 18, effectiveFrom: '2026-04-01' }));
  const cmp = ok(env.api('month.compare', { month: '2026-11', deptCode: 'HK' }));
  assert.equal(cmp.companies.length, 2);
  assert.equal(cmp.companies[0].code, 'BETA', 'cheapest first');
  assert.equal(cmp.companies[0].gross, Math.round(43.5 / 12 * 750 * 100) / 100);
  assert.equal(cmp.companies[1].gross, 2900);
  assert.equal(cmp.companies[1].current, true);
  assert.equal(cmp.hours.netH, 43.5);

  const wi = ok(env.api('month.whatIfRules', { month: '2026-11', deptCode: 'HK', params: { extraHalfFromMin: 35 } }));
  assert.equal(wi.changedDuties, 1); // 20:32 OUT no longer earns half an hour
  assert.equal(wi.companies[0].proposed.hours, 43);
  assert.ok(wi.companies[0].difference < 0);
  assert.ok(env.api('month.whatIfRules', { month: '2026-11', deptCode: 'HK', params: { graceMin: 999 } }).error.fields);
});

test('automation: emails at their times once a day, tablet alert and recovery, draft pack on the 1st, backup, clean-up, archive', () => {
  const env = november();
  const tick = (when) => { env.setNow(when); env.newRequest(); return env.ctx.processPunchesJob(); };
  const subjects = () => env.mails.map((m) => m.subject);

  // 1st of December 07:05 -> draft packs for November (+ email with draft PDF)
  tick('2026-12-01T07:05:00+05:30');
  let s = subjects();
  assert.ok(s.some((x) => /^Draft month-end pack · Nov-2026 · \d+ need attention/.test(x)), s.join('\n'));
  const draftMail = env.mails.find((m) => /^Draft month-end pack/.test(m.subject));
  assert.equal(draftMail.attachments.length, 1);
  assert.match(draftMail.attachments[0].getName(), /_DRAFT_bill\.pdf$/);
  // tablet silent since 25-Nov -> alert, only once
  assert.ok(s.some((x) => /^Tablet alert: Lobby · Silent for/.test(x)));
  const n1 = env.mails.length;
  tick('2026-12-01T07:10:00+05:30');
  assert.equal(env.mails.length, n1, 'no repeat while nothing changed');
  // tablet back -> one recovery email
  env.ctx.Db.update('Devices', 'TAB1', { lastSeenAt: env.ctx.Clock.now(), battery: 80, charging: true, cameraOk: true, queueSize: 0 });
  env.ctx.CacheService.getScriptCache().put('seenAt:TAB1', env.ctx.Clock.now());
  tick('2026-12-01T07:12:00+05:30');
  assert.match(env.mails[env.mails.length - 1].subject, /^Tablet OK: Lobby is back/);
  const keepSeen = () => { env.ctx.Db.update('Devices', 'TAB1', { lastSeenAt: env.ctx.Clock.now() }); env.ctx.CacheService.getScriptCache().put('seenAt:TAB1', env.ctx.Clock.now()); };

  // morning email at 09:00, once
  keepSeen(); tick('2026-12-01T08:55:00+05:30');
  assert.ok(!subjects().some((x) => /^Morning report/.test(x)));
  keepSeen(); tick('2026-12-01T09:02:00+05:30');
  keepSeen(); tick('2026-12-01T09:07:00+05:30');
  assert.equal(subjects().filter((x) => /^Morning report · 30-Nov-2026/.test(x)).length, 1);
  const morning = env.mails.find((m) => /^Morning report/.test(m.subject));
  assert.match(morning.htmlBody, /Yesterday by department/);
  assert.match(morning.body, /Needs attention/);
  // evening at 17:30
  keepSeen(); tick('2026-12-01T17:31:00+05:30');
  assert.equal(subjects().filter((x) => /^Evening report · 01-Dec-2026/.test(x)).length, 1);

  // retention: photo month folders older than 180 days go to the bin
  const photosId = env.props.get('DRIVE_PHOTOS_ID'), photos = env.folders.get(photosId);
  const oldF = photos.createFolder('2026-01'), newF = photos.createFolder('2026-11');
  keepSeen(); tick('2026-12-02T03:05:00+05:30');
  assert.equal(oldF.trashed, true); assert.equal(newF.trashed, false);

  // weekly backup on Sunday 02:00; keep only the newest N
  env.login(); ok(env.api('settings.update', { key: 'backupKeep', value: '1', reason: 'Test' }));
  keepSeen(); tick('2026-12-06T02:10:00+05:30');
  keepSeen(); tick('2026-12-13T02:10:00+05:30');
  const backups = env.folders.get(env.props.get('DRIVE_BACKUPS_ID'));
  const live = backups.fileIds.map((id) => env.fileObjs.get(id)).filter((f) => !f.trashed).map((f) => f.name);
  assert.deepEqual(live, ['OutSource Connect backup 2026-12-13']);

  // year roll-over: next year's tabs from 15-Dec; tabs older than 3 full years move to an archive file
  const old = env.book.insertSheet('Punches_2022'); old.rows = [['punchId'], ['P1'], ['P2']];
  keepSeen(); tick('2026-12-16T01:05:00+05:30');
  assert.ok(env.sheet('Punches_2027') && env.sheet('Duties_2027'));
  assert.equal(env.sheet('Punches_2022'), null);
  const arch = [...env.books.values()][0];
  assert.equal(arch.getSheetByName('Punches_2022').rows.length, 3);

  // status for the console
  env.login();
  const js = ok(env.api('jobs.status', {}));
  assert.equal(js.jobs.find((j) => j.id === 'weeklyBackup').lastStatus, 'OK');
  assert.ok(js.log.some((r) => r.job === 'monthDraft'));
  const el = ok(env.api('email.log', {}));
  assert.ok(el.some((r) => r.kind === 'MORNING' && r.status === 'SENT'));
});

test('automation: a failing job is logged, Admin is told once, and it is retried; no recipients = skipped', () => {
  const env = november();
  env.props.delete('DRIVE_BACKUPS_ID');
  const tick = (when) => { env.setNow(when); env.newRequest(); return env.ctx.processPunchesJob(); };
  tick('2026-12-06T02:05:00+05:30');
  const r = tick('2026-12-06T02:10:00+05:30').find((x) => x.job === 'weeklyBackup');
  assert.equal(r.status, 'FAILED');
  assert.equal(env.mails.filter((m) => /automatic job failed · Weekly backup/.test(m.subject)).length, 1);
  tick('2026-12-06T02:15:00+05:30');
  assert.equal(tick('2026-12-06T02:20:00+05:30').filter((x) => x.job === 'weeklyBackup').length, 0, 'gives up after 3 tries until next week');
  env.login();
  ok(env.api('settings.update', { key: 'emailTo', value: '', reason: 'Off' }));
  ok(env.api('jobs.run', { job: 'morningEmail' }));
  assert.equal(ok(env.api('email.log', {}))[0].status, 'SKIPPED');
  // preview for the console
  const pv = ok(env.api('email.preview', { kind: 'evening' }));
  assert.match(pv.subject, /^Evening report/);
  assert.match(pv.html, /Departments now/);
  assert.equal(env.api('settings.update', { key: 'backupDay', value: 'Funday', reason: 'x' }).error.code, 'VALIDATION');
  ok(env.api('settings.update', { key: 'backupDay', value: 'sat', reason: 'Weekend' }));
});
