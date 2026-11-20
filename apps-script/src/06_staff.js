/* ===== 06 Staff master, history, transfers, exits, bulk import ===== */
var FACE = { NONE: 'Not enrolled', PENDING: 'Pending', ACTIVE: 'Active', DISABLED: 'Disabled' };
var HIST_FIELDS = ['department', 'company', 'designation'];

var Staff = (function () {
  function deptMap() { var m = {}; Db.all('Departments').forEach(function (d) { m[d.code] = d; }); return m; }
  function coMap() { var m = {}; Db.all('Companies').forEach(function (c) { m[c.companyId] = c; }); return m; }

  function toPublic(s, dm, cm) {
    dm = dm || deptMap(); cm = cm || coMap();
    return {
      staffId: s.staffId, title: s.title, fullName: s.fullName, displayName: s.title + ' ' + s.fullName,
      dob: s.dob, age: OSC.ageOn(s.dob, Clock.today()), mobile: s.mobile,
      deptCode: s.deptCode, deptName: dm[s.deptCode] ? dm[s.deptCode].name : s.deptCode,
      designation: s.designation, companyId: s.companyId, companyName: cm[s.companyId] ? cm[s.companyId].name : s.companyId,
      companyCode: cm[s.companyId] ? cm[s.companyId].code : '',
      joinDate: s.joinDate, exitDate: s.exitDate, exitReason: s.exitReason, status: s.status, faceStatus: s.faceStatus,
      vendorCode: s.vendorCode, createdAt: s.createdAt, createdBy: s.createdBy, updatedAt: s.updatedAt, updatedBy: s.updatedBy
    };
  }
  function context(selfId, isNew) {
    var mobiles = {};
    Db.all('Staff').forEach(function (s) { if (s.status === 'Active') mobiles[s.mobile] = s.staffId; });
    return {
      today: Clock.today(), titles: Settings.list('titles'), designations: Settings.list('designations'),
      departments: Db.all('Departments'), companies: Companies.list(), activeMobiles: mobiles, selfId: selfId || null, isNew: !!isNew
    };
  }
  function assertOpenMonth(deptCode, iso, field) {
    if (MonthLocks.isLocked(deptCode, OSC.monthOf(iso))) {
      var f = {}; f[field] = OSC.fmtMonth(OSC.monthOf(iso)) + ' is locked. Choose a date in an open month.'; failFields(f);
    }
  }
  function addHistory(user, staffId, field, value, from, reason) {
    Db.insert('StaffHistory', { histId: newId('SH'), staffId: staffId, field: field, value: value, effectiveFrom: from, effectiveTo: '', reason: reason || '', createdAt: Clock.now(), createdBy: user.username });
  }
  function openHistory(staffId, field) {
    return Db.where('StaffHistory', function (h) { return h.staffId === staffId && h.field === field && !h.effectiveTo; })[0] || null;
  }
  /** Close the open row of a field the day before `from` and open a new one. */
  function changeHistory(user, staffId, field, value, from, reason) {
    var open = openHistory(staffId, field);
    if (open) {
      if (open.effectiveFrom >= from) {
        var f = {}; f.effectiveFrom = 'Must be after ' + OSC.fmtDate(open.effectiveFrom) + ', when the current ' + field + ' started'; failFields(f);
      }
      Db.update('StaffHistory', open.histId, { effectiveTo: OSC.addDays(from, -1) });
    }
    addHistory(user, staffId, field, value, from, reason);
  }

  /** Must be called inside withLock. v = validated value from OSC.validateStaff. */
  function createLocked(user, v, source) {
    var dept = Db.find('Departments', v.deptCode);
    var seq = dept.nextSeq || 1, id = OSC.staffId(dept.code, seq);
    while (Db.find('Staff', id)) { seq++; id = OSC.staffId(dept.code, seq); }
    var now = Clock.now();
    var rec = { staffId: id, title: v.title, fullName: v.fullName, dob: v.dob, mobile: v.mobile, deptCode: v.deptCode, designation: v.designation,
      companyId: v.companyId, joinDate: v.joinDate, exitDate: '', exitReason: '', status: 'Active', faceStatus: FACE.NONE, vendorCode: v.vendorCode,
      createdAt: now, createdBy: user.username, updatedAt: now, updatedBy: user.username };
    Db.insert('Staff', rec);
    Db.update('Departments', dept.code, { nextSeq: seq + 1 });
    addHistory(user, id, 'department', v.deptCode, v.joinDate, 'Joined');
    addHistory(user, id, 'company', v.companyId, v.joinDate, 'Joined');
    addHistory(user, id, 'designation', v.designation, v.joinDate, 'Joined');
    Audit.log(user, 'staff.create', 'Staff', id, source || '', null, rec);
    return rec;
  }

  function list(filter) {
    var dm = deptMap(), cm = coMap();
    return Db.all('Staff').filter(function (s) {
      if (filter && filter.status && filter.status !== 'All' && s.status !== filter.status) return false;
      return true;
    }).map(function (s) { return toPublic(s, dm, cm); });
  }
  function get(staffId) {
    var s = Db.find('Staff', staffId);
    if (!s) fail('NOT_FOUND', 'Staff ' + staffId + ' not found');
    var hist = Db.where('StaffHistory', function (h) { return h.staffId === staffId; })
      .sort(function (a, b) { return a.effectiveFrom < b.effectiveFrom ? -1 : 1; })
      .map(function (h) { delete h._row; return h; });
    var p = toPublic(s);
    p.history = hist;
    p.currentRate = Rates.rateFor(s.companyId, s.deptCode, s.designation, Clock.today());
    return p;
  }
  function create(user, data) {
    var r = OSC.validateStaff(data, context(null, true));
    if (!r.ok) failFields(r.errors);
    return withLock(function () { return toPublic(createLocked(user, r.value, 'Added in console')); });
  }
  function update(user, staffId, data, reason) {
    reason = requireReason(reason);
    var cur = Db.find('Staff', staffId);
    if (!cur) fail('NOT_FOUND', 'Staff not found');
    var merged = {
      title: data.title, fullName: data.fullName, dob: data.dob, mobile: data.mobile, designation: data.designation || cur.designation,
      joinDate: data.joinDate || cur.joinDate, vendorCode: data.vendorCode
    };
    var ctx = context(staffId, false);
    if (cur.status !== 'Active') ctx.activeMobiles = {}; // exited staff may share a number with a new joiner
    var r = OSC.validateStaff(merged, ctx);
    if (!r.ok) failFields(r.errors);
    var v = r.value;
    return withLock(function () {
      var patch = { title: v.title, fullName: v.fullName, dob: v.dob, mobile: v.mobile, vendorCode: v.vendorCode, updatedAt: Clock.now(), updatedBy: user.username };
      if (v.joinDate !== cur.joinDate) {
        assertOpenMonth(cur.deptCode, v.joinDate < cur.joinDate ? v.joinDate : cur.joinDate, 'joinDate');
        patch.joinDate = v.joinDate;
        Db.where('StaffHistory', function (h) { return h.staffId === staffId && h.effectiveFrom === cur.joinDate; })
          .forEach(function (h) { Db.update('StaffHistory', h.histId, { effectiveFrom: v.joinDate }); });
      }
      if (v.designation !== cur.designation) {
        var from = OSC.parseDate(data.designationFrom) || Clock.today();
        assertOpenMonth(cur.deptCode, from, 'designationFrom');
        changeHistory(user, staffId, 'designation', v.designation, from, reason);
        patch.designation = v.designation;
      }
      var ch = Db.update('Staff', staffId, patch);
      Audit.log(user, 'staff.update', 'Staff', staffId, reason, ch.before, ch.after);
      return toPublic(ch.after);
    });
  }
  /** Move to another department and/or company. Employee ID never changes. */
  function transfer(user, staffId, data) {
    var reason = requireReason(data.reason);
    var cur = Db.find('Staff', staffId);
    if (!cur) fail('NOT_FOUND', 'Staff not found');
    if (cur.status !== 'Active') fail('VALIDATION', 'Only active staff can be transferred');
    var e = {};
    var deptCode = OSC.cleanText(data.deptCode || cur.deptCode).toUpperCase();
    var companyId = OSC.cleanText(data.companyId || cur.companyId);
    var from = OSC.parseDate(data.effectiveFrom);
    var dept = Db.find('Departments', deptCode), co = Db.find('Companies', companyId);
    if (!dept || !dept.active) e.deptCode = 'Choose an active department';
    if (!co || co.status !== 'Active') e.companyId = 'Choose an active company';
    else if (dept && toList(co.deptCodes).indexOf(deptCode) < 0) e.companyId = co.name + ' does not serve ' + dept.name;
    if (!from) e.effectiveFrom = 'Enter the date the change starts';
    else if (from <= cur.joinDate) e.effectiveFrom = 'Must be after the joining date';
    else if (from > Clock.today()) e.effectiveFrom = 'Cannot be a future date';
    if (deptCode === cur.deptCode && companyId === cur.companyId) e.deptCode = 'Nothing changed';
    if (Object.keys(e).length) failFields(e);
    assertOpenMonth(cur.deptCode, from, 'effectiveFrom');
    assertOpenMonth(deptCode, from, 'effectiveFrom');
    return withLock(function () {
      if (deptCode !== cur.deptCode) changeHistory(user, staffId, 'department', deptCode, from, reason);
      if (companyId !== cur.companyId) changeHistory(user, staffId, 'company', companyId, from, reason);
      var ch = Db.update('Staff', staffId, { deptCode: deptCode, companyId: companyId, updatedAt: Clock.now(), updatedBy: user.username });
      Audit.log(user, 'staff.transfer', 'Staff', staffId, reason, { deptCode: cur.deptCode, companyId: cur.companyId }, { deptCode: deptCode, companyId: companyId, effectiveFrom: from });
      return toPublic(ch.after);
    });
  }
  function exit(user, staffId, data) {
    var cur = Db.find('Staff', staffId);
    if (!cur) fail('NOT_FOUND', 'Staff not found');
    if (cur.status !== 'Active') fail('VALIDATION', 'This person has already exited');
    var reason = OSC.cleanText(data.exitReason, 200), e = {};
    var d = OSC.parseDate(data.exitDate);
    if (!d) e.exitDate = 'Enter the last working date';
    else if (d < cur.joinDate) e.exitDate = 'Cannot be before the joining date';
    else if (d > OSC.addDays(Clock.today(), 31)) e.exitDate = 'Cannot be more than 31 days ahead';
    if (reason.length < 3) e.exitReason = 'Enter the reason for exit';
    if (Object.keys(e).length) failFields(e);
    assertOpenMonth(cur.deptCode, d, 'exitDate');
    return withLock(function () {
      HIST_FIELDS.forEach(function (f) { var o = openHistory(staffId, f); if (o) Db.update('StaffHistory', o.histId, { effectiveTo: d }); });
      var ch = Db.update('Staff', staffId, { status: 'Exited', exitDate: d, exitReason: reason,
        faceStatus: cur.faceStatus === FACE.NONE ? FACE.NONE : FACE.DISABLED, updatedAt: Clock.now(), updatedBy: user.username });
      Audit.log(user, 'staff.exit', 'Staff', staffId, reason, { status: cur.status }, { status: 'Exited', exitDate: d });
      return toPublic(ch.after);
    });
  }
  function reactivate(user, staffId, data) {
    var reason = requireReason(data.reason);
    var cur = Db.find('Staff', staffId);
    if (!cur) fail('NOT_FOUND', 'Staff not found');
    if (cur.status === 'Active') fail('VALIDATION', 'Already active');
    var d = OSC.parseDate(data.rejoinDate), e = {};
    if (!d) e.rejoinDate = 'Enter the re-joining date';
    else if (cur.exitDate && d <= cur.exitDate) e.rejoinDate = 'Must be after the exit date ' + OSC.fmtDate(cur.exitDate);
    var clash = Db.where('Staff', function (s) { return s.status === 'Active' && s.mobile === cur.mobile; })[0];
    if (clash) e.rejoinDate = 'Mobile ' + cur.mobile + ' is now used by ' + clash.staffId + '. Update the mobile first.';
    var dept = Db.find('Departments', cur.deptCode), co = Db.find('Companies', cur.companyId);
    if (!dept || !dept.active || !co || co.status !== 'Active') e.rejoinDate = 'Department or company is inactive. Re-join is not possible with the old details.';
    if (Object.keys(e).length) failFields(e);
    assertOpenMonth(cur.deptCode, d, 'rejoinDate');
    return withLock(function () {
      addHistory(user, staffId, 'department', cur.deptCode, d, 'Re-joined');
      addHistory(user, staffId, 'company', cur.companyId, d, 'Re-joined');
      addHistory(user, staffId, 'designation', cur.designation, d, 'Re-joined');
      var ch = Db.update('Staff', staffId, { status: 'Active', exitDate: '', exitReason: '', faceStatus: FACE.NONE, updatedAt: Clock.now(), updatedBy: user.username });
      Audit.log(user, 'staff.reactivate', 'Staff', staffId, reason, { status: cur.status, exitDate: cur.exitDate }, { status: 'Active', rejoinDate: d });
      return toPublic(ch.after);
    });
  }
  /** Value of department/company/designation for a staff member on a date (used by later phases). */
  function valueOn(staffId, field, isoDate) {
    var h = Db.where('StaffHistory', function (x) { return x.staffId === staffId && x.field === field && x.effectiveFrom <= isoDate && (!x.effectiveTo || x.effectiveTo >= isoDate); });
    return h.length ? h[h.length - 1].value : null;
  }

  /** Bulk import. rows: [{title, fullName, dob, mobile, deptCode, designation, companyCode, joinDate, vendorCode}] */
  function importRows(user, rows, commit) {
    if (!Array.isArray(rows) || !rows.length) fail('VALIDATION', 'The file has no data rows');
    if (rows.length > 300) fail('VALIDATION', 'Import at most 300 rows at a time');
    var ctx = context(null, true), seen = {}, report = [], okCount = 0;
    rows.forEach(function (row, i) {
      var r = OSC.validateStaff(row, ctx);
      if (r.value.mobile && OSC.isMobile(r.value.mobile)) {
        if (seen[r.value.mobile]) r.errors.mobile = 'Same mobile as row ' + seen[r.value.mobile];
        else seen[r.value.mobile] = i + 2;
      }
      var ok = Object.keys(r.errors).length === 0;
      if (ok) okCount++;
      report.push({ row: i + 2, ok: ok, errors: r.errors, value: r.value });
    });
    var allOk = okCount === rows.length;
    if (!commit || !allOk) return { committed: false, total: rows.length, valid: okCount, invalid: rows.length - okCount, report: report };
    var created = withLock(function () {
      return report.map(function (rep) { return createLocked(user, rep.value, 'Bulk import').staffId; });
    });
    Audit.log(user, 'staff.import', 'Staff', '', 'Imported ' + created.length + ' rows', null, { ids: created });
    return { committed: true, total: rows.length, valid: okCount, invalid: 0, created: created, report: report };
  }

  function stats() {
    var out = { byDept: {}, active: 0, exited: 0, face: {} };
    Db.all('Staff').forEach(function (s) {
      if (s.status === 'Active') {
        out.active++;
        out.byDept[s.deptCode] = (out.byDept[s.deptCode] || 0) + 1;
        out.face[s.faceStatus] = (out.face[s.faceStatus] || 0) + 1;
      } else out.exited++;
    });
    return out;
  }

  return { list: list, get: get, create: create, update: update, transfer: transfer, exit: exit, reactivate: reactivate,
    valueOn: valueOn, importRows: importRows, stats: stats, toPublic: toPublic };
})();
