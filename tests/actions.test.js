'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ready, ok, iso } = require('./helpers');

const R = { reasonCode: 'Forgot to punch', note: 'Confirmed with supervisor' };
const W = (o) => Object.assign({}, R, o);

test('set missing OUT: manual OUT punch added, duty closed, exception resolved, tablet punch untouched', () => {
  const env = ready(), a = env.staff[0];
  env.punch(a, 'IN', '2026-11-17 08:02');
  env.process();
  const ex = env.exc().find((x) => x.type === 'MISSING_OUT');
  assert.ok(ex);
  // validation: reason, time before IN
  assert.ok(env.api('fix.setOut', { dutyId: ex.dutyId, dutyDate: ex.dutyDate, at: ex.suggestion.outAt }).error.fields.reasonCode);
  assert.ok(env.api('fix.setOut', W({ dutyId: ex.dutyId, dutyDate: ex.dutyDate, at: iso('2026-11-17 07:00') })).error.fields.at);
  ok(env.api('fix.setOut', W({ dutyId: ex.dutyId, dutyDate: ex.dutyDate, at: ex.suggestion.outAt })));
  const d = env.duties('2026-11-17').duties[0];
  assert.equal(d.status, 'Closed'); assert.equal(d.systemHours, 12);
  const all = env.exc('All').find((x) => x.exceptionId === ex.exceptionId);
  assert.equal(all.status, 'Resolved'); assert.equal(all.resolvedBy, 'admin'); assert.match(all.resolution, /Forgot to punch/);
  const rows = env.sheet('Punches_2026').rows.slice(1);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][6], 'MANUAL'); assert.match(rows[1][12], /By admin/);
  assert.equal(rows[0][6], 'TAB1');
  // a second OUT at the same time is refused
  assert.equal(env.api('fix.setOut', W({ dutyId: ex.dutyId, dutyDate: ex.dutyDate, at: ex.suggestion.outAt })).error.code, 'VALIDATION');
});

test('add missing IN re-pairs automatically', () => {
  const env = ready(), b = env.staff[1];
  env.punch(b, 'OUT', '2026-11-18 20:03');
  env.process();
  const ex = env.exc().find((x) => x.type === 'MISSING_IN');
  ok(env.api('fix.addIn', W({ dutyId: ex.dutyId, dutyDate: ex.dutyDate, at: ex.suggestion.inAt })));
  const list = env.duties('2026-11-18').duties;
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'Closed'); assert.equal(list[0].systemHours, 12);
  assert.equal(env.exc().filter((x) => x.type === 'MISSING_IN').length, 0);
});

test('split a 36-hour duty at 08:00 next day: 24 h on day 1, 12 h on day 2', () => {
  const env = ready(), a = env.staff[0];
  env.punch(a, 'IN', '2026-11-17 08:00'); env.punch(a, 'OUT', '2026-11-18 20:00');
  env.process();
  const d = env.duties('2026-11-17').duties[0];
  assert.equal(d.systemHours, 36);
  assert.ok(env.api('fix.split', W({ dutyId: d.dutyId, dutyDate: d.dutyDate, at: iso('2026-11-17 08:30') })).error.fields.at);
  ok(env.api('fix.split', W({ dutyId: d.dutyId, dutyDate: d.dutyDate, at: iso('2026-11-18 08:00'), reasonCode: 'Hospital requirement' })));
  const l = env.duties('2026-11-17', '2026-11-18').duties.sort((x, y) => (x.dutyDate < y.dutyDate ? -1 : 1));
  assert.deepEqual(l.map((x) => [x.dutyDate, x.systemHours]), [['2026-11-17', 24], ['2026-11-18', 12]]);
});

test('over 12 h: approve all, or approve 12 h only; revoking reopens it', () => {
  const env = ready(), a = env.staff[0];
  env.punch(a, 'IN', '2026-11-18 08:00'); env.punch(a, 'OUT', '2026-11-19 01:00');
  env.process();
  assert.equal(env.duties('2026-11-18').days[0].pending, 5);
  ok(env.api('decide.approve', W({ staffId: a, date: '2026-11-18', approve: false, reasonCode: 'Other', note: 'Only 12 h agreed' })));
  let day = env.duties('2026-11-18').days[0];
  assert.deepEqual([day.pending, day.rejected, day.billable], [0, 5, 12]);
  assert.equal(env.exc().length, 0);
  ok(env.api('decide.approve', W({ staffId: a, date: '2026-11-18', approve: true, reasonCode: 'Emergency', note: 'ICU cover' })));
  day = env.duties('2026-11-18').days[0];
  assert.deepEqual([day.pending, day.billable], [0, 17]);
  ok(env.api('decide.revoke', { decisionKey: 'APPROVE:' + a + ':2026-11-18', reason: 'Approved by mistake' }));
  assert.equal(env.duties('2026-11-18').days[0].pending, 5);
  assert.deepEqual(env.exc().map((x) => x.type), ['LONG_DUTY']);
});

test('late arrival: give grace or keep strict; override hours and shift tag with a reason', () => {
  const env = ready(), [a, b] = env.staff;
  env.punch(a, 'IN', '2026-11-18 09:05'); env.punch(a, 'OUT', '2026-11-18 20:00');
  env.punch(b, 'IN', '2026-11-18 10:05'); env.punch(b, 'OUT', '2026-11-18 20:00');
  env.process();
  const da = env.duties('2026-11-18').duties.find((x) => x.staffId === a), db = env.duties('2026-11-18').duties.find((x) => x.staffId === b);
  ok(env.api('decide.grace', W({ dutyId: da.dutyId, dutyDate: da.dutyDate, choice: 'grace', reasonCode: 'Transport problem', note: 'Bus late' })));
  ok(env.api('decide.grace', W({ dutyId: db.dutyId, dutyDate: db.dutyDate, choice: 'strict', reasonCode: 'Other', note: 'No valid reason' })));
  let l = env.duties('2026-11-18').duties;
  assert.equal(l.find((x) => x.staffId === a).finalHours, 11);
  assert.equal(l.find((x) => x.staffId === b).finalHours, 9);
  assert.ok(!env.exc().some((x) => x.type === 'LATE_GRACE'));
  assert.ok(env.api('decide.override', W({ dutyId: db.dutyId, dutyDate: db.dutyDate, hours: 12.345 })).error.fields.hours);
  ok(env.api('decide.override', W({ dutyId: db.dutyId, dutyDate: db.dutyDate, hours: 12, reasonCode: 'Hospital requirement', note: 'Called in early by matron' })));
  ok(env.api('decide.shift', W({ dutyId: db.dutyId, dutyDate: db.dutyDate, shift: 'Night', reasonCode: 'Other', note: 'Worked night ward' })));
  l = env.duties('2026-11-18').duties;
  const x = l.find((d) => d.staffId === b);
  assert.deepEqual([x.systemHours, x.finalHours, x.finalSource, x.shift], [9, 12, 'override', 'Night']);
  assert.equal(ok(env.api('decide.list', { staffId: b, date: '2026-11-18' })).length, 3);
});

test('short duty can be marked reviewed', () => {
  const env = ready(), a = env.staff[0];
  env.punch(a, 'IN', '2026-11-18 08:00'); env.punch(a, 'OUT', '2026-11-18 15:20');
  env.process();
  assert.deepEqual(env.exc().map((x) => x.type), ['SHORT_DUTY']);
  ok(env.api('decide.reviewShort', W({ staffId: a, date: '2026-11-18', reasonCode: 'Other', note: 'Half day approved' })));
  assert.equal(env.exc().length, 0);
});

test('unrecognised photo assigned to a person becomes a punch', () => {
  const env = ready(), a = env.staff[0];
  env.sheet('UnrecognisedFaces').appendRow(['00000000-0000-4000-8000-000000000001', '2026-11-18T08:01:00+05:30', 'TAB1', '', a, 0.5, 'Open', '', '', '']);
  env.punch(a, 'OUT', '2026-11-18 20:00');
  env.ctx.Db.invalidate('UnrecognisedFaces');
  ok(env.api('fix.assignUnrecognised', W({ unrecId: '00000000-0000-4000-8000-000000000001', staffId: a, type: 'IN', reasonCode: 'Tablet fault', note: 'Face not read, checked photo' })));
  assert.equal(env.duties('2026-11-18').duties[0].systemHours, 12);
  assert.equal(ok(env.api('unrecognised.list', { status: 'All' }))[0].status, 'Assigned');
});

test('penalties and deductions: add, list, cancel; locked months refused', () => {
  const env = ready();
  assert.ok(env.api('penalties.add', { date: '2026-11-18', deptCode: 'HK', amount: 0, reason: '' }).error.fields.amount);
  const p = ok(env.api('penalties.add', { date: '2026-11-18', deptCode: 'HK', amount: 3000, reason: 'Grooming not as per SOP' }));
  assert.equal(p.companyId, 'CO001', 'only one company serves HK');
  ok(env.api('penalties.add', { date: '2026-11-19', staffId: env.staff[0], amount: 500, reason: 'Mobile phone on duty' }));
  assert.equal(ok(env.api('penalties.list', { month: '2026-11' })).length, 2);
  ok(env.api('penalties.void', { penaltyId: p.penaltyId, reason: 'Entered twice' }));
  assert.equal(ok(env.api('penalties.list', { month: '2026-11' })).filter((x) => x.status === 'Active').length, 1);
  const dd = ok(env.api('deductions.add', { date: '2026-11-18', staffId: env.staff[1], hours: 12, reason: 'Left duty without handover' }));
  assert.equal(dd.deptCode, 'HK');
  env.sheet('MonthLocks').appendRow(['ML1', '2026-10', 'HK', 'LOCKED', '', 'admin', '', '', '']);
  env.ctx.Db.invalidate('MonthLocks');
  assert.match(env.api('penalties.add', { date: '2026-10-30', deptCode: 'HK', amount: 100, reason: 'Late' }).error.fields.date, /locked/);
  assert.match(env.api('deductions.add', { date: '2026-10-30', staffId: env.staff[1], hours: 4, reason: 'Late' }).error.fields.date, /locked/);
});

test('dashboard: on duty now, shortage, open timers, attention counts, month so far, 30-day trend', () => {
  const env = ready('2026-11-20T11:00:00+05:30'), [a, b, c] = env.staff;
  env.punch(a, 'IN', '2026-11-20 08:00'); env.punch(b, 'IN', '2026-11-20 07:58');
  env.punch(c, 'IN', '2026-11-18 08:00'); env.punch(c, 'OUT', '2026-11-18 20:45');
  ok(env.api('penalties.add', { date: '2026-11-18', deptCode: 'HK', amount: 1000, reason: 'Cleaning missed' }));
  env.process();
  const d = ok(env.api('dashboard', {}));
  assert.equal(d.shiftNow, 'Day');
  assert.equal(d.onDuty, 2);
  const hk = d.depts.find((x) => x.code === 'HK');
  assert.deepEqual([hk.onDuty, hk.required, hk.shortage, hk.active], [2, 14, 12, 4]);
  assert.equal(d.open[0].hours, 3.03);
  assert.equal(d.attention.LONG_DUTY, 1);
  assert.equal(d.month.duties.HK, 1); // 13 h with 1 h pending -> 12 billable = 1 duty
  assert.equal(d.month.estimate, 800);
  assert.equal(d.month.penalties, 1000);
  assert.equal(d.trend.length, 30);
  assert.equal(d.trend[29].people, 2);
  assert.equal(d.joiners, 4);
  assert.equal(d.feed.length, 2, "today's punches");
});
