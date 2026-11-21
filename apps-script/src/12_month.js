/* ===== 12 Month end: bill model, Excel pack, bill PDF, month lock / unlock, company comparison, what-if ===== */
SCHEMA.Bills = { key: 'billId', cols: [['billId', 'str'], ['billNo', 'str'], ['month', 'str'], ['deptCode', 'str'], ['companyId', 'str'], ['revision', 'num'], ['status', 'str'],
  ['duties', 'num'], ['hours', 'num'], ['deductionHours', 'num'], ['gross', 'num'], ['penalties', 'num'], ['taxable', 'num'], ['gst', 'num'], ['net', 'num'], ['roundOff', 'num'], ['payable', 'num'],
  ['lines', 'json'], ['xlsxFileId', 'str'], ['pdfFileId', 'str'], ['forced', 'str'], ['lockedAt', 'datetime'], ['lockedBy', 'str'], ['note', 'str']] };
CACHED_TABLES.push('Bills');

DEFAULT_SETTINGS.orgAddress = ['', 'str', 'Hospital address printed on bills'];
DEFAULT_SETTINGS.orgGstin = ['', 'str', 'Hospital GSTIN printed on bills (optional). Same state as the provider shows CGST + SGST'];
DEFAULT_SETTINGS.billPrefix = ['MAH-OSC', 'str', 'Bill number prefix: PREFIX/DEPT/YYYY-MM/COMPANY'];
DEFAULT_SETTINGS.billSignatures = ['Prepared by,Checked by,Approved by', 'list', 'Signature boxes on the bill PDF (comma separated, up to 4)'];

var MonthEnd = (function () {
  var LOCK_BLOCKING = ['MISSING_OUT', 'MISSING_IN', 'LATE_GRACE', 'LONG_DUTY'];
  var TYPE_TEXT = { MISSING_OUT: 'Missing OUT', MISSING_IN: 'Missing IN', LATE_GRACE: 'Late arrival waiting for grace decision', LONG_DUTY: 'Over 12 h waiting for approval' };

  function lastDay(ym) { return ym + '-' + OSC.pad(OSC.daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7)), 2); }
  function checkMonth(ym) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym || ''))) failFields({ month: 'Choose a month' });
    if (ym > Clock.today().slice(0, 7)) failFields({ month: 'This month has not started' });
    return ym;
  }
  function checkDept(code) { var d = Db.find('Departments', String(code || '').toUpperCase()); if (!d) failFields({ deptCode: 'Choose the department' }); return d; }

  /** Staff history lookups without re-reading the tab for every date. */
  function historyIndex() {
    var idx = {};
    Db.all('StaffHistory').forEach(function (h) { var k = h.staffId + '|' + h.field; (idx[k] = idx[k] || []).push(h); });
    return function (staffId, field, iso, fallback) {
      var list = idx[staffId + '|' + field] || [], hit = null;
      list.forEach(function (h) { if (h.effectiveFrom <= iso && (!h.effectiveTo || h.effectiveTo >= iso)) hit = h; });
      return hit ? hit.value : fallback;
    };
  }

  /** Everything the bill needs for one month + department, for every company that worked there. */
  function collect(ym, deptCode, preloaded) {
    var from = ym + '-01', to = lastDay(ym), dates = OSCBill.monthDates(ym), valueOn = historyIndex();
    var L = preloaded ? { duties: preloaded.duties.filter(function (d) { return d.deptCode === deptCode; }), days: preloaded.days.filter(function (x) { return x.deptCode === deptCode; }) }
      : DutyEngine.list(from, to, { deptCode: deptCode });
    var lastDuty = {};
    L.duties.forEach(function (d) { var k = d.staffId + ':' + d.dutyDate; if (!lastDuty[k] || d.inAt > lastDuty[k].inAt) lastDuty[k] = d; });
    var days = L.days.map(function (x) {
      var d = lastDuty[x.key] || {}, R = RuleVersions.forDate(x.dutyDate, deptCode).rules, sp = OSCRules.split(x.billable, R);
      return { staffId: x.staffId, date: x.dutyDate, h8: sp.h8, h4: sp.h4, dd: sp.dd, billable: x.billable, pending: x.pending, open: x.open,
        designation: d.designation || '', companyId: d.companyId || '', ratePerDuty: d.ratePerDuty, gstPct: d.gstPct };
    });
    // who belonged to this department (and which company) on each date
    var members = {};
    Db.all('Staff').forEach(function (s) {
      dates.forEach(function (iso) {
        if (s.joinDate > iso || (s.exitDate && s.exitDate < iso)) return;
        if (valueOn(s.staffId, 'department', iso, s.deptCode) !== deptCode) return;
        var co = valueOn(s.staffId, 'company', iso, s.companyId), k = co + '|' + s.staffId;
        if (!members[k]) members[k] = { staffId: s.staffId, title: s.title, fullName: s.fullName, designation: valueOn(s.staffId, 'designation', to, s.designation), companyId: co, dates: {} };
        members[k].dates[iso] = true;
      });
    });
    var deds = Db.where('Deductions', function (x) { return x.status === 'Active' && x.date.slice(0, 7) === ym && x.deptCode === deptCode; }).map(function (x) {
      var s = Db.find('Staff', x.staffId) || {};
      return { date: x.date, staffId: x.staffId, hours: x.hours, reason: x.reason, companyId: valueOn(x.staffId, 'company', x.date, s.companyId) };
    });
    var pens = Db.where('Penalties', function (x) { return x.status === 'Active' && x.date.slice(0, 7) === ym && x.deptCode === deptCode; }).map(function (x) {
      var s = x.staffId ? Db.find('Staff', x.staffId) : null;
      return { date: x.date, staffId: x.staffId, name: s ? s.title + ' ' + s.fullName : '', reason: x.reason, amount: x.amount, companyId: x.companyId };
    });
    var staffIds = {}; days.forEach(function (d) { staffIds[d.staffId] = 1; }); Object.keys(members).forEach(function (k) { staffIds[members[k].staffId] = 1; });
    var exc = Db.where('Exceptions', function (x) { return x.status === 'Open' && x.dutyDate && x.dutyDate.slice(0, 7) === ym && staffIds[x.staffId]; });
    var companies = {};
    days.forEach(function (d) { if (d.companyId) companies[d.companyId] = 1; });
    Object.keys(members).forEach(function (k) { if (members[k].companyId) companies[members[k].companyId] = 1; });
    pens.forEach(function (p) { if (p.companyId) companies[p.companyId] = 1; });
    return { ym: ym, deptCode: deptCode, from: from, to: to, days: days, members: members, deductions: deds, penalties: pens, exceptions: exc, companyIds: Object.keys(companies).sort() };
  }

  function billNo(ym, deptCode, company, revision) {
    return Settings.str('billPrefix') + '/' + deptCode + '/' + ym + '/' + (company.code || company.companyId) + (revision > 1 ? '-R' + (revision - 1) : '');
  }
  function revisionOf(ym, deptCode, companyId) { return Db.where('Bills', function (b) { return b.month === ym && b.deptCode === deptCode && b.companyId === companyId; }).length + 1; }

  /** Bill model for one company (OSCBill.build) from collected data. */
  function model(c, companyId, opts) {
    opts = opts || {};
    var dept = Db.find('Departments', c.deptCode), co = Companies.get(companyId) || { companyId: companyId, code: companyId, name: companyId || '(no company)' };
    var staffById = {}; Db.all('Staff').forEach(function (s) { staffById[s.staffId] = s; });
    var staff = Object.keys(c.members).map(function (k) { return c.members[k]; }).filter(function (m) { return m.companyId === companyId; });
    var days = c.days.filter(function (d) { return d.companyId === companyId; }).map(function (d) { var x = Object.assign({}, d); if (opts.reprice) opts.reprice(x); return x; });
    // a person with duties but no membership row (e.g. moved department mid-month) is still listed
    var listed = {}; staff.forEach(function (s) { listed[s.staffId] = 1; });
    days.forEach(function (d) { if (!listed[d.staffId]) { var s = staffById[d.staffId] || {}; listed[d.staffId] = 1; staff.push({ staffId: d.staffId, title: s.title, fullName: s.fullName || d.staffId, designation: d.designation, dates: {} }); } });
    var staffSet = {}; staff.forEach(function (s) { staffSet[s.staffId] = 1; });
    var blockers = [];
    if (c.to >= Clock.today()) blockers.push({ type: 'MONTH_OPEN', text: OSC.fmtMonth(c.ym) + ' is not over yet (bills can be locked from ' + OSC.fmtDate(OSC.addDays(c.to, 1)) + ')' });
    var openByType = {};
    c.exceptions.forEach(function (x) { if (staffSet[x.staffId] && LOCK_BLOCKING.indexOf(x.type) >= 0) openByType[x.type] = (openByType[x.type] || 0) + 1; });
    Object.keys(openByType).forEach(function (t) { blockers.push({ type: 'EXC_' + t, text: openByType[t] + ' × ' + TYPE_TEXT[t] + ' still open on the Exceptions page' }); });
    var input = {
      ym: c.ym, dept: { code: c.deptCode, name: dept ? dept.name : c.deptCode }, company: co, staff: staff, days: days,
      deductions: c.deductions.filter(function (x) { return x.companyId === companyId; }),
      penalties: opts.noPenalties ? [] : c.penalties.filter(function (p) { return p.companyId === companyId; }),
      org: { name: Settings.str('orgName'), address: Settings.str('orgAddress'), gstin: Settings.str('orgGstin') },
      billNo: opts.billNo || '', status: opts.status || 'DRAFT', generatedAt: Clock.now(), generatedBy: opts.by || '', version: APP.version,
      signatures: Settings.list('billSignatures'), footer: Settings.str('footerText'), blockers: blockers, dutyHours: 12
    };
    var m = OSCBill.build(input);
    var shortOpen = c.exceptions.filter(function (x) { return staffSet[x.staffId] && x.type === 'SHORT_DUTY'; }).length;
    if (shortOpen) m.warnings.push(shortOpen + ' short duties (under 12 h) not yet reviewed');
    return m;
  }
  function slim(m) {
    var o = {}; Object.keys(m).forEach(function (k) { if (k !== 'grid' && k !== 'summary' && k !== 'dates') o[k] = m[k]; });
    o.lines = m.lines.map(function (l) { return { key: l.key, label: l.label, designation: l.designation, rate: l.rate, gstPct: l.gstPct, h8: l.h8, h4: l.h4, dd: l.dd, total: l.total, dedH: l.dedH, netH: l.netH, duties: l.duties, amount: l.amount, people: l.people }; });
    o.people = m.grid.length;
    return o;
  }

  function lockRow(ym, deptCode) { return Db.where('MonthLocks', function (l) { return l.month === ym && l.deptCode === deptCode && l.status === 'LOCKED'; })[0] || null; }
  function finalBills(ym, deptCode) { return Db.where('Bills', function (b) { return b.month === ym && b.deptCode === deptCode && b.status === 'Final'; }); }

  /** Month overview for the console: every active department, its lock and each company's bill. */
  function status(ym) {
    checkMonth(ym);
    var all = DutyEngine.list(ym + '-01', lastDay(ym), {});
    var out = Departments.list().filter(function (d) { return d.active; }).map(function (d) {
      var lk = lockRow(ym, d.code), bills = finalBills(ym, d.code), c = collect(ym, d.code, all), cos = c.companyIds.slice();
      bills.forEach(function (b) { if (cos.indexOf(b.companyId) < 0) cos.push(b.companyId); });
      return {
        deptCode: d.code, deptName: d.name, locked: !!lk, lockedAt: lk ? lk.lockedAt : '', lockedBy: lk ? lk.lockedBy : '',
        companies: cos.map(function (cid) {
          var co = Companies.get(cid) || { name: cid, code: cid }, fb = bills.filter(function (b) { return b.companyId === cid; })[0];
          if (lk && fb) return { companyId: cid, companyName: co.name, billNo: fb.billNo, payable: fb.payable, duties: fb.duties, status: 'FINAL', ready: true, blockers: [], warnings: [], hasFiles: !!(fb.xlsxFileId && fb.pdfFileId) };
          var m = model(c, cid, {});
          return { companyId: cid, companyName: co.name, billNo: '', payable: m.payable, duties: m.hoursTotal.duties, status: 'DRAFT', ready: m.ready, blockers: m.blockers, warnings: m.warnings };
        })
      };
    });
    var history = Db.where('MonthLocks', function (l) { return l.month === ym; }).map(function (l) { delete l._row; return l; });
    return { month: ym, label: OSC.fmtMonth(ym), monthOver: lastDay(ym) < Clock.today(), departments: out, history: history };
  }

  function preview(ym, deptCode, companyId) {
    checkMonth(ym); checkDept(deptCode);
    var c = collect(ym, deptCode), lk = lockRow(ym, deptCode);
    var fb = lk ? finalBills(ym, deptCode).filter(function (b) { return b.companyId === companyId; })[0] : null;
    var m = model(c, companyId, { status: fb ? 'FINAL' : 'DRAFT', billNo: fb ? fb.billNo : '' });
    var o = slim(m); o.locked = !!lk; o.summary = m.summary; o.grid = undefined;
    return o;
  }

  // ---------- files ----------
  function packFolder(ym, kind) {
    var props = PropertiesService.getScriptProperties();
    var root = DriveApp.getFolderById(props.getProperty('DRIVE_MONTH_PACKS_ID'));
    var m = child(root, ym), k = child(m, kind);
    return k;
  }
  function child(folder, name) { var it = folder.getFoldersByName(name); return it.hasNext() ? it.next() : folder.createFolder(name); }
  function replaceFile(folder, blob) {
    var it = folder.getFilesByName(blob.getName());
    while (it.hasNext()) it.next().setTrashed(true);
    return folder.createFile(blob);
  }
  function signed(bytes) { return bytes.map(function (b) { return b > 127 ? b - 256 : b; }); }
  function blobs(m) {
    var base = OSCPack.fileBase(m);
    return {
      xlsx: Utilities.newBlob(signed(OSCPack.xlsx(m)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base + '.xlsx'),
      pdf: Utilities.newBlob(signed(OSCPack.pdf(m)), 'application/pdf', base + '_bill.pdf')
    };
  }
  /** Download for the console: locked months give the stored final files; open months a fresh draft. */
  function file(user, ym, deptCode, companyId, kind) {
    checkMonth(ym); checkDept(deptCode);
    if (['xlsx', 'pdf'].indexOf(kind) < 0) failFields({ kind: 'Choose Excel or PDF' });
    var lk = lockRow(ym, deptCode), fb = lk ? finalBills(ym, deptCode).filter(function (b) { return b.companyId === companyId; })[0] : null;
    var blob = null;
    if (fb && fb[kind + 'FileId']) { try { blob = DriveApp.getFileById(fb[kind + 'FileId']).getBlob(); } catch (e) { blob = null; } }
    if (!blob) {
      var m = model(collect(ym, deptCode), companyId, { status: fb ? 'FINAL' : 'DRAFT', billNo: fb ? fb.billNo : '', by: user.fullName || user.username });
      blob = blobs(m)[kind];
    }
    return { name: blob.getName(), mime: blob.getContentType ? blob.getContentType() : (kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), base64: Utilities.base64Encode(blob.getBytes()), final: !!fb };
  }

  // ---------- lock / unlock ----------
  function lock(user, d) {
    var ym = checkMonth(d.month), dept = checkDept(d.deptCode), force = !!d.force, reason = OSC.cleanText(d.reason, 300);
    if (lockRow(ym, dept.code)) fail('VALIDATION', OSC.fmtMonth(ym) + ' is already locked for ' + dept.name);
    if (lastDay(ym) >= Clock.today()) fail('VALIDATION', OSC.fmtMonth(ym) + ' is not over yet. Lock it on or after ' + OSC.fmtDate(OSC.addDays(lastDay(ym), 1)) + '.');
    if (force && user.role !== APP.roles.ADMIN) fail('FORBIDDEN', 'Only the Admin can lock a month that still has open items');
    if (force && reason.length < 5) failFields({ reason: 'Write why the month is locked with open items' });
    var c = collect(ym, dept.code), models = c.companyIds.map(function (cid) { return { cid: cid, m: model(c, cid, {}) }; });
    var blockers = []; models.forEach(function (x) { x.m.blockers.forEach(function (b) { if (b.type !== 'MONTH_OPEN') blockers.push((Companies.get(x.cid) || { name: x.cid }).name + ': ' + b.text); }); });
    if (blockers.length && !force) { var e = new AppError('NOT_READY', 'The month cannot be locked yet:\n• ' + blockers.join('\n• '), null); e.blockers = blockers; throw e; }
    var lockId, bills = [];
    withLock(function () {
      if (lockRow(ym, dept.code)) fail('VALIDATION', 'Already locked');
      lockId = 'LK-' + ym + '-' + dept.code + '-' + (Db.where('MonthLocks', function (l) { return l.month === ym && l.deptCode === dept.code; }).length + 1);
      Db.insert('MonthLocks', { lockId: lockId, month: ym, deptCode: dept.code, status: 'LOCKED', lockedAt: Clock.now(), lockedBy: user.username });
      models.forEach(function (x) {
        var co = Companies.get(x.cid) || { companyId: x.cid, code: x.cid }, rev = revisionOf(ym, dept.code, x.cid);
        Db.where('Bills', function (b) { return b.month === ym && b.deptCode === dept.code && b.companyId === x.cid && (b.status === 'Final' || b.status === 'Unlocked'); })
          .forEach(function (b) { Db.update('Bills', b.billId, { status: 'Superseded' }); });
        var m = model(c, x.cid, { status: 'FINAL', billNo: billNo(ym, dept.code, co, rev), by: user.fullName || user.username });
        var rec = { billId: newId('BL'), billNo: m.billNo, month: ym, deptCode: dept.code, companyId: x.cid, revision: rev, status: 'Final',
          duties: OSCBill.r3(m.hoursTotal.duties), hours: m.hoursTotal.netH, deductionHours: m.hoursTotal.dedH, gross: m.gross, penalties: m.penaltyTotal, taxable: m.taxable, gst: m.gst, net: m.net, roundOff: m.roundOff, payable: m.payable,
          lines: m.lines.map(function (l) { return { label: l.label, duties: OSCBill.r3(l.duties), rate: l.rate, amount: l.amount, h8: l.h8, h4: l.h4, dd: l.dd, dedH: l.dedH }; }),
          xlsxFileId: '', pdfFileId: '', forced: force ? reason : '', lockedAt: Clock.now(), lockedBy: user.username, note: '' };
        Db.insert('Bills', rec);
        bills.push({ rec: rec, m: m });
      });
    });
    Audit.log(user, force ? 'month.lockForced' : 'month.lock', 'MonthLocks', lockId, force ? reason : 'Month closed', null, { month: ym, deptCode: dept.code, bills: bills.map(function (b) { return { billNo: b.rec.billNo, payable: b.rec.payable }; }) });
    // final files to Drive (data is frozen now; if Drive fails, the download button rebuilds them from the same data)
    var fileErr = '';
    bills.forEach(function (b) {
      try {
        var bl = blobs(b.m), folder = packFolder(ym, 'Final');
        var fx = replaceFile(folder, bl.xlsx), fp = replaceFile(folder, bl.pdf);
        Db.update('Bills', b.rec.billId, { xlsxFileId: fx.getId(), pdfFileId: fp.getId() });
      } catch (e) { fileErr = String(e && e.message || e); console.error('pack save failed: ' + fileErr); }
    });
    var mail = null;
    try { if (allLocked(ym)) mail = Mailer.monthlySummary(ym); } catch (e) { console.error('summary mail failed: ' + e); mail = { error: String(e) }; }
    return { locked: true, lockId: lockId, bills: bills.map(function (b) { return { billNo: b.rec.billNo, companyId: b.rec.companyId, payable: b.rec.payable }; }), fileError: fileErr, summaryEmail: mail };
  }
  function allLocked(ym) { return Departments.list().filter(function (d) { return d.active; }).every(function (d) { return !!lockRow(ym, d.code); }); }

  function unlock(admin, d) {
    var ym = checkMonth(d.month), dept = checkDept(d.deptCode), reason = requireReason(d.reason);
    var lk = lockRow(ym, dept.code);
    if (!lk) fail('VALIDATION', OSC.fmtMonth(ym) + ' is not locked for ' + dept.name);
    withLock(function () {
      Db.update('MonthLocks', lk.lockId, { status: 'UNLOCKED', unlockedAt: Clock.now(), unlockedBy: admin.username, unlockReason: reason });
      finalBills(ym, dept.code).forEach(function (b) { Db.update('Bills', b.billId, { status: 'Unlocked', note: clip('Unlocked by ' + admin.username + ': ' + reason, 300) }); });
    });
    Audit.log(admin, 'month.unlock', 'MonthLocks', lk.lockId, reason, { status: 'LOCKED' }, { status: 'UNLOCKED' });
    return { unlocked: true };
  }

  // ---------- company comparison and what-if ----------
  /** Same hours, priced with each company's rate cards for this department (penalties left out, they belong to the actual provider). */
  function compare(ym, deptCode) {
    checkMonth(ym); var dept = checkDept(deptCode);
    var c = collect(ym, dept.code), all = { days: c.days.map(function (d) { var x = Object.assign({}, d); x.companyId = '*'; return x; }), members: {} };
    Object.keys(c.members).forEach(function (k) { var m = Object.assign({}, c.members[k]); m.companyId = '*'; all.members[m.staffId] = m; });
    var pooled = { ym: ym, deptCode: dept.code, from: c.from, to: c.to, days: all.days, members: all.members, deductions: c.deductions.map(function (x) { var y = Object.assign({}, x); y.companyId = '*'; return y; }), penalties: [], exceptions: [] };
    var actual = c.companyIds.map(function (cid) { return model(c, cid, {}); });
    var actualTotal = { payable: actual.reduce(function (a, m) { return a + m.payable; }, 0), penalties: actual.reduce(function (a, m) { return a + m.penaltyTotal; }, 0) };
    var candidates = Db.all('Companies').filter(function (co) { return toList(co.deptCodes).indexOf(dept.code) >= 0 && Db.where('Rates', function (r) { return r.companyId === co.companyId && r.deptCode === dept.code && r.status === 'Active'; }).length; });
    var rows = candidates.map(function (co) {
      var missing = {};
      var m = model(pooled, '*', { noPenalties: true, reprice: function (x) {
        var r = Rates.rateFor(co.companyId, dept.code, x.designation, x.date);
        x.ratePerDuty = r ? r.ratePerDuty : ''; x.gstPct = r ? r.gstPct : '';
        if (!r && x.billable > 0) missing[x.designation] = 1;
      } });
      return { companyId: co.companyId, companyName: co.name, code: co.code, status: co.status, current: c.companyIds.indexOf(co.companyId) >= 0,
        lines: m.lines.map(function (l) { return { label: l.label, duties: l.duties, rate: l.rate, amount: l.amount }; }), gross: m.gross, gst: m.gst, payable: m.payable, missingRates: Object.keys(missing) };
    }).sort(function (a, b) { return (a.missingRates.length - b.missingRates.length) || (a.payable - b.payable); });
    var hours = OSCBill.build({ ym: ym, dept: { code: dept.code }, days: pooled.days, staff: [], deductions: pooled.deductions }).hoursTotal;
    return { month: ym, deptCode: dept.code, deptName: dept.name, hours: hours, actual: actualTotal, companies: rows };
  }

  /** What would this month cost under other rule settings? Uses the same punches and Ops decisions; nothing is saved. */
  function whatIfRules(ym, deptCode, params) {
    checkMonth(ym); var dept = checkDept(deptCode);
    var n = OSCRules.normalise(params || {});
    if (!n.ok) failFields(n.errors);
    var R = n.rules, from = ym + '-01', to = lastDay(ym);
    var L = DutyEngine.list(from, to, { deptCode: dept.code }), dec = {};
    Db.all('DutyDecisions').forEach(function (x) { if (x.status !== 'Revoked') dec[x.decisionKey] = x; });
    var per = {}, changed = [];
    L.duties.forEach(function (d) {
      var hrs = Number(d.finalHours) || 0;
      if (d.inAt && d.outAt && !dec['FINAL:' + d.dutyId]) {
        var cd = OSCRules.computeDuty(Date.parse(d.inAt), Date.parse(d.outAt), R), g = dec['GRACE:' + d.dutyId];
        hrs = g && (g.value || {}).choice === 'grace' && cd.lateGrace && cd.graceHours != null ? cd.graceHours : cd.hours;
        if (hrs !== Number(d.finalHours)) changed.push({ staffId: d.staffId, name: d.name, dutyDate: d.dutyDate, inAt: d.inAt, outAt: d.outAt, before: Number(d.finalHours) || 0, after: hrs });
      }
      var k = d.staffId + ':' + d.dutyDate;
      if (!per[k]) per[k] = { staffId: d.staffId, date: d.dutyDate, total: 0, designation: d.designation, companyId: d.companyId, ratePerDuty: d.ratePerDuty, gstPct: d.gstPct };
      per[k].total += hrs;
    });
    var days = Object.keys(per).map(function (k) {
      var p = per[k], total = OSCRules.r2(p.total), sp = OSCRules.split(total, R), ad = dec['APPROVE:' + k];
      var approved = !R.over12NeedsApproval || !!(ad && (ad.value || {}).approved !== false);
      var billable = OSCRules.r2(total - (approved ? 0 : sp.dd)), b = OSCRules.split(billable, R);
      return { staffId: p.staffId, date: p.date, h8: b.h8, h4: b.h4, dd: b.dd, billable: billable, pending: approved || ad ? 0 : sp.dd, open: false, designation: p.designation, companyId: p.companyId, ratePerDuty: p.ratePerDuty, gstPct: p.gstPct };
    });
    var c = collect(ym, dept.code), alt = Object.assign({}, c, { days: days, exceptions: [] }), base = Object.assign({}, c, { exceptions: [] });
    var rows = c.companyIds.map(function (cid) {
      var a = model(base, cid, {}), b = model(alt, cid, {});
      return { companyId: cid, companyName: (Companies.get(cid) || { name: cid }).name, current: { hours: a.hoursTotal.netH, duties: a.hoursTotal.duties, payable: a.payable }, proposed: { hours: b.hoursTotal.netH, duties: b.hoursTotal.duties, payable: b.payable }, difference: OSCBill.r2(b.payable - a.payable) };
    });
    return { month: ym, deptCode: dept.code, rules: R, companies: rows, changedDuties: changed.length, sample: changed.slice(0, 40) };
  }

  /** Draft packs for a month (used by the 1st-of-month job). Returns [{deptCode, companyId, payable, blockers, pdf blob}] */
  function drafts(ym) {
    var out = [];
    Departments.list().filter(function (d) { return d.active; }).forEach(function (d) {
      if (lockRow(ym, d.code)) return;
      var c = collect(ym, d.code);
      c.companyIds.forEach(function (cid) {
        var m = model(c, cid, { status: 'DRAFT', by: 'Automatic draft' }), bl = blobs(m), folder = packFolder(ym, 'Draft');
        var fx = replaceFile(folder, bl.xlsx), fp = replaceFile(folder, bl.pdf);
        out.push({ deptCode: d.code, deptName: d.name, companyId: cid, companyName: (Companies.get(cid) || { name: cid }).name, payable: m.payable, duties: m.hoursTotal.duties,
          blockers: m.blockers.filter(function (b) { return b.type !== 'MONTH_OPEN'; }).map(function (b) { return b.text; }), pdf: bl.pdf, xlsxUrl: fx.getUrl ? fx.getUrl() : '', pdfUrl: fp.getUrl ? fp.getUrl() : '' });
      });
    });
    return out;
  }

  return { collect: collect, model: model, status: status, preview: preview, file: file, lock: lock, unlock: unlock, compare: compare, whatIfRules: whatIfRules,
    drafts: drafts, finalBills: finalBills, lockRow: lockRow, allLocked: allLocked, lastDay: lastDay, blobs: blobs, packFolder: packFolder, child: child };
})();

ROUTES['month.status'] = ['APP', function (u, d) { return MonthEnd.status(d.month || OSCBill.prevMonth(Clock.today().slice(0, 7))); }];
ROUTES['month.preview'] = ['APP', function (u, d) { return MonthEnd.preview(d.month, d.deptCode, d.companyId); }];
ROUTES['month.file'] = ['APP', function (u, d) { return MonthEnd.file(u, d.month, d.deptCode, d.companyId, d.kind); }];
ROUTES['month.lock'] = ['APP', function (u, d) { return MonthEnd.lock(u, d); }];
ROUTES['month.unlock'] = ['ADMIN', function (u, d) { return MonthEnd.unlock(u, d); }];
ROUTES['month.compare'] = ['APP', function (u, d) { return MonthEnd.compare(d.month, d.deptCode); }];
ROUTES['month.whatIfRules'] = ['APP', function (u, d) { return MonthEnd.whatIfRules(d.month, d.deptCode, d.params); }];
ROUTES['month.bills'] = ['APP', function (u, d) {
  var cos = {}; Db.all('Companies').forEach(function (c) { cos[c.companyId] = c.name; });
  return Db.all('Bills').filter(function (b) { return !d.month || b.month === d.month; }).sort(function (a, b) { return a.lockedAt < b.lockedAt ? 1 : -1; }).slice(0, 200)
    .map(function (b) { var o = {}; Object.keys(b).forEach(function (k) { if (k !== '_row' && k !== 'lines') o[k] = b[k]; }); o.companyName = cos[b.companyId] || b.companyId; return o; });
}];
