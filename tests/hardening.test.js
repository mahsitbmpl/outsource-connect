'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ready, ok } = require('./helpers');

test('tamper check: punches and audit log carry check codes; a hand edit, a removed row or a removed newest row is found', () => {
  const env = ready();
  const a = env.staff[0];
  env.punch(a, 'IN', '2026-11-18 08:00'); env.punch(a, 'OUT', '2026-11-18 20:00'); env.punch(a, 'IN', '2026-11-19 08:00');
  let r = ok(env.api('system.integrity'));
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  const pt = r.tables.find((t) => t.table === 'Punches_2026');
  assert.equal(pt.checked, 3);
  assert.ok(r.tables.find((t) => t.table === 'AuditLog').checked > 5);
  const sh = env.sheet('Punches_2026'), h = sh.rows[0], ti = h.indexOf('type');
  // edit by hand: IN -> OUT
  sh.rows[2][ti] = 'IN';
  r = ok(env.api('system.integrity'));
  assert.equal(r.ok, false); assert.match(r.problems[0], /Punches_2026: Row 3 was changed/);
  sh.rows[2][ti] = 'OUT';
  assert.equal(ok(env.api('system.integrity')).ok, true);
  // newest row removed
  const lastRow = sh.rows.pop();
  r = ok(env.api('system.integrity'));
  assert.equal(r.ok, false); assert.match(r.problems[0], /newest rows were removed/);
  sh.rows.push(lastRow);
  // a row in the middle removed
  const mid = sh.rows.splice(2, 1)[0];
  assert.equal(ok(env.api('system.integrity')).ok, false);
  sh.rows.splice(2, 0, mid);
  // health shows the last result
  const hc = ok(env.api('system.health'));
  assert.equal(hc.items.find((i) => i.id === 'integrity').status, 'bad');
  ok(env.api('system.integrity'));
  assert.equal(ok(env.api('system.health')).items.find((i) => i.id === 'integrity').status, 'ok');
  // the protective apostrophe in front of text like "-note" does not break the check
  env.ctx.Audit.log({ username: 'x' }, '-start', '=SUM(A1)', '+1', '@me', null, null);
  assert.equal(ok(env.api('system.integrity')).ok, true);
});

test('health: cell use, unused columns removed, sharing, runtime, speed check; console address must be https', () => {
  const env = ready();
  const hc = ok(env.api('system.health'));
  const staffTab = hc.tabs.find((t) => t.name === 'Staff');
  assert.equal(staffTab.cols, env.sheet('Staff').rows[0].length, 'no empty columns left on a tab');
  assert.equal(hc.items.find((i) => i.id === 'cells').status, 'ok');
  assert.equal(hc.items.find((i) => i.id === 'sheetSharing').status, 'ok');
  env.fileObjs.get('TEST_SHEET_ID').sharing = 'ANYONE_WITH_LINK';
  const bad = ok(env.api('system.health')).items.find((i) => i.id === 'sheetSharing');
  assert.equal(bad.status, 'bad'); assert.match(bad.text, /Restricted/);
  env.newRequest(); env.ctx.processPunchesJob();
  assert.ok(env.props.get('RUNTIME_2026-11-20') !== undefined);
  const sp = ok(env.api('system.speed'));
  assert.equal(sp.results.length, 5);
  assert.ok(sp.results.every((x) => !x.error), JSON.stringify(sp.results));
  assert.ok(env.api('settings.update', { key: 'consoleUrl', value: 'javascript:alert(1)', reason: 'Testing links' }).error.fields.value);
  ok(env.api('settings.update', { key: 'consoleUrl', value: 'https://it-mah.github.io/osc/console/', reason: 'Email links' }));
  // only the Admin may see system health
  ok(env.api('users.create', { username: 'opsmgr', fullName: 'Ops Manager', role: 'OPS', reason: 'New' }));
  env.ctx.Db.update('Users', 'opsmgr', { pwHash: env.ctx.Auth.hashPassword('Opsmanager2026'), mustChange: false }); env.newRequest();
  const t = ok(env.call('auth.login', { username: 'opsmgr', password: 'Opsmanager2026' })).token;
  assert.equal(env.call('system.health', {}, t).error.code, 'FORBIDDEN');
  assert.equal(env.call('system.integrity', {}, t).error.code, 'FORBIDDEN');
});

test('large tabs: a past month is read by date range, including a late-added old row', () => {
  const env = ready('2026-12-28T10:00:00+05:30');
  const D = env.ctx.dutyTable(2026); env.ctx.Db.ensureTable(D);
  const rows = [];
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) for (let s = 0; s < 20; s++) {
    const date = '2026-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    rows.push({ dutyId: 'D' + m + '-' + d + '-' + s, staffId: env.staff[s % 4], dutyDate: date, kind: 'pair', status: 'Closed', finalHours: 12, systemHours: 12, deptCode: 'HK', updatedAt: date });
  }
  rows.push({ dutyId: 'LATE1', staffId: env.staff[0], dutyDate: '2026-03-05', kind: 'pair', status: 'Closed', finalHours: 8, systemHours: 8, deptCode: 'HK', updatedAt: '2026-12-01' });
  env.ctx.Db.insertMany(D, rows);
  env.newRequest(); env.resetStats();
  const L = env.ctx.DutyEngine.list('2026-03-01', '2026-03-31', {});
  assert.equal(L.duties.length, 28 * 20 + 1);
  assert.ok(L.duties.some((d) => d.dutyId === 'LATE1'));
  const total = rows.length * 25;
  assert.ok(env.stats.readCells < total * 0.9, 'reads ' + env.stats.readCells + ' of ' + total + ' cells');
  env.newRequest(); env.resetStats();
  const L2 = env.ctx.DutyEngine.list('2026-12-01', '2026-12-28', {});
  assert.equal(L2.duties.length, 28 * 20);
  assert.ok(env.stats.readCells < 4000 * 25 + rows.length + 100, 'recent month stays a small read: ' + env.stats.readCells);
});

test('year roll-over moves old rows of logs and exceptions to the archive file; tamper check still passes', () => {
  const env = ready('2026-11-20T11:00:00+05:30');
  const old = []; for (let i = 0; i < 5; i++) old.push({ at: '2025-0' + (i + 1) + '-10T10:00:00+05:30', username: 'admin', result: 'OK', detail: '', userAgent: '' });
  const ll = env.sheet('LoginLog'); const h = ll.rows[0];
  const before = ll.rows.slice(1);
  ll.rows = [h].concat(old.map((o) => h.map((k) => o[k] || ''))).concat(before);
  env.newRequest();
  const moved = env.ctx.Archive.oldRows('2026-01-01');
  assert.deepEqual(JSON.parse(JSON.stringify(moved)), ['LoginLog: 5 rows']);
  assert.equal(env.sheet('LoginLog').rows.length, 1 + before.length);
  const arch = [...env.books.values()].find((b) => b.name === 'OutSource Connect archive 2025');
  assert.equal(arch.getSheetByName('LoginLog').rows.length, 6);
  ok(env.api('auth.me'));
  assert.equal(ok(env.api('system.integrity')).ok, true);
});

test('restore from a backup: tabs replaced, safety copy made, audited; punches cursor and check codes follow', () => {
  const env = ready();
  env.punch(env.staff[0], 'IN', '2026-11-18 08:00');
  // the "backup": a copy of today's tabs, then the live Staff tab is damaged
  const backup = env.ctx.SpreadsheetApp.create('OutSource Connect backup 2026-11-20');
  ['Staff', 'Punches_2026', 'AuditLog', 'Sessions'].forEach((n) => { const c = env.sheet(n).copyTo(backup); c.setName(n); });
  env.sheet('Staff').rows.splice(1, 2);
  env.newRequest(); env.ctx.Db.invalidate('Staff');
  assert.equal(env.ctx.Db.all('Staff').length, 2);
  const r = env.ctx.Restore.run(backup.getId(), null, 'tester');
  assert.deepEqual(JSON.parse(JSON.stringify(r.restored.map((x) => x.split(' ')[0]).sort())), ['AuditLog', 'Punches_2026', 'Staff']);
  env.newRequest();
  assert.equal(env.ctx.Db.all('Staff').length, 4);
  assert.ok([...env.fileObjs.values()].some((f) => /^OutSource Connect before restore/.test(f.name)));
  env.login();
  assert.equal(ok(env.api('system.integrity')).ok, true);
  assert.ok(ok(env.api('audit.recent', { limit: 5 })).some((x) => x.action === 'system.restore'));
  // menu version asks twice and needs the word RESTORE
  const env2 = require('./gas-mock').makeEnv({ promptAnswers: ['https://docs.google.com/spreadsheets/d/' + 'X'.repeat(30) + '/edit', 'nope'] });
  env2.ctx.setup(); env2.ctx.restoreFromBackup();
  assert.match(env2.alerts[env2.alerts.length - 1].text, /Cancelled/);
});
