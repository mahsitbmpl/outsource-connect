'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const OSC = require('../shared/osc-core.js');

test('parseDate accepts Indian and ISO formats', () => {
  assert.equal(OSC.parseDate('20-11-2026'), '2026-11-20');
  assert.equal(OSC.parseDate('20/11/2026'), '2026-11-20');
  assert.equal(OSC.parseDate('20-Nov-2026'), '2026-11-20');
  assert.equal(OSC.parseDate('20 November 2026'), '2026-11-20');
  assert.equal(OSC.parseDate('2026-11-20'), '2026-11-20');
  assert.equal(OSC.parseDate(46346), '2026-11-20'); // Excel serial
  assert.equal(OSC.parseDate('31-02-2026'), null);
  assert.equal(OSC.parseDate('hello'), null);
  assert.equal(OSC.parseDate(''), null);
});

test('IST date is used, not UTC', () => {
  // 20-Nov-2026 00:10 IST is still 19-Nov in UTC
  assert.equal(OSC.todayIST(Date.parse('2026-11-19T18:40:00Z')), '2026-11-20');
  assert.equal(OSC.nowISTString(Date.parse('2026-11-19T18:40:00Z')), '2026-11-20T00:10:00+05:30');
});

test('age calculation handles birthdays', () => {
  assert.equal(OSC.ageOn('2008-11-21', '2026-11-20'), 17);
  assert.equal(OSC.ageOn('2008-11-20', '2026-11-20'), 18);
  assert.equal(OSC.ageOn('2000-02-29', '2026-02-28'), 25);
});

test('Indian formats', () => {
  assert.equal(OSC.fmtINR(637680.45175), '₹ 6,37,680.45');
  assert.equal(OSC.fmtINR(123456), '₹ 1,23,456.00');
  assert.equal(OSC.groupIN(12345678.9), '1,23,45,678.90');
  assert.equal(OSC.groupIN(999), '999.00');
  assert.equal(OSC.fmtDate('2026-11-20'), '20-Nov-2026');
  assert.equal(OSC.fmtDateTime('2026-11-20T20:32:00+05:30'), '20-Nov-2026 08:32 PM');
  assert.equal(OSC.fmtDateTime('2026-11-20T00:05:00+05:30'), '20-Nov-2026 12:05 AM');
  assert.equal(OSC.fmtHours(11.8), '11.80');
});

test('formula injection guard', () => {
  assert.equal(OSC.sheetSafe('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.equal(OSC.sheetSafe('+91'), "'+91");
  assert.equal(OSC.sheetSafe('Normal'), 'Normal');
  assert.equal(OSC.unSheetSafe(OSC.sheetSafe('@cmd')), '@cmd');
  assert.equal(OSC.sheetSafe(42), 42);
});

test('mobile normalisation', () => {
  assert.equal(OSC.normMobile('+91 98765 43210'), '9876543210');
  assert.equal(OSC.normMobile('09876543210'), '9876543210');
  assert.equal(OSC.isMobile('5876543210'), false);
  assert.equal(OSC.isMobile('987654321'), false);
});

function staffCtx(extra) {
  return Object.assign({
    today: '2026-11-20', titles: ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.'], designations: ['Staff', 'Supervisor'],
    departments: [{ code: 'HK', name: 'Housekeeping', active: true }, { code: 'SC', name: 'Security', active: true }],
    companies: [{ companyId: 'CO001', code: 'ABC', name: 'ABC Services', status: 'Active', deptCodes: ['HK'], contractStart: '2026-04-01', contractEnd: '' }],
    activeMobiles: { '9876500000': 'HK004' }, isNew: true
  }, extra || {});
}
const good = { title: 'Mr.', fullName: 'Viral Patel', dob: '14-03-1994', mobile: '98765 43210', deptCode: 'hk', designation: 'Staff', companyCode: 'abc', joinDate: '01-11-2026' };

test('validateStaff accepts a good record and normalises it', () => {
  const r = OSC.validateStaff(good, staffCtx());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.dob, '1994-03-14');
  assert.equal(r.value.mobile, '9876543210');
  assert.equal(r.value.deptCode, 'HK');
  assert.equal(r.value.companyId, 'CO001');
});

test('validateStaff rejects under 18, duplicate mobile, wrong company, bad title', () => {
  let r = OSC.validateStaff(Object.assign({}, good, { dob: '2009-01-01' }), staffCtx());
  assert.match(r.errors.dob, /18 or older/);
  r = OSC.validateStaff(Object.assign({}, good, { mobile: '9876500000' }), staffCtx());
  assert.match(r.errors.mobile, /HK004/);
  r = OSC.validateStaff(Object.assign({}, good, { deptCode: 'SC' }), staffCtx());
  assert.match(r.errors.companyId, /does not serve/);
  r = OSC.validateStaff(Object.assign({}, good, { title: 'Sir' }), staffCtx());
  assert.ok(r.errors.title);
  r = OSC.validateStaff(Object.assign({}, good, { fullName: '=cmd|calc' }), staffCtx());
  assert.ok(r.errors.fullName);
  r = OSC.validateStaff(Object.assign({}, good, { joinDate: '01-03-2026' }), staffCtx());
  assert.match(r.errors.joinDate, /before the contract start/);
});

test('validateCompany checks GSTIN and PAN', () => {
  const ctx = { today: '2026-11-20', departments: [{ code: 'HK' }], existingCodes: { OLD: 'CO009' } };
  const base = { name: 'ABC Services', code: 'abc', deptCodes: 'HK', contractStart: '2026-04-01' };
  assert.equal(OSC.validateCompany(base, ctx).ok, true);
  assert.ok(OSC.validateCompany(Object.assign({}, base, { gstin: '24ABCDE1234F1Z' }), ctx).errors.gstin);
  assert.equal(OSC.validateCompany(Object.assign({}, base, { gstin: '24ABCDE1234F1Z5', pan: 'ABCDE1234F' }), ctx).ok, true);
  assert.ok(OSC.validateCompany(Object.assign({}, base, { gstin: '24ABCDE1234F1Z5', pan: 'ZZZZZ1234F' }), ctx).errors.pan);
  assert.ok(OSC.validateCompany(Object.assign({}, base, { code: 'OLD' }), ctx).errors.code);
  assert.ok(OSC.validateCompany(Object.assign({}, base, { contractEnd: '2026-01-01' }), ctx).errors.contractEnd);
});

test('validateRate', () => {
  const ctx = { company: { deptCodes: ['HK'] }, designations: ['Staff', 'Supervisor'] };
  const r = OSC.validateRate({ deptCode: 'HK', designation: 'Supervisor', ratePerDuty: '806.451', gstPct: 18, effectiveFrom: '01-10-2026' }, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.value.ratePerDuty, 806.45);
  assert.ok(OSC.validateRate({ deptCode: 'SC', designation: 'Staff', ratePerDuty: 800, gstPct: 18, effectiveFrom: '2026-10-01' }, ctx).errors.deptCode);
  assert.ok(OSC.validateRate({ deptCode: 'HK', designation: 'Staff', ratePerDuty: 0, gstPct: 18, effectiveFrom: '2026-10-01' }, ctx).errors.ratePerDuty);
});

test('password policy', () => {
  assert.deepEqual(OSC.validatePassword('Hospital2026!', 'rina'), []);
  assert.ok(OSC.validatePassword('short1', 'rina').length);
  assert.ok(OSC.validatePassword('onlyletterspassword', 'rina').length);
  assert.ok(OSC.validatePassword('rina12345678', 'rina').length);
});
