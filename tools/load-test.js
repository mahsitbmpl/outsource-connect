#!/usr/bin/env node
/*
 * Load test: 100 staff, 3 years of fake punches (Jan 2026 to Dec 2028), run through the real Code.gs on the in-memory
 * Google imitation. Measures, for each main screen and job, how many spreadsheet calls and cells it reads and writes
 * (the real cost on Google), and the sheet size against Google's 10 million cell limit.
 * Usage: node tools/load-test.js [report.md]
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { makeEnv } = require('../tests/gas-mock');

const T0 = Date.now();
const env = makeEnv({ now: Date.parse('2025-12-20T10:00:00+05:30') });
const C = env.ctx;
C.setup();
const temp = /Temporary password: (\S+)/.exec(env.alerts[env.alerts.length - 1].text)[1];
let tok = JSON.parse(JSON.stringify(env.call('auth.login', { username: 'admin', password: temp }))).data.token;
env.call('auth.changePassword', { oldPassword: temp, newPassword: 'Hospital2026x' }, tok);
const login = () => { tok = env.call('auth.login', { username: 'admin', password: 'Hospital2026x' }).data.token; };
const api = (a, d) => { const r = env.call(a, d || {}, tok); if (!r.ok) throw new Error(a + ': ' + JSON.stringify(r.error)); return r.data; };
login();
const sys = { username: 'load-test', fullName: 'Load test', role: 'ADMIN' };

// ---------- masters: 2 companies, rates, 100 staff ----------
const coA = C.Companies.save(sys, { name: 'Load Facility Services', code: 'LOADFS', deptCodes: 'HK,SS', contractStart: '2025-12-01', status: 'Active' });
const coB = C.Companies.save(sys, { name: 'Load Guarding', code: 'LOADGD', deptCodes: 'SC', contractStart: '2025-12-01', status: 'Active' });
[['HK', 'Staff', 800], ['HK', 'Supervisor', 806.45], ['SS', 'Staff', 820], ['SS', 'Supervisor', 900]].forEach((r) => C.Rates.add(sys, { companyId: coA.companyId, deptCode: r[0], designation: r[1], ratePerDuty: r[2], gstPct: 18, effectiveFrom: '2025-12-01' }));
[['SC', 'Staff', 850], ['SC', 'Supervisor', 950]].forEach((r) => C.Rates.add(sys, { companyId: coB.companyId, deptCode: r[0], designation: r[1], ratePerDuty: r[2], gstPct: 18, effectiveFrom: '2025-12-01' }));
const rows = [];
for (let i = 0; i < 100; i++) {
  const dept = i < 50 ? 'HK' : i < 75 ? 'SS' : 'SC';
  rows.push({ title: 'Mr.', fullName: 'Load Person ' + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26)), dob: '1990-01-01', mobile: '9' + String(100000000 + i * 7919).slice(-9), deptCode: dept, designation: [0, 1, 50, 75].includes(i) ? 'Supervisor' : 'Staff', companyCode: dept === 'SC' ? 'LOADGD' : 'LOADFS', joinDate: '2026-01-01', vendorCode: 'LOAD' });
}
C.Db.reset();
const imp = C.Staff.importRows(sys, rows, true);
if (!imp.committed) throw new Error('import failed ' + JSON.stringify(imp.report.filter((r) => !r.ok).slice(0, 2)));
C.Db.reset();
const staff = C.Db.all('Staff').map((s) => s.staffId);
// faces for the tablet start-up size (5 samples of 128 numbers + a small photo per person)
C.Db.insertMany('FaceData', staff.map((id) => ({ faceId: 'FD' + id, staffId: id, descriptors: Array.from({ length: 5 }, () => Array.from({ length: 128 }, () => Math.round((Math.random() - 0.5) * 1e4) / 1e4)), samples: 5, status: 'Active', createdAt: '2025-12-20T10:00:00+05:30' })));
C.Db.insertMany('FaceThumbs', staff.map((id) => ({ staffId: id, thumb: 'data:image/jpeg;base64,' + crypto.randomBytes(3600).toString('base64'), updatedAt: '2025-12-20T10:00:00+05:30' })));

// ---------- 3 years of punches, month by month, each month processed like the 5-minute job would ----------
const pad = (n) => String(n).padStart(2, '0');
const at = (iso, hm, plus) => Date.parse(iso + 'T' + hm + ':00+05:30') + (plus || 0) * 86400000;
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
let punchCount = 0;
const months = [];
for (let y = 2026; y <= 2028; y++) for (let m = 1; m <= 12; m++) months.push(y + '-' + pad(m));
const endDay = '2028-12-19';
months.forEach((ym, mi) => {
  const days = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(), P = [];
  for (let d = 1; d <= days; d++) {
    const iso = ym + '-' + pad(d);
    if (iso > endDay) break;
    staff.forEach((sid, i) => {
      if ((d + i) % 7 === 0) return;                       // weekly off
      const night = i % 5 === 4, r = rnd();
      const inT = night ? '20:00' : r < 0.05 ? '08:12' : r < 0.08 ? '09:05' : '08:00';
      const outT = night ? '08:05' : r > 0.97 ? '23:00' : r > 0.88 ? '20:40' : '20:02';
      P.push([sid, 'IN', at(iso, inT)]);
      if (r > 0.002) P.push([sid, 'OUT', at(iso, outT, night ? 1 : 0)]);
    });
  }
  P.sort((a, b) => a[2] - b[2]);
  const t = C.punchTable(ym.slice(0, 4)); if (!env.sheet(t)) C.Db.ensureTable(t);
  const iso = (ms) => C.OSC.nowISTString(ms);
  C.Db.insertMany(t, P.map(([sid, ty, ms]) => ({ punchId: crypto.randomUUID(), staffId: sid, type: ty, at: iso(ms), deviceTime: iso(ms), receivedAt: iso(ms + 4000), deviceId: 'TAB1', distance: 0.31, liveness: 'blink', offline: false, status: 'Accepted', photoFileId: 'PHOTO' + (punchCount % 999), note: '' })));
  punchCount += P.length;
  // heartbeats every 30 minutes, login log and audit entries like a normal month
  const hb = [];
  for (let d = 1; d <= days; d++) for (let h = 0; h < 48; h++) hb.push({ at: ym + '-' + pad(d) + 'T' + pad(Math.floor(h / 2)) + ':' + (h % 2 ? '30' : '00') + ':00+05:30', deviceId: 'TAB1', battery: 80, charging: true, queueSize: 0, cameraOk: true, appVersion: '3.0.0' });
  C.Db.insertMany('Heartbeats', hb);
  for (let k = 0; k < 120; k++) C.Audit.log(sys, 'load.action', 'Duties', 'X' + k, 'Load test entry', null, { n: k });
  env.setNow(new Date(at(ym + '-' + pad(Math.min(days, ym === '2028-12' ? 19 : days)), '23:00', 1)).toISOString());
  C.Db.reset();
  C.DutyEngine.recompute(staff, ym + '-01');
  env.props.set('PUNCH_DONE_' + ym.slice(0, 4), String(env.sheet(t).getLastRow() - 1)); // as the 5-minute job would have
  if (mi % 6 === 5) process.stdout.write('  ' + ym + ' done, ' + punchCount + ' punches, ' + Math.round((Date.now() - T0) / 1000) + ' s\n');
});

// ---------- measurements at 20-Dec-2028 10:00 ----------
env.setNow('2028-12-20T10:00:00+05:30');
C.Db.reset(); login();
const COST = { call: 0.05, read: 8e-6, write: 20e-6, cpu: 5 };   // rough Apps Script estimate: s per call, s per cell read/written, CPU slower than Node
const results = [];
function measure(label, fn) {
  env.newRequest(); env.resetStats();
  const t = process.hrtime.bigint(); let note = '';
  try { const r = fn(); note = typeof r === 'string' ? r : ''; } catch (e) { note = 'ERROR ' + e.message; }
  const ms = Number(process.hrtime.bigint() - t) / 1e6, s = env.stats;
  const est = (s.reads + s.writes) * COST.call + s.readCells * COST.read + s.writeCells * COST.write + ms / 1000 * COST.cpu;
  results.push({ label, ms: Math.round(ms), calls: s.reads + s.writes, readCells: s.readCells, writeCells: s.writeCells, est: Math.round(est * 10) / 10, note });
}
// 10 new punches arrive, then the 5-minute job runs
const today = '2028-12-20';
C.Db.insertMany(C.punchTable(2028), staff.slice(0, 10).map((sid) => ({ punchId: crypto.randomUUID(), staffId: sid, type: 'IN', at: today + 'T08:0' + (staff.indexOf(sid) % 10) + ':00+05:30', receivedAt: today + 'T08:10:00+05:30', deviceId: 'TAB1', status: 'Accepted' })));
measure('5-minute job (10 new punches + jobs check)', () => { C.processPunchesJob(); });
measure('5-minute job (nothing new)', () => { C.processPunchesJob(); });
measure('Sign-in', () => { login(); });
measure('Dashboard', () => { api('dashboard'); });
measure('Duties: this month', () => { const r = api('duties.list', { from: '2028-12-01', to: today }); return r.duties.length + ' duties'; });
measure('Duties: a month 2 years back (Jan-2027)', () => { const r = api('duties.list', { from: '2027-01-01', to: '2027-01-31' }); return r.duties.length + ' duties'; });
measure('Exceptions list', () => { const r = api('exceptions.list', { status: 'Open' }); return r.length + ' open shown'; });
measure('Month-end pack overview (Nov-2028)', () => { api('month.status', { month: '2028-11' }); });
measure('Month-end pack overview (Feb-2026, oldest)', () => { api('month.status', { month: '2026-02' }); });
measure('Bill preview HK Nov-2028', () => { const r = api('month.preview', { month: '2028-11', deptCode: 'HK', companyId: coA.companyId }); return 'payable ' + r.payable; });
measure('Excel pack HK Nov-2028', () => { const r = api('month.file', { month: '2028-11', deptCode: 'HK', companyId: coA.companyId, kind: 'xlsx' }); return Math.round(r.base64.length * 0.75 / 1024) + ' KB'; });
measure('Bill PDF HK Nov-2028', () => { const r = api('month.file', { month: '2028-11', deptCode: 'HK', companyId: coA.companyId, kind: 'pdf' }); return Math.round(r.base64.length * 0.75 / 1024) + ' KB'; });
measure('Lock Nov-2028 HK (forced, 2 files to Drive)', () => { api('month.lock', { month: '2028-11', deptCode: 'HK', force: true, reason: 'Load test lock' }); });
measure('Company comparison HK Nov-2028', () => { api('month.compare', { month: '2028-11', deptCode: 'HK' }); });
measure('Tablet start-up data (100 faces)', () => { const r = C.Kiosk.sync({ deviceId: 'TAB1' }, {}); return Math.round(JSON.stringify(r).length / 1024) + ' KB'; });
measure('Morning email', () => { C.Mailer.morning(); });
measure('Nightly close (re-check 3 days)', () => { C.Jobs.runNow(sys, 'nightlyClose'); });
measure('Tamper check (all punch tabs + audit)', () => { const r = C.Health.integrity(); return (r.ok ? 'OK' : 'PROBLEM') + ', ' + r.tables.reduce((a, x) => a + x.checked, 0) + ' rows'; });
measure('System health', () => { api('system.health'); });

// ---------- size, then the January roll-over (archives 2026 with dataKeepYears = 2) ----------
const snap = () => env.book.getSheets().map((s) => s.getMaxRows() * s.getMaxColumns()).reduce((a, b) => a + b, 0);
const beforeRoll = snap();
const tabs = env.book.getSheets().map((s) => ({ name: s.getName(), rows: s.getMaxRows(), cols: s.getMaxColumns(), cells: s.getMaxRows() * s.getMaxColumns(), data: Math.max(0, s.getLastRow() - 1) })).sort((a, b) => b.cells - a.cells);
const total = tabs.reduce((a, t) => a + t.cells, 0);
env.setNow('2029-01-02T01:05:00+05:30'); C.Db.reset();
measure('Year roll-over Jan-2029 (moves 2026 to archive)', () => { const r = C.Jobs.runNow(sys, 'yearRollover'); return JSON.stringify(r.result.archived || []).replace(/[\[\]"]/g, '').replace(/,/g, '; '); });
const afterRoll = snap();
const perYear = ['2027'].reduce((a, y) => a + tabs.filter((t) => t.name.endsWith('_' + y)).reduce((b, t) => b + t.cells, 0), 0);
const inr = (n) => C.OSC.groupIN(n, 0);
const out = [];
out.push('# Load test report: 100 staff, 3 years', '');
out.push('Generated by `node tools/load-test.js` on ' + new Date().toISOString().slice(0, 10) + ' with OutSource Connect ' + C.APP.version + '. All data is fake.', '');
out.push('## Data', '');
out.push('- 100 staff (HK 50, SS 25, SC 25; 4 supervisors), 2 companies, rate cards; 20 % on night duty; one day off a week.');
out.push('- ' + inr(punchCount) + ' punches from 01-Jan-2026 to 20-Dec-2028, processed month by month by the real duty engine; late arrivals, extra time and long duties included, exceptions left open.');
out.push('- 100 enrolled faces; heartbeats every 30 minutes; 120 audit entries a month.', '');
out.push('## Sheet size (Google limit: 1,00,00,000 cells per spreadsheet)', '');
out.push('| Tab | Rows | Columns | Cells |', '|---|---:|---:|---:|');
tabs.slice(0, 14).forEach((t) => out.push('| ' + t.name + ' | ' + inr(t.rows) + ' | ' + t.cols + ' | ' + inr(t.cells) + ' |'));
out.push('| **All ' + tabs.length + ' tabs** | | | **' + inr(total) + ' (' + (total / 1e5).toFixed(1) + ' %)** |', '');
out.push('- After the January 2029 roll-over (2026 moved to the archive file): **' + inr(afterRoll) + ' cells (' + (afterRoll / 1e5).toFixed(1) + ' %)**, down from ' + inr(beforeRoll) + '.');
out.push('- One full year of punches + duties ≈ **' + inr(perYear) + ' cells**. With *dataKeepYears* = 2 (default) the main sheet holds the current year + 2 past years of punches and duties (≈ ' + inr(perYear * 3) + ' cells) plus the other tabs; older years and old log rows move to archive files each January.');
out.push('- Removing the 26 default columns of new tabs (Phase 6) keeps every tab at its real width; without it the punch tabs alone would use about twice as many cells.', '');
out.push('## Cost of each screen and job', '');
out.push('Spreadsheet calls and cells are what Google charges time for. "Estimated on Google" is a rough guide (0.05 s per call, 8 µs per cell read, 20 µs per cell written, script 5× slower than this PC). Real timings on your installation: Admin → System health → **Speed check**.', '');
out.push('| Screen / job | Sheet calls | Cells read | Cells written | Here (ms) | Estimated on Google (s) | Note |', '|---|---:|---:|---:|---:|---:|---|');
results.forEach((r) => out.push('| ' + r.label + ' | ' + r.calls + ' | ' + inr(r.readCells) + ' | ' + inr(r.writeCells) + ' | ' + r.ms + ' | ' + r.est + ' | ' + r.note + ' |'));
const tick = results[1];
out.push('', '## Daily automatic run time (Google allows 90 minutes a day on a free account)', '');
out.push('- 288 runs of the 5-minute job. A quiet run costs about ' + tick.est + ' s → about **' + Math.round(288 * tick.est / 60) + ' minutes a day**, plus the daily jobs (emails, nightly close) of a few seconds each.');
out.push('- Admin → System health shows the real minutes used each day.', '');
out.push('## Findings and changes made in Phase 6', '');
out.push('1. Unchanged rows are no longer written back: a blank cell read back as "" or empty was taken as a change, so every 5-minute run rewrote all open-duty rows. Now only changed rows are written, and only the block between the first and last changed row.');
out.push('2. Large tabs are read by date range: a job reads the date column first and then only the rows it needs (a month 2 years back no longer reads the whole year).');
out.push('3. New tabs lose their empty columns, so the cell limit is spent on data only.');
out.push('4. Each January, log rows and exceptions older than *dataKeepYears* move to "OutSource Connect archive YYYY" (checked before removal); punch and duty tabs of old years move the same way.');
out.push('5. The month-end screens read only the month\'s exceptions, and the dashboard only today\'s punches.');
out.push('6. *dataKeepYears* default lowered from 3 to 2: 3 past years + the current year would use about 75 % of the cell limit.');
out.push('7. Exceptions are looked up by date when marked resolved (before, an exception older than about 5,000 rows could be missed).', '');
out.push('Total test time on this PC: ' + Math.round((Date.now() - T0) / 1000) + ' s.');
const file = process.argv[2] || 'docs/LOAD_TEST_REPORT.md';
fs.writeFileSync(file, out.join('\n') + '\n');
console.log(out.join('\n'));
