/* ===== 17 Ops extras (v6.1): ignore/restore exceptions, punches by date range, bulk dismiss of unrecognised faces, tablet diagnostics ===== */

var Extras = (function () {
  var TYPE_TEXT = { MISSING_OUT: 'Missing OUT', MISSING_IN: 'Missing IN', LATE_GRACE: 'Late arrival', LONG_DUTY: 'Over 12 h', SHORT_DUTY: 'Short duty' };
  function reason(d) {
    var code = OSC.cleanText(d.reasonCode);
    if (REASON_CODES.indexOf(code) < 0) failFields({ reasonCode: 'Choose a reason' });
    var note = OSC.cleanText(d.note, 300);
    if (note.length < 3) failFields({ note: 'Write a short note (at least 3 characters)' });
    return code + ': ' + note;
  }
  function items(d) {
    var list = Array.isArray(d.items) ? d.items : [];
    if (!list.length) failFields({ items: 'Choose at least one item' });
    if (list.length > 300) failFields({ items: 'At most 300 at a time' });
    return list.map(function (x) { return { id: String(x.id || '').slice(0, 120), dutyDate: OSC.parseDate(x.dutyDate) || '' }; }).filter(function (x) { return x.id && x.dutyDate; });
  }

  /**
   * Ignore: the item leaves the list without changing any hours (kept for audit, can be restored).
   * Billing effect: an ignored Missing IN/OUT counts 0 hours for that duty; ignored hours over 12 are not billed.
   */
  function setStatus(user, d, to) {
    var list = items(d), text = to === 'Ignored' ? reason(d) : OSC.cleanText(d.note || 'Restored', 300);
    if (!list.length) failFields({ items: 'Nothing to change' });
    var minDate = list.reduce(function (a, x) { return !a || x.dutyDate < a ? x.dutyDate : a; }, '');
    var staff = {}; Db.all('Staff').forEach(function (s) { staff[s.staffId] = s; });
    var done = [], skipped = [];
    withLock(function () {
      var et = BlockTable('Exceptions', 5000, OSC.addDays(minDate, -2), 'dutyDate');
      list.forEach(function (x) {
        var e = et.get(x.id);
        if (!e) { skipped.push(x.id + ': not found'); return; }
        if (to === 'Ignored' && e.status !== 'Open') { skipped.push(x.id + ': already ' + e.status); return; }
        if (to === 'Open' && e.status !== 'Ignored') { skipped.push(x.id + ': not ignored'); return; }
        var s = staff[e.staffId] || {};
        if (MonthLocks.isLocked(s.deptCode || '', String(e.dutyDate).slice(0, 7))) { skipped.push(x.id + ': ' + OSC.fmtMonth(String(e.dutyDate).slice(0, 7)) + ' is locked'); return; }
        et.put(to === 'Ignored'
          ? { exceptionId: e.exceptionId, status: 'Ignored', resolvedBy: user.username, resolvedAt: Clock.now(), resolution: clip('Ignored · ' + text, 300), updatedAt: Clock.now() }
          : { exceptionId: e.exceptionId, status: 'Open', resolvedBy: '', resolvedAt: '', resolution: '', updatedAt: Clock.now() });
        done.push(e.exceptionId);
      });
      et.flush();
    });
    if (done.length) Audit.log(user, to === 'Ignored' ? 'exceptions.ignore' : 'exceptions.restore', 'Exceptions', done.length === 1 ? done[0] : done.length + ' items', text, null, { ids: done.slice(0, 100) });
    // restored items: let the engine re-check them now (auto-closes ones whose cause is gone)
    if (to === 'Open' && done.length) {
      try { DutyEngine.rebuild(minDate < OSC.addDays(Clock.today(), -60) ? OSC.addDays(Clock.today(), -60) : minDate); } catch (e) { /* busy: the 5-minute job re-checks */ }
    }
    return { changed: done.length, skipped: skipped };
  }

  /** Ignored items by staff+date, for the month-end bill (see MonthEnd.collect). */
  function ignoredFor(from, to) {
    var out = {};
    BlockTable('Exceptions', 3000, from, 'dutyDate', to).rows().forEach(function (x) {
      if (x.status === 'Ignored') (out[x.staffId + ':' + x.dutyDate] = out[x.staffId + ':' + x.dutyDate] || {})[x.type] = 1;
    });
    return out;
  }

  /** Punches between two dates (up to 62 days), newest first, with optional filters. */
  function punchRange(d) {
    var from = OSC.parseDate(d.from), to = OSC.parseDate(d.to) || from;
    if (!from) failFields({ from: 'Choose the start date' });
    if (to < from) failFields({ to: 'The end date is before the start date' });
    if (OSC.daysBetween ? OSC.daysBetween(from, to) > 62 : (Date.parse(to) - Date.parse(from)) / 86400000 > 62) failFields({ to: 'Choose at most 62 days' });
    var staff = {}; Db.all('Staff').forEach(function (s) { staff[s.staffId] = s; });
    var dept = OSC.cleanText(d.deptCode || '').toUpperCase(), type = d.type === 'IN' || d.type === 'OUT' ? d.type : '', who = OSC.cleanText(d.staffId || '').toUpperCase();
    var out = [];
    for (var y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
      var t = punchTable(y);
      if (!Db.ss().getSheetByName(t)) continue;
      BlockTable(t, 4000, from + 'T00:00', 'at', to).rows().forEach(function (p) {
        var day = String(p.at).slice(0, 10);
        if (day < from || day > to) return;
        var s = staff[p.staffId] || {};
        if (dept && s.deptCode !== dept) return;
        if (type && p.type !== type) return;
        if (who && p.staffId !== who) return;
        out.push({ punchId: p.punchId, staffId: p.staffId, name: s.title ? s.title + ' ' + s.fullName : p.staffId, deptCode: s.deptCode, type: p.type, at: p.at,
          receivedAt: p.receivedAt, offline: p.offline, status: p.status, distance: p.distance, liveness: p.liveness, hasPhoto: !!p.photoFileId, note: p.note, deviceId: p.deviceId });
      });
    }
    out.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    var total = out.length;
    return { from: from, to: to, total: total, rows: out.slice(0, 5000), truncated: total > 5000 };
  }

  /** Dismiss several unrecognised-face photos at once (selected ones, or all open ones in a date range). */
  function dismissMany(user, d) {
    var why = OSC.cleanText(d.reason, 200);
    if (why.length < 3) failFields({ reason: 'Choose or write a reason' });
    var ids = Array.isArray(d.ids) ? d.ids.map(String) : null, from = OSC.parseDate(d.from), to = OSC.parseDate(d.to);
    if (!ids && !from) failFields({ ids: 'Choose photos or a date range' });
    if (ids && ids.length > 500) failFields({ ids: 'At most 500 at a time' });
    var set = {}; (ids || []).forEach(function (i) { set[i] = 1; });
    var n = 0;
    withLock(function () {
      Db.all('UnrecognisedFaces').filter(function (u) {
        if (u.status !== 'Open') return false;
        if (ids) return !!set[u.unrecId];
        var day = String(u.at).slice(0, 10); return day >= from && (!to || day <= to);
      }).forEach(function (u) { Db.update('UnrecognisedFaces', u.unrecId, { status: 'Dismissed', resolvedBy: user.username, resolvedAt: Clock.now(), note: why }); n++; });
    });
    if (n) Audit.log(user, 'unrecognised.dismissMany', 'UnrecognisedFaces', n + ' photos', why, null, ids ? { ids: ids.slice(0, 100) } : { from: from, to: to });
    return { dismissed: n };
  }
  return { setStatus: setStatus, ignoredFor: ignoredFor, punchRange: punchRange, dismissMany: dismissMany };
})();

ROUTES['exceptions.ignore'] = ['APP', function (u, d) { return Extras.setStatus(u, d, 'Ignored'); }];
ROUTES['exceptions.restore'] = ['APP', function (u, d) { return Extras.setStatus(u, d, 'Open'); }];
ROUTES['punches.range'] = ['APP', function (u, d) { return Extras.punchRange(d); }];
ROUTES['unrecognised.dismissMany'] = ['APP', function (u, d) { return Extras.dismissMany(u, d); }];

