/* ===== 11 Ops manager actions (fix exceptions, decisions, penalties, deductions) and the dashboard ===== */
SCHEMA.Penalties = { key: 'penaltyId', cols: [['penaltyId', 'str'], ['date', 'date'], ['deptCode', 'str'], ['staffId', 'str'], ['companyId', 'str'], ['reason', 'str'], ['amount', 'num'], ['status', 'str'], ['createdAt', 'datetime'], ['createdBy', 'str'], ['voidReason', 'str']] };
SCHEMA.Deductions = { key: 'deductionId', cols: [['deductionId', 'str'], ['date', 'date'], ['staffId', 'str'], ['deptCode', 'str'], ['hours', 'num'], ['reason', 'str'], ['status', 'str'], ['createdAt', 'datetime'], ['createdBy', 'str'], ['voidReason', 'str']] };
CACHED_TABLES.push('Penalties', 'Deductions');
var REASON_CODES = ['Hospital requirement', 'Emergency', 'Transport problem', 'Tablet fault', 'Forgot to punch', 'Other'];

var Actions = (function () {
  function reasonOf(d) {
    var code = OSC.cleanText(d.reasonCode);
    if (REASON_CODES.indexOf(code) < 0) failFields({ reasonCode: 'Choose a reason' });
    var note = OSC.cleanText(d.note, 300);
    if (note.length < 3) failFields({ note: 'Write a short note (at least 3 characters)' });
    return { code: code, note: note, text: code + ': ' + note };
  }
  function staffOf(id) { var s = Db.find('Staff', id); if (!s) fail('NOT_FOUND', 'Staff ' + id + ' not found'); return s; }
  function assertOpen(deptCode, iso, field) {
    if (MonthLocks.isLocked(deptCode, iso.slice(0, 7))) { var f = {}; f[field || 'note'] = OSC.fmtMonth(iso.slice(0, 7)) + ' is locked. Ask the Admin to unlock it first.'; failFields(f); }
  }
  function findDuty(dutyId, dutyDate) {
    var t = dutyTable(String(dutyDate || Clock.today()).slice(0, 4));
    var d = Db.ss().getSheetByName(t) ? BlockTable(t, 5000, dutyDate, 'dutyDate').get(dutyId) : null;
    if (!d) fail('NOT_FOUND', 'Duty not found. It may have changed; refresh the page.');
    return d;
  }
  function markResolved(ids, user, text, minDate) {
    var et = BlockTable('Exceptions', 5000, minDate ? OSC.addDays(minDate, -2) : null, 'dutyDate');
    ids.forEach(function (id) { if (et.get(id)) et.put({ exceptionId: id, status: 'Resolved', resolvedBy: user.username, resolvedAt: Clock.now(), resolution: clip(text, 300), updatedAt: Clock.now() }); });
    et.flush();
  }
  function refresh(staffId, iso) { return DutyEngine.recompute([staffId], OSC.addDays(iso, -1)); }

  /** A manual punch is a new row (deviceId MANUAL) with the reason; tablet punches are never edited. */
  function addManualPunch(user, staffId, type, atIso, reasonText) {
    var atMs = Date.parse(atIso);
    if (!isFinite(atMs)) failFields({ at: 'Enter a valid date and time' });
    if (atMs > Clock.nowMs() + 60000) failFields({ at: 'Cannot be in the future' });
    var at = OSC.nowISTString(atMs), year = at.slice(0, 4), t = punchTable(year);
    if (!Db.ss().getSheetByName(t)) Db.ensureTable(t);
    var near = Db.tail(t, 4000).filter(function (p) { return p.staffId === staffId && p.status === 'Accepted' && Math.abs(Date.parse(p.at) - atMs) < 3 * 60000 && p.type === type; });
    if (near.length) failFields({ at: 'There is already a ' + type + ' at ' + OSC.fmtDateTime(near[0].at) });
    var id = Utilities.getUuid().toLowerCase();
    Db.append(t, { punchId: id, staffId: staffId, type: type, at: at, deviceTime: '', receivedAt: Clock.now(), deviceId: 'MANUAL', distance: '', liveness: 'manual', offline: false, status: 'Accepted', photoFileId: '', note: clip('By ' + user.username + ' · ' + reasonText, 300) });
    return id;
  }
  function wrap(user, staffId, iso, action, entityId, reason, after, excIds, work) {
    var s = staffOf(staffId);
    assertOpen(s.deptCode, iso);
    // the change, the recalculation and the exception update happen together under one lock
    var out = withLock(function () {
      var o = work();
      refresh(staffId, iso);
      if (excIds && excIds.length) markResolved(excIds, user, reason, iso);
      return o;
    });
    Audit.log(user, action, 'Duties', entityId, reason, null, after);
    return out || { done: true };
  }

  // ----- fix punches -----
  function setOut(user, d) {
    var r = reasonOf(d), duty = findDuty(d.dutyId, d.dutyDate);
    if (!duty.inAt || duty.outAt) fail('VALIDATION', 'This duty already has an OUT');
    var outMs = Date.parse(d.at);
    if (!(outMs > Date.parse(duty.inAt))) failFields({ at: 'OUT must be after the IN (' + OSC.fmtDateTime(duty.inAt) + ')' });
    if (outMs - Date.parse(duty.inAt) > 72 * 3600000) failFields({ at: 'More than 72 hours after the IN. Check the date.' });
    return wrap(user, duty.staffId, duty.dutyDate, 'exception.setOut', duty.dutyId, r.text, { outAt: d.at }, ['MISSING_OUT:' + duty.dutyId],
      function () { return { punchId: addManualPunch(user, duty.staffId, 'OUT', d.at, r.text) }; });
  }
  function addIn(user, d) {
    var r = reasonOf(d), duty = findDuty(d.dutyId, d.dutyDate);
    if (duty.inAt || !duty.outAt) fail('VALIDATION', 'This duty already has an IN');
    var inMs = Date.parse(d.at), outMs = Date.parse(duty.outAt);
    if (!(inMs < outMs)) failFields({ at: 'IN must be before the OUT (' + OSC.fmtDateTime(duty.outAt) + ')' });
    if (outMs - inMs > 72 * 3600000) failFields({ at: 'More than 72 hours before the OUT. Check the date.' });
    var date = OSC.todayIST(inMs);
    return wrap(user, duty.staffId, date < duty.dutyDate ? date : duty.dutyDate, 'exception.addIn', duty.dutyId, r.text, { inAt: d.at }, ['MISSING_IN:' + duty.dutyId],
      function () { return { punchId: addManualPunch(user, duty.staffId, 'IN', d.at, r.text) }; });
  }
  /** Splits one long duty into two at a time: a manual OUT and a manual IN at the same minute. */
  function split(user, d) {
    var r = reasonOf(d), duty = findDuty(d.dutyId, d.dutyDate);
    if (duty.status !== 'Closed') fail('VALIDATION', 'Only a complete duty (IN and OUT) can be split');
    var at = Date.parse(d.at);
    if (!(at > Date.parse(duty.inAt) + 3600000 && at < Date.parse(duty.outAt) - 3600000)) failFields({ at: 'Choose a time at least 1 hour after the IN and 1 hour before the OUT' });
    return wrap(user, duty.staffId, duty.dutyDate, 'exception.split', duty.dutyId, r.text, { splitAt: d.at }, [], function () {
      addManualPunch(user, duty.staffId, 'OUT', d.at, 'Split · ' + r.text);
      addManualPunch(user, duty.staffId, 'IN', d.at, 'Split · ' + r.text);
    });
  }
  /** Assigns an unrecognised photo to a person as a punch at the photo's time. */
  function assignUnrecognised(user, d) {
    var r = reasonOf(d), u = Db.find('UnrecognisedFaces', d.unrecId);
    if (!u) fail('NOT_FOUND', 'Photo not found');
    if (u.status !== 'Open') fail('VALIDATION', 'This photo is already ' + u.status.toLowerCase());
    var s = staffOf(d.staffId);
    if (s.status !== 'Active') failFields({ staffId: 'This person is not active' });
    if (['IN', 'OUT'].indexOf(d.type) < 0) failFields({ type: 'Choose IN or OUT' });
    return wrap(user, s.staffId, u.at.slice(0, 10), 'unrecognised.assign', u.unrecId, r.text, { staffId: s.staffId, type: d.type }, [], function () {
      var id = addManualPunch(user, s.staffId, d.type, u.at, 'From unrecognised photo · ' + r.text);
      Db.update('UnrecognisedFaces', u.unrecId, { status: 'Assigned', resolvedBy: user.username, resolvedAt: Clock.now(), note: s.staffId + ' ' + d.type + ' · ' + r.text });
      return { punchId: id };
    });
  }

  // ----- decisions -----
  function decide(user, key, kind, staffId, date, value, r, excIds) {
    return wrap(user, staffId, date, 'decision.' + kind.toLowerCase(), key, r.text, value, excIds, function () {
      var rec = { decisionKey: key, kind: kind, staffId: staffId, dutyDate: date, value: value, reasonCode: r.code, note: r.note, status: 'Active', by: user.username, at: Clock.now() };
      if (Db.find('DutyDecisions', key)) Db.update('DutyDecisions', key, rec); else Db.insert('DutyDecisions', rec);
    });
  }
  function approve(user, d) {
    var r = reasonOf(d), s = staffOf(d.staffId), date = OSC.parseDate(d.date);
    if (!date) failFields({ date: 'Date missing' });
    var all = d.approve !== false && d.approve !== 'false';
    return decide(user, 'APPROVE:' + s.staffId + ':' + date, 'APPROVE', s.staffId, date, { approved: all }, r, ['LONG_DUTY:' + s.staffId + ':' + date]);
  }
  function grace(user, d) {
    var r = reasonOf(d), duty = findDuty(d.dutyId, d.dutyDate);
    if (!duty.lateGrace) fail('VALIDATION', 'This duty has no grace decision');
    var choice = d.choice === 'grace' ? 'grace' : 'strict';
    return decide(user, 'GRACE:' + duty.dutyId, 'GRACE', duty.staffId, duty.dutyDate, { choice: choice }, r, ['LATE_GRACE:' + duty.dutyId]);
  }
  function override(user, d) {
    var r = reasonOf(d), duty = findDuty(d.dutyId, d.dutyDate), h = Number(d.hours);
    if (!(h >= 0 && h <= 72) || Math.round(h * 100) !== h * 100) failFields({ hours: 'Hours between 0 and 72, at most 2 decimals' });
    if (!duty.inAt || !duty.outAt) fail('VALIDATION', 'Fix the missing IN or OUT first');
    return decide(user, 'FINAL:' + duty.dutyId, 'FINAL', duty.staffId, duty.dutyDate, { hours: h, systemHours: duty.systemHours }, r, ['SHORT_DUTY:' + duty.staffId + ':' + duty.dutyDate, 'LATE_GRACE:' + duty.dutyId]);
  }
  function shift(user, d) {
    var r = reasonOf(d), duty = findDuty(d.dutyId, d.dutyDate);
    if (['Day', 'Night'].indexOf(d.shift) < 0) failFields({ shift: 'Choose Day or Night' });
    return decide(user, 'SHIFT:' + duty.dutyId, 'SHIFT', duty.staffId, duty.dutyDate, { shift: d.shift }, r, []);
  }
  function reviewShort(user, d) {
    var r = reasonOf(d), s = staffOf(d.staffId), date = OSC.parseDate(d.date);
    return decide(user, 'REVIEW:SHORT_DUTY:' + s.staffId + ':' + date, 'REVIEW', s.staffId, date, { reviewed: true }, r, ['SHORT_DUTY:' + s.staffId + ':' + date]);
  }
  function revoke(user, d) {
    var reason = requireReason(d.reason), dec = Db.find('DutyDecisions', d.decisionKey);
    if (!dec || dec.status === 'Revoked') fail('NOT_FOUND', 'Decision not found');
    var subj = dec.decisionKey.split(':').slice(1).join(':'), ids = { APPROVE: ['LONG_DUTY:' + subj], GRACE: ['LATE_GRACE:' + subj], REVIEW: ['SHORT_DUTY:' + dec.staffId + ':' + dec.dutyDate], FINAL: ['SHORT_DUTY:' + dec.staffId + ':' + dec.dutyDate, 'LATE_GRACE:' + subj] }[dec.kind] || [];
    return wrap(user, dec.staffId, dec.dutyDate, 'decision.revoke', dec.decisionKey, reason, null, [], function () {
      Db.update('DutyDecisions', dec.decisionKey, { status: 'Revoked', note: dec.note + ' · revoked: ' + reason, at: Clock.now(), by: user.username });
      // reopen what the decision had closed; the recalculation then keeps or auto-closes it
      var et = BlockTable('Exceptions', 5000, OSC.addDays(dec.dutyDate, -2), 'dutyDate');
      ids.forEach(function (id) { if (et.get(id)) et.put({ exceptionId: id, status: 'Open', resolvedBy: '', resolvedAt: '', resolution: '' }); });
      et.flush();
    });
  }
  function decisionsFor(staffId, date) {
    return Db.where('DutyDecisions', function (x) { return x.staffId === staffId && (!date || x.dutyDate === date); }).map(function (x) { delete x._row; return x; });
  }

  // ----- penalties and deductions -----
  function addPenalty(user, d) {
    var e = {}, date = OSC.parseDate(d.date), amount = Number(d.amount), reason = OSC.cleanText(d.reason, 200);
    var dept = OSC.cleanText(d.deptCode).toUpperCase(), staffId = OSC.cleanText(d.staffId), s = staffId ? Db.find('Staff', staffId) : null;
    if (!date) e.date = 'Enter the date';
    else if (date > Clock.today()) e.date = 'Cannot be in the future';
    if (staffId && !s) e.staffId = 'Unknown employee';
    if (s) dept = s.deptCode;
    if (!Db.find('Departments', dept)) e.deptCode = 'Choose the department';
    if (!(amount > 0 && amount <= 1000000) || Math.round(amount * 100) !== amount * 100) e.amount = 'Enter the amount in rupees';
    if (reason.length < 3) e.reason = 'Enter the reason (it is printed on the bill)';
    if (Object.keys(e).length) failFields(e);
    assertOpen(dept, date, 'date');
    var company = s ? (Staff.valueOn(s.staffId, 'company', date) || s.companyId) : OSC.cleanText(d.companyId);
    if (!s) { var cos = Db.where('Companies', function (c) { return toList(c.deptCodes).indexOf(dept) >= 0 && c.status === 'Active'; }); if (!company) company = cos.length === 1 ? cos[0].companyId : ''; if (!company) failFields({ companyId: 'Choose the company to charge' }); }
    var rec = { penaltyId: newId('PN'), date: date, deptCode: dept, staffId: s ? s.staffId : '', companyId: company, reason: reason, amount: amount, status: 'Active', createdAt: Clock.now(), createdBy: user.username, voidReason: '' };
    withLock(function () { Db.insert('Penalties', rec); });
    Audit.log(user, 'penalty.add', 'Penalties', rec.penaltyId, reason, null, rec);
    return rec;
  }
  function addDeduction(user, d) {
    var e = {}, date = OSC.parseDate(d.date), hours = Number(d.hours), reason = OSC.cleanText(d.reason, 200), s = Db.find('Staff', OSC.cleanText(d.staffId));
    if (!date) e.date = 'Enter the date'; else if (date > Clock.today()) e.date = 'Cannot be in the future';
    if (!s) e.staffId = 'Choose the employee';
    if (!(hours > 0 && hours <= 72) || Math.round(hours * 100) !== hours * 100) e.hours = 'Hours between 0.01 and 72';
    if (reason.length < 3) e.reason = 'Enter the reason';
    if (Object.keys(e).length) failFields(e);
    var dept = Staff.valueOn(s.staffId, 'department', date) || s.deptCode;
    assertOpen(dept, date, 'date');
    var rec = { deductionId: newId('DD'), date: date, staffId: s.staffId, deptCode: dept, hours: hours, reason: reason, status: 'Active', createdAt: Clock.now(), createdBy: user.username, voidReason: '' };
    withLock(function () { Db.insert('Deductions', rec); });
    Audit.log(user, 'deduction.add', 'Deductions', rec.deductionId, reason, null, rec);
    return rec;
  }
  function voidRow(user, table, id, reason) {
    reason = requireReason(reason);
    var row = Db.find(table, id);
    if (!row || row.status !== 'Active') fail('NOT_FOUND', 'Not found or already cancelled');
    assertOpen(row.deptCode, row.date);
    withLock(function () { Db.update(table, id, { status: 'Void', voidReason: reason }); });
    Audit.log(user, table.toLowerCase() + '.void', table, id, reason, { status: 'Active' }, { status: 'Void' });
    return { done: true };
  }
  function listMonth(table, ym) {
    var staff = {}; Db.all('Staff').forEach(function (s) { staff[s.staffId] = s; });
    return Db.where(table, function (r) { return r.date.slice(0, 7) === ym; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .map(function (r) { delete r._row; var s = staff[r.staffId]; r.name = s ? s.title + ' ' + s.fullName : ''; return r; });
  }
  return { setOut: setOut, addIn: addIn, split: split, assignUnrecognised: assignUnrecognised, approve: approve, grace: grace, override: override, shift: shift,
    reviewShort: reviewShort, revoke: revoke, decisionsFor: decisionsFor, addPenalty: addPenalty, addDeduction: addDeduction, voidRow: voidRow, listMonth: listMonth };
})();

/* ---------- dashboard ---------- */
var Dashboard = (function () {
  function build() {
    var now = Clock.nowMs(), today = Clock.today(), ym = today.slice(0, 7), first = ym + '-01';
    var hourIst = new Date(now + 19800000).getUTCHours(), shiftNow = hourIst >= 8 && hourIst < 20 ? 'Day' : 'Night';
    var depts = Departments.list().filter(function (d) { return d.active; });
    var staff = Db.all('Staff'), byId = {}; staff.forEach(function (s) { byId[s.staffId] = s; });
    var from = OSC.addDays(today, -30) < first ? OSC.addDays(today, -30) : first;
    var L = DutyEngine.list(from, today, {});
    // on duty now = open duties
    var open = L.duties.filter(function (d) { return d.status === 'Open'; }).map(function (d) {
      var hrs = (now - Date.parse(d.inAt)) / 3600000;
      return { dutyId: d.dutyId, staffId: d.staffId, name: d.name, deptCode: d.deptCode, shift: d.shift, inAt: d.inAt, hours: Math.round(hrs * 100) / 100, flag: OSCRules.openFlag(hrs, RuleVersions.forDate(today, d.deptCode).rules) };
    }).sort(function (a, b) { return b.hours - a.hours; });
    var deptCards = depts.map(function (dp) {
      var mine = open.filter(function (o) { return o.deptCode === dp.code; });
      var req = shiftNow === 'Day' ? dp.reqDay : dp.reqNight;
      var dayToday = {}, nightLast = {};
      L.duties.forEach(function (d) { if (d.deptCode !== dp.code) return; if (d.dutyDate === today && d.shift === 'Day') dayToday[d.staffId] = 1; if ((d.dutyDate === OSC.addDays(today, -1) || d.dutyDate === today) && d.shift === 'Night') nightLast[d.staffId] = 1; });
      return { code: dp.code, name: dp.name, onDuty: mine.length, required: req, shortage: Math.max(0, req - mine.length), reqDay: dp.reqDay, reqNight: dp.reqNight,
        dayCount: Object.keys(dayToday).length, nightCount: Object.keys(nightLast).length,
        active: staff.filter(function (s) { return s.status === 'Active' && s.deptCode === dp.code; }).length };
    });
    // month so far
    var month = { duties: {}, doubleHours: 0, pendingHours: 0, estimate: 0, gst: 0 };
    var rateOf = {}; L.duties.forEach(function (d) { rateOf[d.staffId + ':' + d.dutyDate] = d; });
    L.days.forEach(function (x) {
      if (x.dutyDate < first) return;
      var d = rateOf[x.key] || {};
      month.duties[x.deptCode] = OSCRules.r2((month.duties[x.deptCode] || 0) + x.billable / 12);
      month.doubleHours += x.dd; month.pendingHours += x.pending;
      var amt = (x.billable / 12) * (Number(d.ratePerDuty) || 0);
      month.estimate += amt; month.gst += amt * (Number(d.gstPct) || 0) / 100;
    });
    var pens = Db.where('Penalties', function (p) { return p.status === 'Active' && p.date.slice(0, 7) === ym; });
    var deds = Db.where('Deductions', function (p) { return p.status === 'Active' && p.date.slice(0, 7) === ym; });
    month.penalties = pens.reduce(function (a, p) { return a + p.amount; }, 0);
    month.deductionHours = OSCRules.r2(deds.reduce(function (a, p) { return a + p.hours; }, 0));
    deds.forEach(function (x) { var d = rateOf[x.staffId + ':' + x.date] || {}; var amt = (x.hours / 12) * (Number(d.ratePerDuty) || 0); month.estimate -= amt; month.gst -= amt * (Number(d.gstPct) || 0) / 100; });
    // deductions reduce billable duties; penalties reduce the taxable amount (GST after penalties, as in the sample bill)
    month.estimate = OSCRules.r2(month.estimate);
    month.estimateNet = OSCRules.r2((month.estimate - month.penalties) * (1 + (month.estimate ? month.gst / month.estimate : 0.18)));
    month.doubleHours = OSCRules.r2(month.doubleHours); month.pendingHours = OSCRules.r2(month.pendingHours);
    // 30-day trend: people with a duty per date
    var trend = []; for (var i = 29; i >= 0; i--) { var dt = OSC.addDays(today, -i), set = {}; L.duties.forEach(function (d) { if (d.dutyDate === dt) set[d.staffId] = 1; }); trend.push({ date: dt, people: Object.keys(set).length }); }
    var exc = DutyEngine.exceptions('Open'), counts = {};
    exc.forEach(function (x) { counts[x.type] = (counts[x.type] || 0) + 1; });
    counts.UNRECOGNISED = Db.where('UnrecognisedFaces', function (u) { return u.status === 'Open'; }).length;
    var byCo = {}; staff.forEach(function (s) { if (s.status !== 'Active') return; var k = s.deptCode + '|' + s.companyId; byCo[k] = (byCo[k] || 0) + 1; });
    var cos = {}; Db.all('Companies').forEach(function (c) { cos[c.companyId] = c.name; });
    var feed = Kiosk.recentPunches(today).sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 15);
    return {
      now: Clock.now(), shiftNow: shiftNow, onDuty: open.length, required: deptCards.reduce(function (a, d) { return a + d.required; }, 0), open: open, depts: deptCards,
      dayToday: deptCards.reduce(function (a, d) { return a + d.dayCount; }, 0), nightLast: deptCards.reduce(function (a, d) { return a + d.nightCount; }, 0),
      attention: counts, attentionTotal: Object.keys(counts).reduce(function (a, k) { return a + counts[k]; }, 0), tablets: Devices.list().filter(function (d) { return d.active; }),
      month: month, trend: trend, feed: feed, lastRun: L.lastRun,
      staffBy: Object.keys(byCo).map(function (k) { var p = k.split('|'); return { deptCode: p[0], company: cos[p[1]] || p[1], count: byCo[k] }; }),
      joiners: staff.filter(function (s) { return s.joinDate.slice(0, 7) === ym; }).length, exits: staff.filter(function (s) { return (s.exitDate || '').slice(0, 7) === ym; }).length
    };
  }
  return { build: build };
})();

/* ---------- routes ---------- */
ROUTES['dashboard'] = ['APP', function () { return Dashboard.build(); }];
ROUTES['meta.reasonCodes'] = ['APP', function () { return REASON_CODES; }];
ROUTES['fix.setOut'] = ['APP', function (u, d) { return Actions.setOut(u, d); }];
ROUTES['fix.addIn'] = ['APP', function (u, d) { return Actions.addIn(u, d); }];
ROUTES['fix.split'] = ['APP', function (u, d) { return Actions.split(u, d); }];
ROUTES['fix.assignUnrecognised'] = ['APP', function (u, d) { return Actions.assignUnrecognised(u, d); }];
ROUTES['decide.approve'] = ['APP', function (u, d) { return Actions.approve(u, d); }];
ROUTES['decide.grace'] = ['APP', function (u, d) { return Actions.grace(u, d); }];
ROUTES['decide.override'] = ['APP', function (u, d) { return Actions.override(u, d); }];
ROUTES['decide.shift'] = ['APP', function (u, d) { return Actions.shift(u, d); }];
ROUTES['decide.reviewShort'] = ['APP', function (u, d) { return Actions.reviewShort(u, d); }];
ROUTES['decide.revoke'] = ['APP', function (u, d) { return Actions.revoke(u, d); }];
ROUTES['decide.list'] = ['APP', function (u, d) { return Actions.decisionsFor(d.staffId, d.date); }];
ROUTES['penalties.add'] = ['APP', function (u, d) { return Actions.addPenalty(u, d); }];
ROUTES['penalties.list'] = ['APP', function (u, d) { return Actions.listMonth('Penalties', d.month || Clock.today().slice(0, 7)); }];
ROUTES['penalties.void'] = ['APP', function (u, d) { return Actions.voidRow(u, 'Penalties', d.penaltyId, d.reason); }];
ROUTES['deductions.add'] = ['APP', function (u, d) { return Actions.addDeduction(u, d); }];
ROUTES['deductions.list'] = ['APP', function (u, d) { return Actions.listMonth('Deductions', d.month || Clock.today().slice(0, 7)); }];
ROUTES['deductions.void'] = ['APP', function (u, d) { return Actions.voidRow(u, 'Deductions', d.deductionId, d.reason); }];
