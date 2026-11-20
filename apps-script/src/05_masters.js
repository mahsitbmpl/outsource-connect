/* ===== 05 Masters: departments, companies, rate cards, month locks ===== */
var Departments = {
  list: function () {
    return Db.all('Departments').slice().sort(function (a, b) { return (a.sortOrder || 99) - (b.sortOrder || 99); })
      .map(function (d) { return { code: d.code, name: d.name, active: d.active, nextSeq: d.nextSeq, reqDay: d.reqDay, reqNight: d.reqNight, sortOrder: d.sortOrder }; });
  },
  get: function (code) { return Db.find('Departments', code); },
  save: function (admin, data, reason) {
    var e = {}, code = OSC.cleanText(data.code).toUpperCase();
    var name = OSC.cleanText(data.name, 60);
    var reqDay = Number(data.reqDay), reqNight = Number(data.reqNight);
    if (!/^[A-Z]{2,4}$/.test(code)) e.code = '2 to 4 capital letters, for example HK';
    if (name.length < 2) e.name = 'Enter the department name';
    if (!(reqDay >= 0 && reqDay <= 500 && Math.floor(reqDay) === reqDay)) e.reqDay = 'Whole number';
    if (!(reqNight >= 0 && reqNight <= 500 && Math.floor(reqNight) === reqNight)) e.reqNight = 'Whole number';
    if (Object.keys(e).length) failFields(e);
    return withLock(function () {
      var cur = Db.find('Departments', code), now = Clock.now();
      if (cur) {
        reason = requireReason(reason);
        if (data.active === false || data.active === 'false') {
          var active = Db.where('Staff', function (s) { return s.deptCode === code && s.status === 'Active'; });
          if (active.length) failFields({ active: active.length + ' active staff are in this department. Move or exit them first.' });
        }
        var ch = Db.update('Departments', code, { name: name, reqDay: reqDay, reqNight: reqNight, active: !(data.active === false || data.active === 'false'), sortOrder: Number(data.sortOrder) || cur.sortOrder, updatedAt: now, updatedBy: admin.username });
        Audit.log(admin, 'departments.update', 'Departments', code, reason, ch.before, ch.after);
        return ch.after;
      }
      var rec = { code: code, name: name, active: true, nextSeq: 1, reqDay: reqDay, reqNight: reqNight, sortOrder: Number(data.sortOrder) || Db.all('Departments').length + 1, updatedAt: now, updatedBy: admin.username };
      Db.insert('Departments', rec);
      Audit.log(admin, 'departments.create', 'Departments', code, reason || '', null, rec);
      return rec;
    });
  }
};

var Companies = {
  toPublic: function (c) {
    return { companyId: c.companyId, code: c.code, name: c.name, deptCodes: toList(c.deptCodes), contractStart: c.contractStart, contractEnd: c.contractEnd,
      status: c.status, gstin: c.gstin, pan: c.pan, address: c.address, contactName: c.contactName, contactMobile: c.contactMobile,
      contactEmail: c.contactEmail, notes: c.notes, createdAt: c.createdAt, createdBy: c.createdBy, updatedAt: c.updatedAt, updatedBy: c.updatedBy };
  },
  list: function () { return Db.all('Companies').map(Companies.toPublic); },
  get: function (id) { var c = Db.find('Companies', id); return c ? Companies.toPublic(c) : null; },
  save: function (user, data, reason) {
    var isNew = !data.companyId;
    var codes = {}; Db.all('Companies').forEach(function (c) { codes[c.code] = c.companyId; });
    var r = OSC.validateCompany(data, { today: Clock.today(), departments: Db.all('Departments'), existingCodes: codes, selfId: data.companyId || null });
    if (!r.ok) failFields(r.errors);
    var v = r.value; v.deptCodes = v.deptCodes.join(',');
    return withLock(function () {
      var now = Clock.now();
      if (isNew) {
        var n = Db.all('Companies').length + 1, id;
        do { id = 'CO' + OSC.pad(n++, 3); } while (Db.find('Companies', id));
        v.companyId = id; v.createdAt = now; v.createdBy = user.username; v.updatedAt = now; v.updatedBy = user.username;
        Db.insert('Companies', v);
        Audit.log(user, 'companies.create', 'Companies', id, reason || '', null, v);
        return Companies.get(id);
      }
      reason = requireReason(reason);
      var cur = Db.find('Companies', data.companyId);
      if (!cur) fail('NOT_FOUND', 'Company not found');
      var removed = toList(cur.deptCodes).filter(function (d) { return toList(v.deptCodes).indexOf(d) < 0; });
      if (removed.length) {
        var inUse = Db.where('Staff', function (s) { return s.companyId === cur.companyId && s.status === 'Active' && removed.indexOf(s.deptCode) >= 0; });
        if (inUse.length) failFields({ deptCodes: inUse.length + ' active staff of this company are in ' + removed.join(', ') + '. Transfer them first.' });
      }
      if (v.status === 'Inactive') {
        var act = Db.where('Staff', function (s) { return s.companyId === cur.companyId && s.status === 'Active'; });
        if (act.length) failFields({ status: act.length + ' active staff belong to this company. Transfer or exit them first.' });
      }
      v.updatedAt = now; v.updatedBy = user.username;
      var ch = Db.update('Companies', cur.companyId, v);
      Audit.log(user, 'companies.update', 'Companies', cur.companyId, reason, ch.before, ch.after);
      return Companies.get(cur.companyId);
    });
  }
};

var Rates = {
  toPublic: function (r) {
    return { rateId: r.rateId, companyId: r.companyId, deptCode: r.deptCode, designation: r.designation, ratePerDuty: r.ratePerDuty, gstPct: r.gstPct,
      effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, status: r.status, note: r.note, createdAt: r.createdAt, createdBy: r.createdBy, voidReason: r.voidReason };
  },
  list: function (companyId) {
    return Db.where('Rates', function (r) { return !companyId || r.companyId === companyId; })
      .sort(function (a, b) { return (a.deptCode + a.designation + a.effectiveFrom) < (b.deptCode + b.designation + b.effectiveFrom) ? -1 : 1; })
      .map(Rates.toPublic);
  },
  /** Rate card in force for company/department/designation on a date, or null. */
  rateFor: function (companyId, deptCode, designation, isoDate) {
    var hits = Db.where('Rates', function (r) {
      return r.status === 'Active' && r.companyId === companyId && r.deptCode === deptCode && r.designation === designation &&
        r.effectiveFrom <= isoDate && (!r.effectiveTo || r.effectiveTo >= isoDate);
    });
    hits.sort(function (a, b) { return a.effectiveFrom < b.effectiveFrom ? 1 : -1; });
    return hits[0] ? Rates.toPublic(hits[0]) : null;
  },
  /**
   * Adds a rate card. The previous open card for the same company/department/designation is closed the day before.
   * Rates can never start inside a locked month, so past bills never change.
   */
  add: function (user, data) {
    var company = Db.find('Companies', data.companyId);
    if (!company) fail('NOT_FOUND', 'Company not found');
    var r = OSC.validateRate(data, { company: { deptCodes: toList(company.deptCodes) }, designations: Settings.list('designations') });
    if (!r.ok) failFields(r.errors);
    var v = r.value;
    if (MonthLocks.isLocked(v.deptCode, OSC.monthOf(v.effectiveFrom))) failFields({ effectiveFrom: OSC.fmtMonth(OSC.monthOf(v.effectiveFrom)) + ' is locked for this department. Choose a date in an open month.' });
    return withLock(function () {
      var same = Db.where('Rates', function (x) { return x.status === 'Active' && x.companyId === company.companyId && x.deptCode === v.deptCode && x.designation === v.designation; });
      var later = same.filter(function (x) { return x.effectiveFrom >= v.effectiveFrom; });
      if (later.length) failFields({ effectiveFrom: 'A rate already starts on ' + OSC.fmtDate(later[0].effectiveFrom) + '. New rates must start after the latest one.' });
      var now = Clock.now();
      same.forEach(function (x) {
        if (!x.effectiveTo || x.effectiveTo >= v.effectiveFrom) {
          var ch = Db.update('Rates', x.rateId, { effectiveTo: OSC.addDays(v.effectiveFrom, -1) });
          Audit.log(user, 'rates.autoClose', 'Rates', x.rateId, 'New rate from ' + v.effectiveFrom, { effectiveTo: ch.before.effectiveTo }, { effectiveTo: ch.after.effectiveTo });
        }
      });
      var rec = { rateId: newId('RT'), companyId: company.companyId, deptCode: v.deptCode, designation: v.designation, ratePerDuty: v.ratePerDuty, gstPct: v.gstPct,
        effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo || '', status: 'Active', note: v.note, createdAt: now, createdBy: user.username, voidReason: '' };
      Db.insert('Rates', rec);
      Audit.log(user, 'rates.add', 'Rates', rec.rateId, v.note, null, rec);
      return Rates.toPublic(rec);
    });
  },
  /** Cancels a wrongly entered card. Not allowed if it touches a locked month. */
  voidRate: function (user, rateId, reason) {
    reason = requireReason(reason);
    var cur = Db.find('Rates', rateId);
    if (!cur) fail('NOT_FOUND', 'Rate not found');
    if (cur.status !== 'Active') fail('VALIDATION', 'This rate is already cancelled');
    if (MonthLocks.anyLockedBetween(cur.deptCode, cur.effectiveFrom, cur.effectiveTo || '9999-12-31')) fail('VALIDATION', 'This rate was used in a locked month and cannot be cancelled. Add a new rate instead.');
    return withLock(function () {
      var ch = Db.update('Rates', rateId, { status: 'Void', voidReason: reason });
      Audit.log(user, 'rates.void', 'Rates', rateId, reason, ch.before, ch.after);
      return Rates.toPublic(ch.after);
    });
  }
};

/* Month locks are created in Phase 5; Phase 1 only reads them so rates and transfers respect locked months. */
var MonthLocks = {
  isLocked: function (deptCode, ym) {
    return Db.where('MonthLocks', function (m) { return m.month === ym && (m.deptCode === deptCode || m.deptCode === 'ALL') && m.status === 'LOCKED'; }).length > 0;
  },
  anyLockedBetween: function (deptCode, fromIso, toIso) {
    var a = OSC.monthOf(fromIso), b = OSC.monthOf(toIso);
    return Db.where('MonthLocks', function (m) { return m.status === 'LOCKED' && (m.deptCode === deptCode || m.deptCode === 'ALL') && m.month >= a && m.month <= b; }).length > 0;
  }
};
