/* ===== 14 Automation: one 5-minute trigger runs punches processing and every scheduled job at its time ===== */
SCHEMA.JobLog = { log: true, cols: [['at', 'datetime'], ['job', 'str'], ['status', 'str'], ['ms', 'num'], ['detail', 'str']] };
DEFAULT_SETTINGS.nightlyCloseTime = ['23:45', 'time', 'Nightly close: re-check the last 3 days, short duties, old sign-ins (24-hour HH:MM)'];
DEFAULT_SETTINGS.backupDay = ['Sun', 'weekday', 'Weekly backup day (Mon, Tue, Wed, Thu, Fri, Sat or Sun)'];
DEFAULT_SETTINGS.backupTime = ['02:00', 'time', 'Weekly backup time (24-hour HH:MM)'];
DEFAULT_SETTINGS.backupKeep = ['8', 'int', 'Number of weekly backups kept in Google Drive'];
DEFAULT_SETTINGS.draftPackTime = ['07:00', 'time', 'On the 1st of each month, draft packs for the previous month are made at this time'];
DEFAULT_SETTINGS.dataKeepYears = ['2', 'int', 'Past full years of punches, duties and logs kept in the main sheet besides the current year (older ones move to an archive file in Drive). 2 keeps up to 3 years; more than 3 can exceed Google\'s cell limit'];

var Jobs = (function () {
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var props = function () { return PropertiesService.getScriptProperties(); };
  function ist() { var d = new Date(Clock.nowMs() + 19800000); return { date: Clock.today(), min: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: d.getUTCDay(), day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() }; }
  function mins(hhmm) { var m = /^(\d\d):(\d\d)$/.exec(String(hhmm || '')); return m ? +m[1] * 60 + +m[2] : 0; }
  /** Daily job: due once a day from its time until `window` minutes later (a missed tick is caught up). */
  function daily(timeKey, windowMin) {
    return function (t) { var at = typeof timeKey === 'number' ? timeKey : mins(Settings.str(timeKey)); return t.min >= at && t.min < at + (windowMin || 180) ? t.date : null; };
  }

  var LIST = [
    { id: 'tabletWatch', label: 'Tablet alerts', when: function () { return 'Every 5 minutes'; }, due: function (t) { return t.date + 'T' + t.min; }, quiet: true,
      enabled: function () { return Settings.bool('tabletAlertsEnabled'); }, run: tabletWatch },
    { id: 'morningEmail', label: 'Morning email', when: function () { return 'Daily at ' + Settings.str('emailMorningTime'); }, due: daily('emailMorningTime', 180), run: function () { return Mailer.morning(); } },
    { id: 'eveningEmail', label: 'Evening email', when: function () { return 'Daily at ' + Settings.str('emailEveningTime'); }, due: daily('emailEveningTime', 120),
      enabled: function () { return Settings.bool('emailEveningEnabled'); }, run: function () { return Mailer.evening(); } },
    { id: 'nightlyClose', label: 'Nightly close', when: function () { return 'Daily at ' + Settings.str('nightlyCloseTime'); }, due: function (t) { var at = mins(Settings.str('nightlyCloseTime')); return t.min >= at && t.min < Math.min(at + 120, 1440) ? t.date : null; }, run: nightlyClose },
    { id: 'retention', label: 'Clean-up (old photos, faces of exited staff, old sign-ins)', when: function () { return 'Daily at 03:00'; }, due: daily(180, 240), run: retention },
    { id: 'weeklyBackup', label: 'Weekly backup', when: function () { return 'Every ' + Settings.str('backupDay') + ' at ' + Settings.str('backupTime'); },
      due: function (t) { var at = mins(Settings.str('backupTime')), wd = WD.indexOf(Settings.str('backupDay')); if (wd < 0) wd = 0; return t.wd === wd && t.min >= at && t.min < at + 360 ? t.date : null; }, run: backup },
    { id: 'monthDraft', label: 'Draft month-end pack', when: function () { return '1st of the month at ' + Settings.str('draftPackTime'); },
      due: function (t) { var at = mins(Settings.str('draftPackTime')); return (t.day === 1 && t.min >= at) || (t.day > 1 && t.day <= 3) ? OSCBill.prevMonth(t.date.slice(0, 7)) : null; }, run: monthDraft },
    { id: 'yearRollover', label: 'Year roll-over and archive', when: function () { return 'Daily at 01:00 (acts in December and January)'; }, due: daily(60, 240), run: yearRollover, quiet: true }
  ];
  function byId(id) { var j = LIST.filter(function (x) { return x.id === id; })[0]; if (!j) fail('NOT_FOUND', 'Unknown job ' + id); return j; }

  function runOne(job, key, manual) {
    var t0 = Date.now(), res, status = 'OK';
    try { res = job.run(manual); }
    catch (e) { status = 'FAILED'; res = String(e && e.message || e); console.error(job.id + ' failed: ' + (e && e.stack || e)); }
    var detail = typeof res === 'string' ? res : JSON.stringify(res == null ? '' : res);
    var p = props();
    p.setProperty('JOB_AT_' + job.id, Clock.now()); p.setProperty('JOB_STATUS_' + job.id, status); p.setProperty('JOB_DETAIL_' + job.id, clip(detail, 400));
    if (key) {
      if (status === 'OK') { p.setProperty('JOB_KEY_' + job.id, key); p.deleteProperty('JOB_FAILS_' + job.id); }
      else {
        var fails = parseInt(p.getProperty('JOB_FAILS_' + job.id) || '0', 10) + 1;
        p.setProperty('JOB_FAILS_' + job.id, String(fails));
        if (fails >= 3) { p.setProperty('JOB_KEY_' + job.id, key); p.deleteProperty('JOB_FAILS_' + job.id); } // give up until the next period
        if (fails === 1) { try { Mailer.jobFailed(job.label, detail); } catch (e) { /* ignore */ } }
      }
    }
    if (!job.quiet || status !== 'OK' || manual || (res && res.logged)) Db.append('JobLog', { at: Clock.now(), job: job.id, status: status, ms: Date.now() - t0, detail: clip(detail, 1000) });
    return { job: job.id, status: status, ms: Date.now() - t0, result: res };
  }

  /** Called by the 5-minute trigger after punches are processed. Runs every job whose time has come (once per period). */
  function tick(startedMs) {
    var t = ist(), p = props(), ran = [];
    LIST.forEach(function (job) {
      if (Date.now() - (startedMs || Date.now()) > 240000) return; // keep well inside Google's 6-minute limit; the rest runs next tick
      if (job.enabled && !job.enabled()) return;
      var key = job.due(t);
      if (!key || p.getProperty('JOB_KEY_' + job.id) === key) return;
      if (job.id === 'tabletWatch') { var r = runOne(job, null); p.setProperty('JOB_KEY_' + job.id, key); ran.push(r); return; }
      ran.push(runOne(job, key));
    });
    return ran;
  }

  // ---------- jobs ----------
  function tabletWatch() {
    var p = props(), sent = [], silentMin = Settings.int('tabletSilentAlertMinutes'), lowPct = Settings.int('tabletLowBatteryPct'), qMax = Settings.int('tabletQueueAlert');
    Devices.list().filter(function (d) { return d.active && d.lastSeenAt; }).forEach(function (d) {
      var probs = [];
      if (d.minutesSinceSeen != null && d.minutesSinceSeen > silentMin) probs.push('Silent for ' + d.minutesSinceSeen + ' minutes');
      if (d.battery != null && d.battery !== '' && d.battery < lowPct && !d.charging) probs.push('Battery ' + d.battery + '% and not charging');
      if (d.cameraOk === false) probs.push('Camera not working');
      if ((d.queueSize || 0) >= qMax) probs.push(d.queueSize + ' punches waiting to upload');
      var keyP = 'TABLET_ALERT_' + d.deviceId, prev = p.getProperty(keyP) || '', now = probs.map(function (x) { return x.replace(/\d+/g, '#'); }).sort().join('|');
      if (now && now !== prev) { Mailer.tablet(d, probs, false); sent.push(d.deviceId + ': ' + probs.join(', ')); p.setProperty(keyP, now); }
      else if (!now && prev) { Mailer.tablet(d, [], true); sent.push(d.deviceId + ': back to normal'); p.deleteProperty(keyP); }
    });
    return sent.length ? { logged: true, alerts: sent } : { alerts: 0 };
  }
  function nightlyClose() {
    var from = OSC.addDays(Clock.today(), -2), r = DutyEngine.rebuild(from);
    var cut = OSC.nowISTString(Clock.nowMs() - 2 * 86400000);
    var n = withLock(function () { return Db.deleteWhere('Sessions', function (s) { return s.revoked || s.expiresAt < cut; }); });
    return { recalculatedFrom: from, duties: r.duties, openItems: r.exceptions, oldSessionsRemoved: n };
  }
  function retention() {
    var out = { photoFolders: 0, faces: 0 }, keep = Settings.int('photoRetentionDays'), cutoff = OSC.addDays(Clock.today(), -keep), P = props();
    ['PHOTOS', 'UNRECOGNISED'].forEach(function (kind) {
      var id = P.getProperty('DRIVE_' + kind + '_ID'); if (!id) return;
      var it = DriveApp.getFolderById(id).getFolders();
      while (it.hasNext()) {
        var f = it.next(), name = f.getName();
        if (/^\d{4}-\d{2}$/.test(name) && MonthEnd.lastDay(name) < cutoff) { f.setTrashed(true); P.deleteProperty('DRIVE_' + kind + '_' + name); out.photoFolders++; }
      }
    });
    // face data of people who left more than N days ago
    var faceCut = OSC.addDays(Clock.today(), -Settings.int('faceDeleteDaysAfterExit')), gone = {};
    Db.all('Staff').forEach(function (s) { if (s.status === 'Exited' && s.exitDate && s.exitDate < faceCut) gone[s.staffId] = 1; });
    withLock(function () {
      Db.where('FaceData', function (f) { return gone[f.staffId] && f.status !== 'Deleted'; }).forEach(function (f) { Db.update('FaceData', f.faceId, { descriptors: '', status: 'Deleted', note: 'Deleted ' + Clock.today() + ' (retention)' }); out.faces++; });
      Db.deleteWhere('FaceThumbs', function (t) { return gone[t.staffId]; });
    });
    return out;
  }
  function backup() {
    var P = props(), folder = DriveApp.getFolderById(P.getProperty('DRIVE_BACKUPS_ID'));
    var name = 'OutSource Connect backup ' + Clock.today();
    var copy = DriveApp.getFileById(Db.ss().getId()).makeCopy(name, folder);
    var files = [], it = folder.getFiles();
    while (it.hasNext()) { var f = it.next(); if (/^OutSource Connect backup \d{4}-\d{2}-\d{2}$/.test(f.getName())) files.push(f); }
    files.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
    var removed = 0; files.slice(Settings.int('backupKeep')).forEach(function (f) { f.setTrashed(true); removed++; });
    return { logged: true, backup: name, fileId: copy.getId(), oldRemoved: removed };
  }
  function monthDraft() {
    var ym = OSCBill.prevMonth(Clock.today().slice(0, 7)), items = MonthEnd.drafts(ym);
    if (!items.length) return { month: ym, drafts: 0, note: 'Nothing to draft (all locked or no duties)' };
    var mail = Mailer.draftReady(ym, items);
    return { month: ym, drafts: items.length, email: mail.status };
  }
  function yearRollover() {
    var t = ist(), out = { created: [], archived: [] };
    if (t.month === 12 && t.day >= 15) [punchTable(t.year + 1), dutyTable(t.year + 1)].forEach(function (n) { if (!Db.ss().getSheetByName(n)) { Db.ensureTable(n); out.created.push(n); } });
    var keepFrom = t.year - Settings.int('dataKeepYears');
    Db.ss().getSheets().forEach(function (sh) {
      var m = /^(Punches|Duties)_(\d{4})$/.exec(sh.getName());
      if (!m || +m[2] >= keepFrom) return;
      out.archived.push(archiveSheet(sh, +m[2]));
    });
    if (t.month === 1 || t.month === 12) out.oldRows = Archive.oldRows(keepFrom + '-01-01');
    if (out.created.length || out.archived.length || (out.oldRows && out.oldRows.length)) out.logged = true;
    return out;
  }
  /** Copies an old yearly tab to "OutSource Connect archive YYYY" in Drive, checks the copy, then removes it from the main sheet. */
  function archiveSheet(sh, year) {
    var P = props(), key = 'ARCHIVE_' + year, book = null, id = P.getProperty(key);
    if (id) { try { book = SpreadsheetApp.openById(id); } catch (e) { book = null; } }
    if (!book) {
      book = SpreadsheetApp.create('OutSource Connect archive ' + year);
      P.setProperty(key, book.getId());
      try { DriveApp.getFileById(book.getId()).moveTo(DriveApp.getFolderById(P.getProperty('DRIVE_BACKUPS_ID'))); } catch (e) { /* stays in My Drive */ }
    }
    var name = sh.getName(), rows = sh.getLastRow();
    var existing = book.getSheetByName(name); if (existing) book.deleteSheet(existing);
    var copy = sh.copyTo(book); copy.setName(name);
    if (copy.getLastRow() !== rows) throw new Error('Archive copy of ' + name + ' has ' + copy.getLastRow() + ' rows, expected ' + rows + '. Nothing removed.');
    Db.ss().deleteSheet(sh);
    return name + ' (' + rows + ' rows) → archive ' + year;
  }

  function status() {
    var P = props();
    return {
      trigger: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'processPunchesJob'; }),
      lastProcessing: P.getProperty('DUTIES_LAST_RUN') || '',
      jobs: LIST.map(function (j) {
        return { id: j.id, label: j.label, when: j.when(), enabled: j.enabled ? j.enabled() : true, lastAt: P.getProperty('JOB_AT_' + j.id) || '', lastStatus: P.getProperty('JOB_STATUS_' + j.id) || '', lastDetail: P.getProperty('JOB_DETAIL_' + j.id) || '', lastKey: P.getProperty('JOB_KEY_' + j.id) || '' };
      }),
      log: Db.tail('JobLog', 40),
      mailQuota: (function () { try { return MailApp.getRemainingDailyQuota(); } catch (e) { return null; } })()
    };
  }
  function runNow(user, id) {
    var job = byId(id), r = runOne(job, null, true);
    Audit.log(user, 'jobs.run', 'Jobs', id, 'Run now from console', null, { status: r.status });
    return r;
  }
  return { tick: tick, status: status, runNow: runNow, list: LIST, ist: ist };
})();

/* The 5-minute trigger (installed by menu item 4). Kept under the Phase 3 name so the existing trigger keeps working. */
function processPunchesJob() {
  var t0 = Date.now();
  try { DutyEngine.processNew(); } catch (e) { console.error('processNew failed: ' + (e && e.stack || e)); }
  Db.reset();
  var ran = Jobs.tick(t0);
  try { Health.addRuntime(Date.now() - t0); } catch (e) { /* ignore */ }
  return ran;
}
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (['processPunchesJob'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('processPunchesJob').timeBased().everyMinutes(5).create();
  showResult_('Automatic processing on', 'Every 5 minutes: new punches become duties, the tablet is watched, and emails, backups, drafts and clean-up run at their set times.');
}

ROUTES['jobs.status'] = ['ADMIN', function () { return Jobs.status(); }];
ROUTES['jobs.run'] = ['ADMIN', function (u, d) { return Jobs.runNow(u, d.job); }];
