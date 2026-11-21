/* ===== 10 Duties: rule versions, punch -> duty processing, exceptions, decisions ===== */
SCHEMA.Rules = { key: 'ruleId', cols: [['ruleId', 'str'], ['effectiveFrom', 'date'], ['deptCode', 'str'], ['params', 'json'], ['status', 'str'], ['note', 'str'], ['createdAt', 'datetime'], ['createdBy', 'str']] };
SCHEMA.Exceptions = { key: 'exceptionId', cols: [['exceptionId', 'str'], ['type', 'str'], ['staffId', 'str'], ['dutyId', 'str'], ['dutyDate', 'date'], ['status', 'str'], ['severity', 'str'], ['summary', 'str'], ['suggestion', 'json'], ['createdAt', 'datetime'], ['updatedAt', 'datetime'], ['resolvedBy', 'str'], ['resolvedAt', 'datetime'], ['resolution', 'str']] };
SCHEMA.DutyDecisions = { key: 'decisionKey', cols: [['decisionKey', 'str'], ['kind', 'str'], ['staffId', 'str'], ['dutyDate', 'date'], ['value', 'json'], ['reasonCode', 'str'], ['note', 'str'], ['status', 'str'], ['by', 'str'], ['at', 'datetime']] };
var DUTY_COLS = [['dutyId', 'str'], ['staffId', 'str'], ['dutyDate', 'date'], ['kind', 'str'], ['status', 'str'], ['inPunchId', 'str'], ['outPunchId', 'str'], ['inAt', 'datetime'], ['outAt', 'datetime'],
  ['startAt', 'datetime'], ['shift', 'str'], ['systemHours', 'num'], ['graceHours', 'num'], ['finalHours', 'num'], ['finalSource', 'str'], ['lateGrace', 'bool'],
  ['deptCode', 'str'], ['designation', 'str'], ['companyId', 'str'], ['rateId', 'str'], ['ratePerDuty', 'num'], ['gstPct', 'num'], ['ruleId', 'str'], ['explain', 'str'], ['updatedAt', 'datetime']];
function dutyTable(year) { var n = 'Duties_' + year; if (!SCHEMA[n]) SCHEMA[n] = { key: 'dutyId', cols: DUTY_COLS }; return n; }
dutyTable(new Date(Date.now() + 19800000).getUTCFullYear());
CACHED_TABLES.push('Rules', 'DutyDecisions');

/* ---------- rule versions ---------- */
var RuleVersions = {
  ensureDefault: function () {
    if (Db.all('Rules').length) return;
    Db.insert('Rules', { ruleId: 'RV1', effectiveFrom: '2020-01-01', deptCode: 'ALL', params: OSCRules.DEFAULTS, status: 'Active', note: 'Owner-approved defaults (Phase 0)', createdAt: Clock.now(), createdBy: 'setup' });
  },
  /** Version in force on a date for a department (department-specific beats ALL). */
  forDate: function (iso, deptCode) {
    var rows = Db.where('Rules', function (r) { return r.status === 'Active' && r.effectiveFrom <= iso && (r.deptCode === 'ALL' || r.deptCode === deptCode); })
      .sort(function (a, b) { return (a.effectiveFrom + (a.deptCode === 'ALL' ? '0' : '1')) < (b.effectiveFrom + (b.deptCode === 'ALL' ? '0' : '1')) ? 1 : -1; });
    var row = rows[0];
    return { ruleId: row ? row.ruleId : 'DEFAULT', rules: OSCRules.normalise(row ? row.params : {}).rules };
  },
  list: function () { return Db.all('Rules').slice().sort(function (a, b) { return a.effectiveFrom < b.effectiveFrom ? 1 : -1; }).map(function (r) { delete r._row; return r; }); },
  add: function (admin, data) {
    var reason = requireReason(data.reason);
    var n = OSCRules.normalise(data.params || {});
    if (!n.ok) failFields(n.errors);
    var from = OSC.parseDate(data.effectiveFrom);
    if (!from) failFields({ effectiveFrom: 'Enter the date the rules start' });
    if (from.slice(8) !== '01') failFields({ effectiveFrom: 'Rules change on the 1st of a month, so one bill never mixes two rule sets' });
    var dept = data.deptCode && data.deptCode !== 'ALL' ? String(data.deptCode).toUpperCase() : 'ALL';
    if (MonthLocks.anyLockedBetween(dept === 'ALL' ? 'ALL' : dept, from, '9999-12-31') || Db.where('MonthLocks', function (m) { return m.status === 'LOCKED' && m.month >= from.slice(0, 7); }).length)
      failFields({ effectiveFrom: 'A month on or after this date is already locked' });
    var id = withLock(function () {
      var rid = 'RV' + (Db.all('Rules').length + 1);
      Db.insert('Rules', { ruleId: rid, effectiveFrom: from, deptCode: dept, params: n.rules, status: 'Active', note: OSC.cleanText(data.note, 200), createdAt: Clock.now(), createdBy: admin.username });
      return rid;
    });
    Audit.log(admin, 'rules.add', 'Rules', id, reason, null, { effectiveFrom: from, deptCode: dept, params: n.rules });
    return { ruleId: id, effectiveFrom: from };
  }
};

/* ---------- block store: read only the rows a job needs, change them in memory, write back in one call ----------
 * minDate/maxDate (optional) limit the rows by dateField. Rows are appended roughly in date order, so the date column is read
 * first (one narrow read) and only the block from the first row on/after minDate to the last row on/before maxDate is loaded.
 * Every row with a date in [minDate, maxDate] lies inside that block, even when an old date was appended late. */
function BlockTable(table, tailRows, minDate, dateField, maxDate) {
  var sh = Db.sheet(table), h = Db.headers(table), types = {};
  SCHEMA[table].cols.forEach(function (c) { types[c[0]] = c[1]; });
  var key = SCHEMA[table].key, last = sh.getLastRow();
  var start = Math.max(2, last - tailRows + 1), end = last;
  function read(from, to) {
    if (to < from || last < from) return [];
    return sh.getRange(from, 1, to - from + 1, h.length).getValues().map(function (row) {
      var o = {}; h.forEach(function (name, i) { if (types[name]) o[name] = Db.fromCell(types[name], row[i]); }); return o;
    });
  }
  if ((minDate || maxDate) && dateField && last >= 2 && h.indexOf(dateField) >= 0) {
    var ci = h.indexOf(dateField) + 1, from = start;
    var colRead = function (f) { return sh.getRange(f, ci, last - f + 1, 1).getValues().map(function (r) { return String(Db.fromCell(types[dateField], r[0])); }); };
    var dates = colRead(from);
    // the tail starts inside the window (its first rows are already on/after minDate), or a range ends before the tail: look at the whole column
    if (from > 2 && ((minDate && dates.slice(0, 50).some(function (d) { return d >= minDate; })) || (maxDate && dates.length && dates[0] > maxDate))) { from = 2; dates = colRead(2); }
    var first = -1, lastIdx = -1;
    for (var i = 0; i < dates.length; i++) {
      if (first < 0 && (!minDate || dates[i] >= minDate)) first = i;
      if (!maxDate || dates[i].slice(0, maxDate.length) <= maxDate) lastIdx = i;
    }
    if (first < 0 || lastIdx < first) { start = last + 1; end = last; } else { start = from + first; end = from + lastIdx; }
  }
  var rows = read(start, end);
  var index = {}; rows.forEach(function (r, i) { index[r[key]] = i; });
  var added = [], dirty = false, lo = Infinity, hi = -1;
  // a blank cell reads back as '' or null depending on the column type; both mean "empty"
  function same(a, b) { var ea = a === '' || a == null, eb = b === '' || b == null; if (ea || eb) return ea && eb; if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b); return JSON.stringify(a) === JSON.stringify(b); }
  return {
    rows: function () { return rows.concat(added); },
    get: function (k) { return index[k] != null ? (index[k] < rows.length ? rows[index[k]] : added[index[k] - rows.length]) : null; },
    put: function (o) {
      if (index[o[key]] != null && index[o[key]] < rows.length) {
        var at = index[o[key]], cur = rows[at], ch = false;
        Object.keys(o).forEach(function (f) { if (!same(cur[f], o[f])) { cur[f] = o[f]; ch = true; } });
        if (ch) { dirty = true; lo = Math.min(lo, at); hi = Math.max(hi, at); }
        return ch;
      }
      if (index[o[key]] != null) { var ad = added[index[o[key]] - rows.length]; Object.keys(o).forEach(function (f) { ad[f] = o[f]; }); return true; }
      index[o[key]] = rows.length + added.length; added.push(o); return true;
    },
    flush: function () {
      var toRow = function (o) { return h.map(function (n) { return types[n] ? Db.toCell(types[n], o[n]) : ''; }); };
      // write back only the block between the first and last changed row
      if (dirty && hi >= lo) sh.getRange(start + lo, 1, hi - lo + 1, h.length).setValues(rows.slice(lo, hi + 1).map(toRow));
      if (added.length) sh.getRange(last + 1, 1, added.length, h.length).setValues(added.map(toRow));
      var n = (dirty ? hi - lo + 1 : 0) + added.length;
      Db.invalidate(table);
      return n;
    },
    stats: function () { return { from: start, to: end, rows: rows.length }; }
  };
}

/* ---------- the engine ---------- */
var DutyEngine = (function () {
  var props = function () { return PropertiesService.getScriptProperties(); };
  var DAY = 86400000;
  function istMs(iso) { return Date.parse(iso); }
  function yearsBetween(fromIso, toIso) { var y = [], a = +fromIso.slice(0, 4), b = +toIso.slice(0, 4); for (var i = a; i <= b; i++) y.push(i); return y; }

  /** Accepted punches for some staff since a date, from the yearly punch tabs. */
  function loadPunches(staffSet, fromIso) {
    var out = [], today = Clock.today();
    yearsBetween(fromIso, today).forEach(function (y) {
      var t = punchTable(y);
      if (!Db.ss().getSheetByName(t)) return;
      var bt = BlockTable(t, 4000, fromIso + 'T00:00', 'at');
      bt.rows().forEach(function (p) {
        if ((!staffSet || staffSet[p.staffId]) && p.at >= fromIso) out.push({ punchId: p.punchId, staffId: p.staffId, type: p.type, at: istMs(p.at), status: p.status, atIso: p.at });
      });
    });
    return out;
  }
  function decisions() { var m = {}; Db.all('DutyDecisions').forEach(function (d) { if (d.status !== 'Revoked') m[d.decisionKey] = d; }); return m; }

  /** Builds duty rows + exceptions for one person from their punches (pure apart from master lookups). */
  function buildForStaff(staffId, punches, fromIso, dec, nowMs) {
    var current = RuleVersions.forDate(Clock.today(), (Db.find('Staff', staffId) || {}).deptCode);
    var segs = OSCRules.pair(punches, current.rules, nowMs);
    var duties = [], exc = [];
    segs.forEach(function (sg) {
      var inP = sg.in, outP = sg.out;
      var anchorMs = inP ? inP.at : OSCRules.suggestIn(outP.at, current.rules);
      var dutyDate = OSCRules.minDate(OSCRules.toMin(anchorMs));
      if (dutyDate < fromIso) return;
      var dept = Staff.valueOn(staffId, 'department', dutyDate) || (Db.find('Staff', staffId) || {}).deptCode;
      var rv = RuleVersions.forDate(dutyDate, dept), R = rv.rules;
      var dutyId = inP ? inP.punchId : 'MI-' + outP.punchId;
      var c = inP ? OSCRules.computeDuty(inP.at, outP ? outP.at : null, R) : null;
      var company = Staff.valueOn(staffId, 'company', dutyDate), desig = Staff.valueOn(staffId, 'designation', dutyDate);
      var rate = company ? Rates.rateFor(company, dept, desig, dutyDate) : null;
      var status = sg.kind === 'pair' ? 'Closed' : sg.kind === 'open' ? 'Open' : sg.kind === 'missingOut' ? 'MissingOut' : 'MissingIn';
      var d = { dutyId: dutyId, staffId: staffId, dutyDate: dutyDate, kind: sg.kind, status: status, inPunchId: inP ? inP.punchId : '', outPunchId: outP ? outP.punchId : '',
        inAt: inP ? inP.atIso : '', outAt: outP ? outP.atIso : '', startAt: c ? OSC.nowISTString(c.startMs) : '', shift: c ? c.shift : '',
        systemHours: c && c.hours != null ? c.hours : '', graceHours: c && c.lateGrace && c.graceHours != null ? c.graceHours : '', lateGrace: !!(c && c.lateGrace),
        deptCode: dept || '', designation: desig || '', companyId: company || '', rateId: rate ? rate.rateId : '', ratePerDuty: rate ? rate.ratePerDuty : '', gstPct: rate ? rate.gstPct : '',
        ruleId: rv.ruleId, explain: c ? (c.startHow + (c.endHow ? '; ' + c.endHow : '')) : 'IN missing', updatedAt: Clock.now() };
      // decisions from the Ops manager (Phase 4 screens write these)
      var fin = d.systemHours, src = 'system';
      if (dec['GRACE:' + dutyId] && d.graceHours !== '') { var g = dec['GRACE:' + dutyId].value || {}; if (g.choice === 'grace') { fin = d.graceHours; src = 'grace'; } }
      if (dec['FINAL:' + dutyId]) { fin = Number((dec['FINAL:' + dutyId].value || {}).hours); src = 'override'; }
      if (dec['SHIFT:' + dutyId]) d.shift = (dec['SHIFT:' + dutyId].value || {}).shift || d.shift;
      d.finalHours = fin === '' ? '' : fin; d.finalSource = fin === '' ? '' : src;
      duties.push(d);
      var name = d.dutyDate;
      if (status === 'MissingOut') exc.push({ type: 'MISSING_OUT', subject: dutyId, d: d, severity: 'red', summary: 'IN ' + OSC.fmtDateTime(d.inAt) + ' has no OUT (' + sg.reason + ')', suggestion: { outAt: OSC.nowISTString(OSCRules.suggestOut(inP.at, R)) } });
      if (status === 'MissingIn') exc.push({ type: 'MISSING_IN', subject: dutyId, d: d, severity: 'red', summary: 'OUT ' + OSC.fmtDateTime(d.outAt) + ' has no IN', suggestion: { inAt: OSC.nowISTString(OSCRules.suggestIn(outP.at, R)) } });
      if (d.lateGrace && !dec['GRACE:' + dutyId] && status === 'Closed') exc.push({ type: 'LATE_GRACE', subject: dutyId, d: d, severity: 'amber', summary: 'IN ' + c.inClock + ': ' + d.systemHours + ' h strict, ' + d.graceHours + ' h with grace from ' + c.graceStartClock, suggestion: { strict: d.systemHours, grace: d.graceHours } });
    });
    // per-date checks: over 12 needs approval; under 12 goes to short-duty review
    var byDate = {};
    duties.forEach(function (d) { (byDate[d.dutyDate] = byDate[d.dutyDate] || []).push(d); });
    Object.keys(byDate).forEach(function (date) {
      var list = byDate[date], R = RuleVersions.forDate(date, list[0].deptCode).rules;
      var allClosed = list.every(function (d) { return d.status === 'Closed'; });
      var total = OSCRules.r2(list.reduce(function (a, d) { return a + (Number(d.finalHours) || 0); }, 0));
      var subj = staffId + ':' + date, sp = OSCRules.split(total, R);
      if (R.over12NeedsApproval && sp.dd > 0 && !dec['APPROVE:' + subj]) exc.push({ type: 'LONG_DUTY', subject: subj, d: list[list.length - 1], severity: 'amber', summary: total + ' h on ' + OSC.fmtDate(date) + ': ' + sp.dd + ' h beyond ' + R.dutyHours + ' h wait for approval', suggestion: { total: total, pending: sp.dd } });
      var lastOut = Math.max.apply(null, list.map(function (d) { return d.outAt ? istMs(d.outAt) : 0; }));
      if (allClosed && total < R.shortDutyBelowH && nowMs - lastOut > 3600000 && !dec['REVIEW:SHORT_DUTY:' + subj]) exc.push({ type: 'SHORT_DUTY', subject: subj, d: list[list.length - 1], severity: 'info', summary: total + ' h on ' + OSC.fmtDate(date) + ' (less than ' + R.shortDutyBelowH + ' h)', suggestion: { total: total } });
    });
    return { duties: duties, exceptions: exc };
  }

  /** Recalculates duties for some staff from a date. Writes Duties_<year> and Exceptions in one go each. */
  function recompute(staffIds, fromIso) {
    var nowMs = Clock.nowMs(), set = {};
    staffIds.forEach(function (s) { set[s] = 1; });
    var readFrom = OSC.addDays(fromIso, -3); // to find an IN that started before the window
    var punches = loadPunches(set, readFrom);
    var dec = decisions(), byStaff = {};
    punches.forEach(function (p) { (byStaff[p.staffId] = byStaff[p.staffId] || []).push(p); });
    var allDuties = [], allExc = [];
    staffIds.forEach(function (s) { var r = buildForStaff(s, byStaff[s] || [], fromIso, dec, nowMs); allDuties = allDuties.concat(r.duties); allExc = allExc.concat(r.exceptions); });
    var locked = function (d) { return MonthLocks.isLocked(d.deptCode, d.dutyDate.slice(0, 7)); };
    var written = 0;
    yearsBetween(fromIso, Clock.today()).forEach(function (y) {
      var t = dutyTable(y);
      if (!Db.ss().getSheetByName(t)) Db.ensureTable(t);
      var bt = BlockTable(t, 4000, fromIso, 'dutyDate'), keep = {};
      allDuties.filter(function (d) { return d.dutyDate.slice(0, 4) === String(y) && !locked(d); }).forEach(function (d) { keep[d.dutyId] = 1; var cur = bt.get(d.dutyId); if (cur) d.updatedAt = cur.updatedAt; if (bt.put(d) && cur) bt.put({ dutyId: d.dutyId, updatedAt: Clock.now() }); });
      bt.rows().forEach(function (d) { if (set[d.staffId] && d.dutyDate >= fromIso && !keep[d.dutyId] && d.status !== 'Void' && !locked(d)) bt.put({ dutyId: d.dutyId, status: 'Void', updatedAt: Clock.now() }); });
      written += bt.flush();
    });
    // exceptions: open the new ones, keep resolved ones, auto-close the ones whose cause is gone
    var et = BlockTable('Exceptions', 5000, fromIso, 'dutyDate'), seen = {};
    allExc.forEach(function (x) {
      var id = x.type + ':' + x.subject; seen[id] = 1;
      var cur = et.get(id);
      if (cur && cur.status === 'Resolved') return;
      et.put({ exceptionId: id, type: x.type, staffId: x.d.staffId, dutyId: x.d.dutyId, dutyDate: x.d.dutyDate, status: 'Open', severity: x.severity, summary: x.summary, suggestion: x.suggestion,
        createdAt: cur ? cur.createdAt : Clock.now(), updatedAt: cur && cur.status === 'Open' && cur.summary === x.summary ? cur.updatedAt : Clock.now(), resolvedBy: '', resolvedAt: '', resolution: '' });
    });
    et.rows().forEach(function (x) { if (set[x.staffId] && x.dutyDate >= fromIso && x.status === 'Open' && !seen[x.exceptionId]) et.put({ exceptionId: x.exceptionId, status: 'AutoClosed', resolution: 'Cause no longer present', resolvedAt: Clock.now(), updatedAt: Clock.now() }); });
    et.flush();
    return { staff: staffIds.length, duties: allDuties.length, exceptions: allExc.length, rowsWritten: written };
  }

  /** Every 5 minutes: picks up new punches (by row count per yearly tab) and re-checks open duties. */
  function processNew() {
    return withLock(function () {
      var p = props(), today = Clock.today(), staff = {}, minIso = null, cursors = {};
      yearsBetween(OSC.addDays(today, -40), today).forEach(function (y) {
        var t = punchTable(y), sh = Db.ss().getSheetByName(t);
        if (!sh) return;
        var done = parseInt(p.getProperty('PUNCH_DONE_' + y) || '0', 10), last = sh.getLastRow() - 1;
        if (last <= done) return;
        var h = Db.headers(t), iS = h.indexOf('staffId'), iA = h.indexOf('at');
        sh.getRange(done + 2, 1, last - done, h.length).getValues().forEach(function (r) {
          staff[r[iS]] = 1; var a = String(Db.fromCell('datetime', r[iA])).slice(0, 10); if (!minIso || a < minIso) minIso = a;
        });
        cursors[y] = last;
      });
      // open duties that may have crossed the 13 h / 24 h marks
      var t2 = dutyTable(today.slice(0, 4));
      if (Db.ss().getSheetByName(t2)) BlockTable(t2, 600).rows().forEach(function (d) { if (d.status === 'Open') { staff[d.staffId] = 1; if (!minIso || d.dutyDate < minIso) minIso = d.dutyDate; } });
      var ids = Object.keys(staff).filter(Boolean);
      var res = ids.length ? recompute(ids, OSC.addDays(minIso, -1)) : { staff: 0 };
      Object.keys(cursors).forEach(function (y) { p.setProperty('PUNCH_DONE_' + y, String(cursors[y])); });
      p.setProperty('DUTIES_LAST_RUN', Clock.now());
      return res;
    }, 5000, function () { return { skipped: 'busy' }; });
  }
  /** Full recalculation for everyone from a date (after a rule change or an import). */
  function rebuild(fromIso) {
    var ids = Db.all('Staff').map(function (s) { return s.staffId; });
    return withLock(function () { return recompute(ids, fromIso); }, 20000, function () { fail('BUSY', 'Processing is running. Try again in a minute.'); });
  }

  /** Read duties for a date range, with names and per-person per-date split. */
  function list(fromIso, toIso, filter) {
    var staff = {}; Db.all('Staff').forEach(function (s) { staff[s.staffId] = s; });
    var rows = [];
    yearsBetween(fromIso, toIso).forEach(function (y) {
      var t = dutyTable(y);
      if (!Db.ss().getSheetByName(t)) return;
      BlockTable(t, 4000, fromIso, 'dutyDate', toIso).rows().forEach(function (d) {
        if (d.status === 'Void' || d.dutyDate < fromIso || d.dutyDate > toIso) return;
        if (filter.staffId && d.staffId !== filter.staffId) return;
        if (filter.deptCode && d.deptCode !== filter.deptCode) return;
        var s = staff[d.staffId] || {};
        d.name = s.title ? s.title + ' ' + s.fullName : d.staffId;
        rows.push(d);
      });
    });
    var dec = decisions(), groups = {};
    rows.forEach(function (d) { (groups[d.staffId + ':' + d.dutyDate] = groups[d.staffId + ':' + d.dutyDate] || []).push(d); });
    var days = Object.keys(groups).map(function (k) {
      var list = groups[k], R = RuleVersions.forDate(list[0].dutyDate, list[0].deptCode).rules;
      var total = OSCRules.r2(list.reduce(function (a, d) { return a + (Number(d.finalHours) || 0); }, 0)), sp = OSCRules.split(total, R);
      var ad = dec['APPROVE:' + k], approved = !R.over12NeedsApproval || !!(ad && (ad.value || {}).approved !== false);
      return { key: k, staffId: list[0].staffId, name: list[0].name, dutyDate: list[0].dutyDate, deptCode: list[0].deptCode, total: total, h8: sp.h8, h4: sp.h4, dd: sp.dd,
        pending: approved || ad ? 0 : sp.dd, rejected: ad && !approved ? sp.dd : 0, billable: OSCRules.r2(total - (approved ? 0 : sp.dd)), open: list.some(function (d) { return d.status !== 'Closed'; }) };
    });
    return { duties: rows, days: days, lastRun: props().getProperty('DUTIES_LAST_RUN') || '' };
  }

  /** Impact preview of proposed rules on recent duties, without saving anything. */
  function preview(params, fromIso, toIso) {
    var n = OSCRules.normalise(params || {});
    if (!n.ok) failFields(n.errors);
    var cur = list(fromIso, toIso, {});
    var changes = [];
    cur.duties.forEach(function (d) {
      if (!d.inAt || !d.outAt) return;
      var nd = OSCRules.computeDuty(Date.parse(d.inAt), Date.parse(d.outAt), n.rules);
      if (nd.hours !== d.systemHours) changes.push({ dutyId: d.dutyId, staffId: d.staffId, name: d.name, dutyDate: d.dutyDate, inAt: d.inAt, outAt: d.outAt, before: d.systemHours, after: nd.hours });
    });
    var sum = function (a, k) { return OSCRules.r2(a.reduce(function (s, x) { return s + (Number(x[k]) || 0); }, 0)); };
    return { duties: cur.duties.length, changed: changes.length, hoursBefore: sum(changes, 'before'), hoursAfter: sum(changes, 'after'), sample: changes.slice(0, 50) };
  }
  function exceptions(status) {
    var staff = {}; Db.all('Staff').forEach(function (s) { staff[s.staffId] = s; });
    return BlockTable('Exceptions', 3000).rows().filter(function (x) { return !status || status === 'All' || x.status === status; })
      .sort(function (a, b) { return a.dutyDate < b.dutyDate ? 1 : -1; }).slice(0, 500)
      .map(function (x) { var s = staff[x.staffId] || {}; x.name = s.title ? s.title + ' ' + s.fullName : x.staffId; return x; });
  }
  return { recompute: recompute, processNew: processNew, rebuild: rebuild, list: list, preview: preview, exceptions: exceptions, buildForStaff: buildForStaff, loadPunches: loadPunches };
})();

/* ---------- maintenance (the 5-minute trigger lives in 14_jobs.js) ---------- */
function recalcThisMonth() {
  var from = Clock.today().slice(0, 8) + '01';
  var r = DutyEngine.rebuild(from);
  showResult_('Duties recalculated', 'From ' + OSC.fmtDate(from) + ': ' + r.duties + ' duties for ' + r.staff + ' staff, ' + r.exceptions + ' items need attention.');
}

/* ---------- routes ---------- */
ROUTES['duties.list'] = ['APP', function (u, d) {
  var from = OSC.parseDate(d.from) || Clock.today(), to = OSC.parseDate(d.to) || from;
  if (to < from) failFields({ to: 'End date is before start date' });
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 62) failFields({ to: 'Choose at most 62 days' });
  return DutyEngine.list(from, to, { staffId: d.staffId, deptCode: d.deptCode });
}];
ROUTES['duties.processNow'] = ['APP', function () { return DutyEngine.processNew(); }];
ROUTES['duties.rebuild'] = ['ADMIN', function (u, d) {
  var reason = requireReason(d.reason), from = OSC.parseDate(d.from);
  if (!from) failFields({ from: 'Enter a date' });
  if ((Date.parse(Clock.today()) - Date.parse(from)) / 86400000 > 62) failFields({ from: 'At most 62 days back. Locked months are never changed.' });
  var r = DutyEngine.rebuild(from);
  Audit.log(u, 'duties.rebuild', 'Duties', from, reason, null, r);
  return r;
}];
ROUTES['rules.list'] = ['APP', function () { return { versions: RuleVersions.list(), defaults: OSCRules.DEFAULTS, current: RuleVersions.forDate(Clock.today(), 'ALL') }; }];
ROUTES['rules.add'] = ['ADMIN', function (u, d) { return RuleVersions.add(u, d); }];
ROUTES['rules.preview'] = ['ADMIN', function (u, d) {
  var to = Clock.today(), from = OSC.parseDate(d.from) || OSC.addDays(to, -30);
  return DutyEngine.preview(d.params, from, to);
}];
ROUTES['exceptions.list'] = ['APP', function (u, d) { return DutyEngine.exceptions(d.status || 'Open'); }];

// tablet: show rule-based hours on the OUT screen
(function () {
  var base = Kiosk.config;
  Kiosk.config = function () { var c = base(); c.rules = RuleVersions.forDate(Clock.today(), 'ALL').rules; return c; };
})();
