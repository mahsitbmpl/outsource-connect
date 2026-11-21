/* ===== 15 Go-live hardening: system health, tamper check, speed check, archive of old rows, restore from a backup ===== */
var CELL_LIMIT = 10000000;      // Google Sheets limit per spreadsheet (all tabs, all cells including empty ones)
var RUNTIME_LIMIT_MIN = 90;     // Apps Script: total time-driven trigger run time per day (free Google account)

var Health = (function () {
  var P = function () { return PropertiesService.getScriptProperties(); };

  /** Adds this run's time to today's total (called by the 5-minute trigger). */
  function addRuntime(ms) {
    var p = P(), k = 'RUNTIME_' + Clock.today();
    p.setProperty(k, String((parseInt(p.getProperty(k) || '0', 10) || 0) + ms));
    var keys = p.getKeys ? p.getKeys() : [];
    keys.filter(function (x) { return /^RUNTIME_\d{4}-\d{2}-\d{2}$/.test(x) && x.slice(8) < OSC.addDays(Clock.today(), -14); }).forEach(function (x) { p.deleteProperty(x); });
  }
  function sharing(fileOrFolder) {
    try {
      var a = String(fileOrFolder.getSharingAccess()), perm = String(fileOrFolder.getSharingPermission());
      var editors = (fileOrFolder.getEditors() || []).map(function (u) { return u.getEmail(); });
      var open = /^ANYONE/.test(a);
      return { access: a, permission: perm, editors: editors, status: open ? 'bad' : editors.length > 3 ? 'warn' : 'ok',
        text: open ? 'Anyone with the link can ' + (perm === 'EDIT' ? 'edit' : 'open') + ' this. Change sharing to "Restricted".' : editors.length > 3 ? editors.length + ' people can edit. Keep editors to the IT owner and one backup person.' : 'Restricted (' + (editors.length ? editors.join(', ') : 'owner only') + ')' };
    } catch (e) { return { status: 'warn', text: 'Could not read sharing: ' + e.message }; }
  }

  function check() {
    var book = Db.ss(), p = P(), tabs = [], total = 0;
    book.getSheets().forEach(function (sh) {
      var rows = sh.getMaxRows(), cols = sh.getMaxColumns(), cells = rows * cols;
      total += cells;
      tabs.push({ name: sh.getName(), rows: rows, cols: cols, cells: cells, dataRows: Math.max(0, sh.getLastRow() - 1) });
    });
    tabs.sort(function (a, b) { return b.cells - a.cells; });
    var pct = total / CELL_LIMIT * 100;
    // growth: punches + duties rows added per day over the last 30 days -> cells per year
    var today = Clock.today(), y = today.slice(0, 4), pt = Db.ss().getSheetByName(punchTable(y)), growth = null;
    if (pt && pt.getLastRow() > 1) {
      var recent = Db.tail(punchTable(y), 4000).filter(function (r) { return r.at >= OSC.addDays(today, -30); }).length;
      var punchesYear = recent / 30 * 365, dutiesYear = punchesYear / 2;
      growth = { punchesPerDay: Math.round(recent / 30), cellsPerYear: Math.round(punchesYear * PUNCH_COLS.length + dutiesYear * DUTY_COLS.length + dutiesYear * 0.2 * 14) };
      growth.yearsLeft = growth.cellsPerYear ? Math.max(0, (CELL_LIMIT * 0.8 - total) / growth.cellsPerYear) : null;
    }
    var runtime = [];
    for (var i = 6; i >= 0; i--) { var d = OSC.addDays(today, -i); runtime.push({ date: d, minutes: Math.round((parseInt(p.getProperty('RUNTIME_' + d) || '0', 10) || 0) / 600) / 100 }); }
    var propSize = 0; try { var all = p.getProperties(); Object.keys(all).forEach(function (k) { propSize += k.length + String(all[k]).length; }); } catch (e) { propSize = null; }
    var trig = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'processPunchesJob'; });
    var lastRun = p.getProperty('DUTIES_LAST_RUN') || '', staleMin = lastRun ? (Clock.nowMs() - Date.parse(lastRun)) / 60000 : null;
    var quota = null; try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { quota = null; }
    var root = null; try { root = DriveApp.getFolderById(p.getProperty('DRIVE_ROOT_ID')); } catch (e) { root = null; }
    var integrity = null; try { integrity = JSON.parse(p.getProperty('INTEGRITY_LAST') || 'null'); } catch (e) { integrity = null; }
    var items = [
      { id: 'cells', label: 'Sheet size', status: pct < 60 ? 'ok' : pct < 80 ? 'warn' : 'bad', text: OSC.groupIN(total, 0) + ' of 1,00,00,000 cells used (' + pct.toFixed(1) + '%)' + (growth ? ' · about ' + OSC.groupIN(growth.cellsPerYear, 0) + ' new cells a year' : '') },
      { id: 'trigger', label: 'Automatic processing', status: !trig ? 'bad' : staleMin == null || staleMin > 20 ? 'warn' : 'ok', text: !trig ? 'Off. Sheet menu → 4. Start automatic processing.' : 'On · last run ' + (lastRun ? OSC.fmtDateTime(lastRun) : 'not yet') },
      { id: 'runtime', label: 'Automatic run time today', status: runtime[6].minutes < RUNTIME_LIMIT_MIN * 0.5 ? 'ok' : runtime[6].minutes < RUNTIME_LIMIT_MIN * 0.8 ? 'warn' : 'bad', text: runtime[6].minutes + ' of ' + RUNTIME_LIMIT_MIN + ' minutes allowed per day' },
      { id: 'email', label: 'Emails left today', status: quota == null ? 'warn' : quota > 20 ? 'ok' : 'warn', text: quota == null ? 'Unknown (email permission not given yet?)' : String(quota) },
      { id: 'props', label: 'Script settings store', status: propSize == null ? 'warn' : propSize < 300000 ? 'ok' : 'warn', text: propSize == null ? 'Unknown' : OSC.groupIN(propSize, 0) + ' of 5,00,000 characters' },
      (function () { var x = sharing(DriveApp.getFileById(book.getId())); x.id = 'sheetSharing'; x.label = 'Google Sheet sharing'; return x; })(),
      root ? (function () { var x = sharing(root); x.id = 'driveSharing'; x.label = 'Drive folder (photos, bills, backups) sharing'; return x; })() : { id: 'driveSharing', label: 'Drive folder', status: 'warn', text: 'Not found. Run setup.' },
      { id: 'backup', label: 'Last weekly backup', status: p.getProperty('JOB_STATUS_weeklyBackup') === 'OK' && Date.parse(p.getProperty('JOB_AT_weeklyBackup') || 0) > Clock.nowMs() - 8 * 86400000 ? 'ok' : 'warn', text: p.getProperty('JOB_AT_weeklyBackup') ? OSC.fmtDateTime(p.getProperty('JOB_AT_weeklyBackup')) + ' · ' + (p.getProperty('JOB_STATUS_weeklyBackup') || '') : 'No backup yet' },
      { id: 'integrity', label: 'Tamper check (audit log and punches)', status: !integrity ? 'warn' : integrity.ok ? 'ok' : 'bad', text: !integrity ? 'Not run yet' : (integrity.ok ? 'No changes found' : 'PROBLEM: ' + integrity.problems.join('; ')) + ' · ' + OSC.fmtDateTime(integrity.at) },
      { id: 'timezone', label: 'Sheet time zone', status: (book.getSpreadsheetTimeZone ? book.getSpreadsheetTimeZone() : APP.tz) === APP.tz ? 'ok' : 'warn', text: book.getSpreadsheetTimeZone ? book.getSpreadsheetTimeZone() : APP.tz }
    ];
    return { version: APP.version, now: Clock.now(), items: items, tabs: tabs, totalCells: total, cellLimit: CELL_LIMIT, growth: growth, runtime: runtime, runtimeLimit: RUNTIME_LIMIT_MIN };
  }

  /** Re-checks the check codes of the audit log and every punch tab. Weekly job + Admin button. */
  function integrity() {
    var tables = ['AuditLog'].concat(Db.ss().getSheets().map(function (s) { return s.getName(); }).filter(function (n) { return /^Punches_\d{4}$/.test(n); }).sort());
    var reps = tables.map(function (t) { if (/^Punches_/.test(t)) punchTable(t.slice(8)); return Db.verifyChain(t); });
    var problems = reps.filter(function (r) { return !r.ok; }).map(function (r) { return r.table + ': ' + r.problem; });
    var out = { at: Clock.now(), ok: !problems.length, problems: problems, tables: reps };
    P().setProperty('INTEGRITY_LAST', JSON.stringify({ at: out.at, ok: out.ok, problems: problems }));
    return out;
  }

  /** Read-only timings of the main screens on this installation (Admin → System health → Speed check). */
  function speed() {
    var out = [], today = Clock.today(), prev = OSCBill.prevMonth(today.slice(0, 7));
    function time(label, fn) { Db.reset(); var t = Date.now(); try { fn(); out.push({ label: label, ms: Date.now() - t }); } catch (e) { out.push({ label: label, ms: Date.now() - t, error: String(e.message || e) }); } }
    time('Dashboard', function () { Dashboard.build(); });
    time('Duties for this month', function () { DutyEngine.list(today.slice(0, 8) + '01', today, {}); });
    time('Exceptions list', function () { DutyEngine.exceptions('Open'); });
    time('Month-end pack overview (' + OSC.fmtMonth(prev) + ')', function () { MonthEnd.status(prev); });
    time('Tablet start-up data', function () { Kiosk.sync({ deviceId: 'SPEED' }, {}); });
    return { at: Clock.now(), results: out };
  }
  return { check: check, integrity: integrity, speed: speed, addRuntime: addRuntime };
})();

/* ---------- archive: rows of old years leave the main sheet (kept in "OutSource Connect archive YYYY") ---------- */
var Archive = (function () {
  var TABLES = [['AuditLog', 'at'], ['LoginLog', 'at'], ['Heartbeats', 'at'], ['EmailLog', 'at'], ['JobLog', 'at'], ['Exceptions', 'dutyDate'], ['DutyDecisions', 'dutyDate'], ['UnrecognisedFaces', 'at']];
  function book(year) {
    var p = PropertiesService.getScriptProperties(), key = 'ARCHIVE_' + year, id = p.getProperty(key), b = null;
    if (id) { try { b = SpreadsheetApp.openById(id); } catch (e) { b = null; } }
    if (!b) {
      b = SpreadsheetApp.create('OutSource Connect archive ' + year);
      p.setProperty(key, b.getId());
      try { DriveApp.getFileById(b.getId()).moveTo(DriveApp.getFolderById(p.getProperty('DRIVE_BACKUPS_ID'))); } catch (e) { /* stays in My Drive */ }
    }
    return b;
  }
  /** Moves rows dated before cutoffIso (YYYY-MM-DD) of the log-style tabs to the archive files (one per year). */
  function oldRows(cutoffIso) {
    var done = [];
    TABLES.forEach(function (t) {
      var name = t[0], field = t[1], sh = Db.ss().getSheetByName(name);
      if (!sh || sh.getLastRow() < 2) return;
      var h = Db.headers(name), ci = h.indexOf(field), last = sh.getLastRow();
      if (ci < 0) return;
      var vals = sh.getRange(2, 1, last - 1, h.length).getValues(), old = [], keep = [];
      vals.forEach(function (r) { var d = String(Db.fromCell(SCHEMA[name].cols.filter(function (c) { return c[0] === field; })[0][1], r[ci])); (d && d < cutoffIso ? old : keep).push(r); });
      if (!old.length) return;
      // write to each year's archive first, then check, then remove
      var byYear = {}; old.forEach(function (r) { var y = String(Db.fromCell('str', r[ci])).slice(0, 4); (byYear[y] = byYear[y] || []).push(r); });
      Object.keys(byYear).forEach(function (y) {
        var b = book(y), ash = b.getSheetByName(name) || b.insertSheet(name);
        if (ash.getLastRow() === 0) ash.getRange(1, 1, 1, h.length).setValues([h]);
        var before = ash.getLastRow();
        ash.getRange(before + 1, 1, byYear[y].length, h.length).setValues(byYear[y]);
        if (ash.getLastRow() !== before + byYear[y].length) throw new Error('Archive check failed for ' + name + ' ' + y + '. Nothing removed.');
      });
      withLock(function () {
        if (SCHEMA[name].log) {
          // logs are in time order: the old rows are the top block
          var contiguous = vals.slice(0, old.length).every(function (r) { return old.indexOf(r) >= 0; });
          if (!contiguous) throw new Error(name + ' is not in date order; archive skipped');
          if (SCHEMA[name].chain) { var hi = h.indexOf('hash'); PropertiesService.getScriptProperties().setProperty('CHAIN_START_' + name, String(old[old.length - 1][hi] || '')); }
          sh.deleteRows(2, old.length);
        } else {
          sh.getRange(2, 1, last - 1, h.length).clearContent();
          if (keep.length) sh.getRange(2, 1, keep.length, h.length).setValues(keep);
          if (last - 1 > keep.length) sh.deleteRows(keep.length + 2, last - 1 - keep.length);
        }
        Db.invalidate(name);
      });
      done.push(name + ': ' + old.length + ' rows');
    });
    return done;
  }
  return { oldRows: oldRows, book: book };
})();

/* ---------- restore from a weekly backup (Sheet menu, owner only) ---------- */
var Restore = (function () {
  var SKIP = ['Sessions'];
  /** Replaces the data tabs of this Sheet with the same tabs of a backup copy. A safety backup of the current state is made first. */
  function run(backupId, tables, who) {
    var src = SpreadsheetApp.openById(backupId);
    if (!src || src.getId() === Db.ss().getId()) throw new Error('Choose a backup file, not this Sheet.');
    var names = (tables && tables.length ? tables : Object.keys(SCHEMA).concat(src.getSheets().map(function (s) { return s.getName(); }).filter(function (n) { return /^(Punches|Duties)_\d{4}$/.test(n); })))
      .filter(function (n, i, a) { return a.indexOf(n) === i && SKIP.indexOf(n) < 0 && src.getSheetByName(n); });
    if (!names.length) throw new Error('The backup has none of the OutSource Connect tabs.');
    var p = PropertiesService.getScriptProperties(), folder = DriveApp.getFolderById(p.getProperty('DRIVE_BACKUPS_ID'));
    var safety = DriveApp.getFileById(Db.ss().getId()).makeCopy('OutSource Connect before restore ' + Clock.now().slice(0, 16).replace('T', ' '), folder);
    var book = Db.ss(), restored = [];
    withLock(function () {
      names.forEach(function (n) {
        var from = src.getSheetByName(n), cur = book.getSheetByName(n);
        var copy = from.copyTo(book);
        if (cur) book.deleteSheet(cur);
        copy.setName(n);
        restored.push(n + ' (' + Math.max(0, copy.getLastRow() - 1) + ' rows)');
        if (SCHEMA[n] && SCHEMA[n].chain) { p.deleteProperty('CHAIN_' + n); var head = Db.chainHead(n); p.setProperty('CHAIN_' + n, head); }
        var m = /^Punches_(\d{4})$/.exec(n); if (m) p.setProperty('PUNCH_DONE_' + m[1], String(Math.max(0, copy.getLastRow() - 1)));
      });
      Db.reset();
      CACHED_TABLES.forEach(function (t) { Db.invalidate(t); });
    });
    Audit.log({ username: who || 'script-editor' }, 'system.restore', 'System', backupId, 'Restored from backup; safety copy ' + safety.getId(), null, { tabs: restored });
    return { restored: restored, safetyCopyId: safety.getId() };
  }
  return { run: run };
})();

/** Sheet menu: 7. Restore from a backup… (asks for the backup link, then for RESTORE to confirm). */
function restoreFromBackup() {
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('Restore from a backup', 'Paste the link (or ID) of the backup Google Sheet from Drive → OutSource Connect Data → Backups.\nAll data tabs of this Sheet will be replaced by the backup. A safety copy of the current Sheet is made first.', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var m = /[-\w]{25,}/.exec(a.getResponseText()); if (!m) { showResult_('Restore', 'That does not look like a Google Sheet link.'); return; }
  var b = ui.prompt('Confirm restore', 'Type RESTORE to replace the data with the backup.', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK || b.getResponseText().trim() !== 'RESTORE') { showResult_('Restore', 'Cancelled. Nothing changed.'); return; }
  var r = Restore.run(m[0], null, 'script-editor');
  showResult_('Restore finished', 'Restored ' + r.restored.length + ' tabs.\nSafety copy of the previous state is in the Backups folder.\n\nNext: open the console, check Staff, Duties and the Month-end pack. Punches made after the backup time are not in it; add them as manual punches from the paper register.');
}

// weekly tamper check (Sunday 03:30), emailed only if something is wrong
Jobs.list.push({ id: 'integrityCheck', label: 'Tamper check (audit log, punches)', when: function () { return 'Every Sunday at 03:30'; },
  due: function (t) { return t.wd === 0 && t.min >= 210 && t.min < 450 ? t.date : null; },
  run: function () { var r = Health.integrity(); if (!r.ok) Mailer.jobFailed('Tamper check', 'Check codes do not match: ' + r.problems.join('; ') + '. Someone may have edited the Google Sheet by hand. Compare with the latest backup.'); return { logged: true, ok: r.ok, problems: r.problems, checked: r.tables.map(function (x) { return x.table + ' ' + x.checked; }) }; } });

ROUTES['system.health'] = ['ADMIN', function () { return Health.check(); }];
ROUTES['system.integrity'] = ['ADMIN', function () { return Health.integrity(); }];
ROUTES['system.speed'] = ['ADMIN', function () { return Health.speed(); }];
