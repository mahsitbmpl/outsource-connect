/* ===== 08 Setup, menu, maintenance and demo data (run from the script editor or the sheet menu) ===== */

/** Adds the "OutSource Connect" menu to the Google Sheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('OutSource Connect')
    .addItem('1. Run setup (safe to repeat)', 'setup')
    .addItem('2. Add demo data (fake)', 'seedDemoData')
    .addItem('3. Remove demo data', 'removeDemoData')
    .addItem('4. Start automatic processing (every 5 min)', 'installTriggers')
    .addItem('5. Recalculate this month\'s duties', 'recalcThisMonth')
    .addItem('6. Send a test email', 'sendTestEmail')
    .addItem('7. Restore from a backup…', 'restoreFromBackup')
    .addSeparator()
    .addItem('Reset Admin password', 'resetAdminPassword')
    .addItem('Check password speed', 'benchmarkHash')
    .addToUi();
}

function showResult_(title, text) {
  console.log(title + '\n' + text);
  try { SpreadsheetApp.getUi().alert(title, text, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* running without the sheet open */ }
}

/**
 * Creates or upgrades every tab, adds default settings and departments, and creates the first Admin.
 * Safe to run again: nothing existing is deleted or overwritten.
 */
function setup() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Open the Google Sheet and run setup from Extensions > Apps Script inside it.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', book.getId());
  book.setSpreadsheetTimeZone(APP.tz);
  Db.reset();

  var report = [];
  Object.keys(SCHEMA).forEach(function (t) {
    var added = Db.ensureTable(t);
    if (added.length) report.push(t + ': ' + added.length + ' column(s) added');
  });
  var blank = book.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(blank);

  var now = Clock.now();
  var have = {}; Db.all('Settings').forEach(function (s) { have[s.key] = 1; });
  var newSettings = Object.keys(DEFAULT_SETTINGS).filter(function (k) { return !have[k]; }).map(function (k) {
    return { key: k, value: DEFAULT_SETTINGS[k][0], type: DEFAULT_SETTINGS[k][1], description: DEFAULT_SETTINGS[k][2], updatedAt: now, updatedBy: 'setup' };
  });
  Db.insertMany('Settings', newSettings);
  if (newSettings.length) report.push(newSettings.length + ' setting(s) added');

  if (!Db.all('Departments').length) {
    Db.insertMany('Departments', DEFAULT_DEPARTMENTS.map(function (d) {
      return { code: d.code, name: d.name, active: true, nextSeq: 1, reqDay: d.reqDay, reqNight: d.reqNight, sortOrder: d.sortOrder, updatedAt: now, updatedBy: 'setup' };
    }));
    report.push('Departments HK, SS, SC added');
  }

  // Drive folders for later phases (photos, backups, month packs)
  var rootId = props.getProperty('DRIVE_ROOT_ID'), root = null;
  if (rootId) { try { root = DriveApp.getFolderById(rootId); } catch (e) { root = null; } }
  if (!root) {
    root = DriveApp.createFolder('OutSource Connect Data');
    props.setProperty('DRIVE_ROOT_ID', root.getId());
    ['Photos', 'Unrecognised', 'Backups', 'Month packs'].forEach(function (n) { props.setProperty('DRIVE_' + n.toUpperCase().replace(' ', '_') + '_ID', root.createFolder(n).getId()); });
    report.push('Drive folder "OutSource Connect Data" created');
  }

  var tempPw = null;
  if (!Db.all('Users').length) {
    tempPw = Auth.tempPassword();
    Db.insert('Users', { username: 'admin', fullName: 'System Admin', role: APP.roles.ADMIN, active: true, pwHash: Auth.hashPassword(tempPw), mustChange: true, failedCount: 0, createdAt: now, createdBy: 'setup', updatedAt: now, updatedBy: 'setup' });
    Audit.log(null, 'setup.createAdmin', 'Users', 'admin', 'First setup', null, null);
    report.push('Admin user created');
  }
  if (typeof RuleVersions !== 'undefined' && !Db.all('Rules').length) { RuleVersions.ensureDefault(); report.push('Default attendance rules (RV1) added'); }
  Audit.log(null, 'setup.run', 'System', APP.version, report.join('; '), null, null);
  CACHED_TABLES.forEach(function (t) { Db.invalidate(t); });

  var msg = (report.length ? report.join('\n') : 'Everything was already set up.') +
    (tempPw ? '\n\nAdmin username: admin\nTemporary password: ' + tempPw + '\n\nWrite this down now. You must change it at first sign-in.' : '');
  showResult_('OutSource Connect setup ' + APP.version, msg);
  return msg;
}

/** Emergency: new temporary password for the user "admin" (or the first Admin). Shown once. */
function resetAdminPassword() {
  var u = Db.find('Users', 'admin') || Db.where('Users', function (x) { return x.role === APP.roles.ADMIN; })[0];
  if (!u) throw new Error('No Admin user. Run setup first.');
  var pw = Auth.tempPassword();
  Db.update('Users', u.username, { pwHash: Auth.hashPassword(pw), mustChange: true, failedCount: 0, lockedUntil: '', active: true, updatedAt: Clock.now(), updatedBy: 'script-editor' });
  Auth.revokeAll(u.username);
  Audit.log(null, 'users.resetPassword', 'Users', u.username, 'Reset from script editor', null, null);
  showResult_('Admin password reset', 'Username: ' + u.username + '\nTemporary password: ' + pw + '\n\nChange it at first sign-in.');
}

/** Measures the password check on Google's servers. Sign-in uses one check; the target is well under 1 second. */
function benchmarkHash() {
  var t0 = Date.now(); var h = Auth.hashPassword('benchmark-1234'); var tHash = Date.now() - t0;
  var t1 = Date.now(); Auth.verifyPassword('benchmark-1234', h); var tCheck = Date.now() - t1;
  showResult_('Password speed', 'Sign-in password check: ' + tCheck + ' ms\nCreating a new password: ' + tHash + ' ms\n(' + PBKDF2_ITERATIONS + ' rounds, version ' + APP.version + ')');
  return tCheck;
}

/* ---------- Demo data (all fake; marked with vendorCode DEMO and company codes starting with DEMO) ---------- */
function seedDemoData() {
  if (Db.where('Staff', function (s) { return s.vendorCode === 'DEMO'; }).length) { showResult_('Demo data', 'Demo data already exists.'); return; }
  var sys = { username: 'demo-seeder' };
  var co1 = Companies.save(sys, { name: 'Demo Facility Services Pvt Ltd', code: 'DEMOFS', deptCodes: 'HK,SS', contractStart: '2026-04-01', status: 'Active', contactName: 'Demo Contact', contactMobile: '9000000001', contactEmail: 'demo.fs@example.com' });
  var co2 = Companies.save(sys, { name: 'Demo Guarding Co', code: 'DEMOGD', deptCodes: 'SC', contractStart: '2026-04-01', status: 'Active', contactName: 'Demo Guard Contact', contactMobile: '9000000002' });
  [['HK', 'Staff', 800], ['HK', 'Supervisor', 806.45], ['SS', 'Staff', 820], ['SS', 'Supervisor', 900]].forEach(function (r) {
    Rates.add(sys, { companyId: co1.companyId, deptCode: r[0], designation: r[1], ratePerDuty: r[2], gstPct: 18, effectiveFrom: '2026-04-01', note: 'Demo rate' });
  });
  [['SC', 'Staff', 850], ['SC', 'Supervisor', 950]].forEach(function (r) {
    Rates.add(sys, { companyId: co2.companyId, deptCode: r[0], designation: r[1], ratePerDuty: r[2], gstPct: 18, effectiveFrom: '2026-04-01', note: 'Demo rate' });
  });
  var first = ['Aarav', 'Bhavna', 'Chirag', 'Divya', 'Esha', 'Farhan', 'Gauri', 'Harsh', 'Isha', 'Jatin', 'Kavya', 'Lalit', 'Meera', 'Nikhil', 'Ojas', 'Pooja', 'Rahul', 'Sneha', 'Tarun', 'Usha', 'Varun', 'Yash', 'Zoya', 'Kunal', 'Neha', 'Rakesh', 'Sonal', 'Vikram', 'Anjali', 'Deepak'];
  var last = ['Demo', 'Sample', 'Testkar', 'Example'];
  var rows = first.map(function (f, i) {
    var dept = i < 14 ? 'HK' : (i < 22 ? 'SS' : 'SC');
    var female = /a$|i$|e$/.test(f) && ['Harsh', 'Rahul', 'Yash'].indexOf(f) < 0;
    return {
      title: female ? 'Ms.' : 'Mr.', fullName: f + ' ' + last[i % last.length], dob: (1980 + (i % 20)) + '-0' + (1 + i % 9) + '-1' + (i % 9),
      mobile: '90000' + OSC.pad(10000 + i * 7, 5), deptCode: dept, designation: (i === 0 || i === 14 || i === 22) ? 'Supervisor' : 'Staff',
      companyCode: dept === 'SC' ? 'DEMOGD' : 'DEMOFS', joinDate: '2026-0' + (4 + i % 5) + '-01', vendorCode: 'DEMO'
    };
  });
  var res = Staff.importRows(sys, rows, true);
  if (!res.committed) throw new Error('Demo import failed: ' + JSON.stringify(res.report.filter(function (r) { return !r.ok; }).slice(0, 3)));
  showResult_('Demo data added', '2 demo companies, 6 rate cards and ' + res.created.length + ' demo staff added.\nRemove them with "Remove demo data" before going live.');
}

function removeDemoData() {
  var demoStaff = Db.where('Staff', function (s) { return s.vendorCode === 'DEMO'; }).map(function (s) { return s.staffId; });
  var demoCos = Db.where('Companies', function (c) { return /^DEMO/.test(c.code); }).map(function (c) { return c.companyId; });
  var n1 = Db.deleteWhere('StaffHistory', function (h) { return demoStaff.indexOf(h.staffId) >= 0; });
  var n2 = Db.deleteWhere('Staff', function (s) { return s.vendorCode === 'DEMO'; });
  var n3 = Db.deleteWhere('Rates', function (r) { return demoCos.indexOf(r.companyId) >= 0; });
  var n4 = Db.deleteWhere('Companies', function (c) { return /^DEMO/.test(c.code); });
  // Demo IDs were never real, so each department counter goes back to (highest real number + 1).
  // Real staff IDs are still never reused.
  Db.all('Departments').forEach(function (d) {
    var max = 0;
    Db.all('Staff').forEach(function (s) {
      if (s.staffId.indexOf(d.code) === 0) { var n = parseInt(s.staffId.slice(d.code.length), 10); if (n > max) max = n; }
    });
    if (d.nextSeq !== max + 1) Db.update('Departments', d.code, { nextSeq: max + 1 });
  });
  Audit.log(null, 'demo.remove', 'System', '', 'Removed ' + n2 + ' staff, ' + n4 + ' companies', null, null);
  showResult_('Demo data removed', n2 + ' staff, ' + n1 + ' history rows, ' + n3 + ' rates and ' + n4 + ' companies removed.\nEmployee ID counters restart after the highest real ID.');
}

/** Menu: sends a test email to the Email TO list in Settings (also grants the email permission the first time). */
function sendTestEmail() {
  var r = Mailer.test({ username: 'script-editor', fullName: 'Script editor' });
  showResult_('Test email', r.status === 'SENT' ? 'Sent to ' + r.to + '. Check the inbox (and spam folder).' : 'Not sent: ' + r.status + ' ' + r.detail);
}
