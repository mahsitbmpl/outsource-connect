'use strict';
/*
 * Fake people and fake attendance that add up to the same totals as Sample_Sheet.xlsx (HK, Oct-2026):
 * Supervisor 208 + 103 + 0 = 311 h; Staff 5431 + 2701 + 119.6 = 8251.6 h, 24 h deduction, 9 penalties = Rs 29,000.
 * No real names are used.
 */
const OSCBill = require('../../shared/billing.js');
function sampleInput() {
  const ym = '2026-10', dates = OSCBill.monthDates(ym);
  const staff = [{ staffId: 'HK001', title: 'Mr.', fullName: 'Arjun Demo', designation: 'Supervisor', dates: {} }];
  for (let i = 2; i <= 29; i++) staff.push({ staffId: 'HK' + String(i).padStart(3, '0'), title: i % 3 ? 'Mr.' : 'Ms.', fullName: ['Bina', 'Chetan', 'Dhruv', 'Ekta', 'Firoz', 'Gita', 'Hemant'][i % 7] + ' Sample' + i, designation: 'Staff', dates: {} });
  staff.forEach((s) => dates.forEach((d) => { s.dates[d] = true; }));
  const days = [];
  const put = (staffId, date, h8, h4, dd) => days.push({ staffId, date, h8, h4, dd, billable: h8 + h4 + dd, pending: 0, open: false, designation: staffId === 'HK001' ? 'Supervisor' : 'Staff', ratePerDuty: staffId === 'HK001' ? 806.45 : 800, gstPct: 18 });
  // supervisor: 25 full days + 1 day of 11 h
  for (let i = 0; i < 26; i++) put('HK001', dates[i], 8, i === 25 ? 3 : 4, 0);
  // staff: 675 full days (10 of them with double duty), 2 x 8 h, 1 x 9 h, 1 x 7 h
  const kinds = [];
  for (let i = 0; i < 675; i++) kinds.push([8, 4, i < 9 ? 12 : i === 9 ? 11.6 : 0]);
  kinds.push([8, 0, 0], [8, 0, 0], [8, 1, 0], [7, 0, 0]);
  let k = 0;
  for (let si = 1; si < staff.length && k < kinds.length; si++) for (let di = 0; di < 31 && k < kinds.length; di++) { if ((si + di) % 9 === 0) continue; const x = kinds[k++]; put(staff[si].staffId, dates[di], x[0], x[1], x[2]); }
  const reasons = ['Grooming and punctuality', 'Tobacco chewing', 'Phone usage on duty', 'Document submission of new joiners', 'Health check-up documents pending', 'Supervisor not punctual', 'Going out without permission', 'Cleaning feedback decreased', 'Sleeping in night duty'];
  const penalties = reasons.map((r, i) => ({ date: dates[2 + i * 3], reason: r, amount: i === 7 ? 5000 : 3000 }));
  return {
    ym, dept: { code: 'HK', name: 'Housekeeping' }, company: { companyId: 'CO001', code: 'ALPHA', name: 'Alpha Facility Services Pvt Ltd', gstin: '24AAAAA0000A1Z5', pan: 'AAAAA0000A', address: 'Demo Road, Surat' },
    org: { name: 'Marengo Asia Hospital, Surat', gstin: '24BBBBB1111B1Z1', address: 'Demo address line' }, staff, days,
    deductions: [{ date: dates[4], staffId: 'HK002', hours: 24, reason: 'Left duty without relief' }], penalties,
    billNo: 'MAH-OSC/HK/2026-10/ALPHA', status: 'FINAL', generatedAt: '2026-11-02T10:15:00+05:30', generatedBy: 'Ops Manager', version: '5.0.0', footer: 'Designed and developed by IT Department, Marengo Asia Hospital, Surat'
  };
}
module.exports = { sampleInput };
