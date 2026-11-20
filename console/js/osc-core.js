/*
 * OutSource Connect — shared core (validation + formatting).
 * One file used by: the console (browser), the Apps Script server (copied into Code.gs by tools/build.js)
 * and the automated tests (Node). Plain ES2019, no imports, no DOM.
 * All dates are strings 'YYYY-MM-DD' in India Standard Time (IST, UTC+05:30, no daylight saving).
 */
var OSC = (function () {
  'use strict';

  var IST_OFFSET_MS = 330 * 60 * 1000;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }

  // ---------- dates ----------
  function isISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    if (m < 1 || m > 12 || d < 1) return false;
    return d <= daysInMonth(y, m);
  }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  /** IST calendar date of an instant (ms since epoch, default now). */
  function todayIST(nowMs) {
    var d = new Date((nowMs == null ? Date.now() : nowMs) + IST_OFFSET_MS);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  /** ISO timestamp with +05:30 for an instant. */
  function nowISTString(nowMs) {
    var ms = nowMs == null ? Date.now() : nowMs;
    var d = new Date(ms + IST_OFFSET_MS);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + '+05:30';
  }
  function addDays(iso, n) {
    var t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000;
    var d = new Date(t);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function monthOf(iso) { return iso.slice(0, 7); }

  /**
   * Accepts: Date object (taken as IST calendar date), Excel serial number, 'YYYY-MM-DD',
   * 'DD-MM-YYYY', 'DD/MM/YYYY', 'DD.MM.YYYY', 'DD-Mon-YYYY', 'DD Mon YYYY'. Returns 'YYYY-MM-DD' or null.
   */
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return null;
      return todayIST(v.getTime());
    }
    if (typeof v === 'number' && isFinite(v)) {
      if (v < 1 || v > 80000) return null; // Excel serial (days since 1899-12-30)
      var dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
    }
    var s = String(v).trim();
    var m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return check(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(s))) return check(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{4})$/.exec(s))) {
      var mi = MONTHS.map(function (x) { return x.toLowerCase(); }).indexOf(m[2].slice(0, 3).toLowerCase());
      if (mi < 0) return null;
      return check(+m[3], mi + 1, +m[1]);
    }
    if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
    return null;
    function check(y, mo, d) { var iso = y + '-' + pad(mo) + '-' + pad(d); return isISODate(iso) ? iso : null; }
  }

  /** Whole years between dob and onDate (both ISO). */
  function ageOn(dob, onDate) {
    if (!isISODate(dob) || !isISODate(onDate)) return null;
    var a = +onDate.slice(0, 4) - +dob.slice(0, 4);
    if (onDate.slice(5) < dob.slice(5)) a--;
    return a;
  }

  // ---------- formatting (Indian conventions) ----------
  function fmtDate(iso) {
    if (!iso) return '';
    iso = String(iso).slice(0, 10);
    if (!isISODate(iso)) return String(iso);
    return iso.slice(8, 10) + '-' + MONTHS[+iso.slice(5, 7) - 1] + '-' + iso.slice(0, 4);
  }
  function fmtMonth(ym) { return MONTHS[+ym.slice(5, 7) - 1] + '-' + ym.slice(0, 4); }
  function fmtTime12(hh, mm) {
    var h = +hh, ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return pad(h) + ':' + pad(mm) + ' ' + ap;
  }
  /** '2026-11-20T08:02:11+05:30' (or any ISO instant) -> '20-Nov-2026 08:02 AM' in IST. */
  function fmtDateTime(ts) {
    if (!ts) return '';
    var ms = Date.parse(ts);
    if (isNaN(ms)) return String(ts);
    var d = new Date(ms + IST_OFFSET_MS);
    var iso = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    return fmtDate(iso) + ' ' + fmtTime12(d.getUTCHours(), d.getUTCMinutes());
  }
  /** Indian digit grouping: 1234567.5 -> '12,34,567.50' */
  function groupIN(n, decimals) {
    if (n == null || n === '' || !isFinite(n)) return '';
    decimals = decimals == null ? 2 : decimals;
    var neg = n < 0, s = Math.abs(n).toFixed(decimals);
    var parts = s.split('.'), i = parts[0];
    var last3 = i.slice(-3), rest = i.slice(0, -3);
    if (rest) last3 = ',' + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return (neg ? '-' : '') + rest + last3 + (parts[1] ? '.' + parts[1] : '');
  }
  function fmtINR(n) { return n == null || n === '' ? '' : '₹ ' + groupIN(Number(n), 2); }
  function fmtHours(n) { return n == null || n === '' ? '' : Number(n).toFixed(2); }

  // ---------- text safety ----------
  function cleanText(v, maxLen) {
    if (v == null) return '';
    var s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
    return maxLen ? s.slice(0, maxLen) : s;
  }
  /** Guard against formula injection when a string is written to Google Sheets. */
  function sheetSafe(v) {
    if (typeof v !== 'string') return v;
    return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  }
  function unSheetSafe(v) {
    return (typeof v === 'string' && /^'[=+\-@\t\r]/.test(v)) ? v.slice(1) : v;
  }

  // ---------- small validators ----------
  function normMobile(v) {
    var s = String(v == null ? '' : v).replace(/[\s\-()]/g, '');
    if (/^\+91/.test(s)) s = s.slice(3);
    else if (/^91\d{10}$/.test(s)) s = s.slice(2);
    else if (/^0\d{10}$/.test(s)) s = s.slice(1);
    return s;
  }
  function isMobile(s) { return /^[6-9]\d{9}$/.test(s); }
  function isName(s) { return /^[A-Za-z][A-Za-z .'\-]{1,59}$/.test(s); }
  function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }
  function isGSTIN(s) { return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s); }
  function isPAN(s) { return /^[A-Z]{5}\d{4}[A-Z]$/.test(s); }
  function splitList(v) {
    if (Array.isArray(v)) return v.map(function (x) { return cleanText(x); }).filter(Boolean);
    return String(v == null ? '' : v).split(',').map(function (x) { return cleanText(x); }).filter(Boolean);
  }

  function staffId(deptCode, seq) { return deptCode + pad(seq, 3); }

  // ---------- record validators: return {ok, errors:{field:msg}, value} ----------
  function result(errors, value) {
    return { ok: Object.keys(errors).length === 0, errors: errors, value: value };
  }

  /**
   * ctx: { today, titles[], designations[], departments:[{code,name,active}],
   *        companies:[{companyId,code,name,status,deptCodes[],contractStart,contractEnd}],
   *        activeMobiles:{mobile:staffId}, selfId, isNew }
   */
  function validateStaff(input, ctx) {
    var e = {}, v = {};
    v.title = cleanText(input.title);
    if (ctx.titles.indexOf(v.title) < 0) e.title = 'Choose a title from the list';
    v.fullName = cleanText(input.fullName, 60);
    if (!v.fullName) e.fullName = 'Enter the full name';
    else if (!isName(v.fullName)) e.fullName = 'Use English letters, spaces, dot, hyphen or apostrophe only';

    v.dob = parseDate(input.dob);
    v.joinDate = parseDate(input.joinDate);
    if (!v.dob) e.dob = 'Enter a valid date of birth';
    if (!v.joinDate) e.joinDate = 'Enter a valid joining date';
    else if (v.joinDate > addDays(ctx.today, 31)) e.joinDate = 'Joining date cannot be more than 31 days ahead';
    if (v.dob) {
      if (v.dob >= ctx.today) e.dob = 'Date of birth must be in the past';
      else {
        var ageJoin = ageOn(v.dob, v.joinDate || ctx.today);
        if (ageJoin < 18) e.dob = 'Staff must be 18 or older on the joining date (age ' + ageJoin + ')';
        else if (ageOn(v.dob, ctx.today) > 75) e.dob = 'Age is over 75. Check the year of birth';
      }
    }

    v.mobile = normMobile(input.mobile);
    if (!isMobile(v.mobile)) e.mobile = 'Enter a 10-digit Indian mobile number';
    else if (ctx.activeMobiles && ctx.activeMobiles[v.mobile] && ctx.activeMobiles[v.mobile] !== ctx.selfId)
      e.mobile = 'This mobile is already used by ' + ctx.activeMobiles[v.mobile];

    v.designation = cleanText(input.designation);
    if (ctx.designations.indexOf(v.designation) < 0) e.designation = 'Choose Staff or Supervisor';

    if (ctx.isNew) {
      v.deptCode = cleanText(input.deptCode).toUpperCase();
      var dept = ctx.departments.filter(function (d) { return d.code === v.deptCode; })[0];
      if (!dept) e.deptCode = 'Choose a department';
      else if (!dept.active) e.deptCode = 'This department is inactive';

      var cid = cleanText(input.companyId), ccode = cleanText(input.companyCode).toUpperCase();
      var co = ctx.companies.filter(function (c) { return (cid && c.companyId === cid) || (ccode && c.code === ccode); })[0];
      if (!co) e.companyId = 'Choose the outsourced company';
      else {
        v.companyId = co.companyId;
        if (co.status !== 'Active') e.companyId = co.name + ' is not active';
        else if (dept && co.deptCodes.indexOf(dept.code) < 0) e.companyId = co.name + ' does not serve ' + dept.name;
        else if (v.joinDate && co.contractStart && v.joinDate < co.contractStart) e.joinDate = 'Joining date is before the contract start (' + fmtDate(co.contractStart) + ')';
        else if (v.joinDate && co.contractEnd && v.joinDate > co.contractEnd) e.joinDate = 'Joining date is after the contract end (' + fmtDate(co.contractEnd) + ')';
      }
    }
    v.vendorCode = cleanText(input.vendorCode, 30);
    return result(e, v);
  }

  /** ctx: { today, departments[], existingCodes:{code:companyId}, selfId } */
  function validateCompany(input, ctx) {
    var e = {}, v = {};
    v.name = cleanText(input.name, 100);
    if (v.name.length < 3) e.name = 'Enter the company name';
    v.code = cleanText(input.code).toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(v.code)) e.code = 'Short code: 2 to 10 letters or digits, starting with a letter';
    else if (ctx.existingCodes[v.code] && ctx.existingCodes[v.code] !== ctx.selfId) e.code = 'This code is already used';
    v.deptCodes = splitList(input.deptCodes).map(function (s) { return s.toUpperCase(); });
    var known = ctx.departments.map(function (d) { return d.code; });
    if (!v.deptCodes.length) e.deptCodes = 'Choose at least one department served';
    else if (v.deptCodes.some(function (c) { return known.indexOf(c) < 0; })) e.deptCodes = 'Unknown department';
    v.contractStart = parseDate(input.contractStart);
    v.contractEnd = input.contractEnd ? parseDate(input.contractEnd) : '';
    if (!v.contractStart) e.contractStart = 'Enter the contract start date';
    if (input.contractEnd && !v.contractEnd) e.contractEnd = 'Enter a valid date or leave empty';
    if (v.contractStart && v.contractEnd && v.contractEnd < v.contractStart) e.contractEnd = 'Contract end must be after the start';
    v.status = cleanText(input.status) || 'Active';
    if (['Active', 'Inactive'].indexOf(v.status) < 0) e.status = 'Choose Active or Inactive';
    v.gstin = cleanText(input.gstin).toUpperCase();
    if (v.gstin && !isGSTIN(v.gstin)) e.gstin = 'GSTIN should be 15 characters, like 24ABCDE1234F1Z5';
    v.pan = cleanText(input.pan).toUpperCase();
    if (v.pan && !isPAN(v.pan)) e.pan = 'PAN should be like ABCDE1234F';
    if (v.gstin && v.pan && v.gstin.slice(2, 12) !== v.pan) e.pan = 'PAN does not match the PAN inside the GSTIN';
    v.address = cleanText(input.address, 300);
    v.contactName = cleanText(input.contactName, 60);
    v.contactMobile = input.contactMobile ? normMobile(input.contactMobile) : '';
    if (v.contactMobile && !isMobile(v.contactMobile)) e.contactMobile = 'Enter a 10-digit mobile or leave empty';
    v.contactEmail = cleanText(input.contactEmail, 100).toLowerCase();
    if (v.contactEmail && !isEmail(v.contactEmail)) e.contactEmail = 'Enter a valid email or leave empty';
    v.notes = cleanText(input.notes, 500);
    return result(e, v);
  }

  /** ctx: { company:{deptCodes[]}, designations[], departments[] } */
  function validateRate(input, ctx) {
    var e = {}, v = {};
    v.deptCode = cleanText(input.deptCode).toUpperCase();
    if (!ctx.company || ctx.company.deptCodes.indexOf(v.deptCode) < 0) e.deptCode = 'Choose a department this company serves';
    v.designation = cleanText(input.designation);
    if (ctx.designations.indexOf(v.designation) < 0) e.designation = 'Choose Staff or Supervisor';
    v.ratePerDuty = Number(input.ratePerDuty);
    if (!isFinite(v.ratePerDuty) || v.ratePerDuty <= 0 || v.ratePerDuty > 100000) e.ratePerDuty = 'Enter the rate per 12-hour duty in rupees';
    else v.ratePerDuty = Math.round(v.ratePerDuty * 100) / 100;
    v.gstPct = Number(input.gstPct);
    if (!isFinite(v.gstPct) || v.gstPct < 0 || v.gstPct > 28) e.gstPct = 'GST % must be between 0 and 28';
    v.effectiveFrom = parseDate(input.effectiveFrom);
    if (!v.effectiveFrom) e.effectiveFrom = 'Enter the date this rate starts';
    v.effectiveTo = input.effectiveTo ? parseDate(input.effectiveTo) : '';
    if (input.effectiveTo && !v.effectiveTo) e.effectiveTo = 'Enter a valid date or leave empty';
    if (v.effectiveFrom && v.effectiveTo && v.effectiveTo < v.effectiveFrom) e.effectiveTo = 'End date must be on or after the start date';
    v.note = cleanText(input.note, 200);
    return result(e, v);
  }

  function validatePassword(pw, username, minLen) {
    var p = [];
    minLen = minLen || 10;
    if (typeof pw !== 'string' || pw.length < minLen) p.push('at least ' + minLen + ' characters');
    if (!/[A-Za-z]/.test(pw || '') || !/\d/.test(pw || '')) p.push('both letters and numbers');
    if (username && pw && pw.toLowerCase().indexOf(String(username).toLowerCase()) >= 0) p.push('must not contain the username');
    if (pw && pw.length > 128) p.push('at most 128 characters');
    return p;
  }
  function isUsername(s) { return /^[a-z][a-z0-9._]{3,29}$/.test(s); }

  return {
    MONTHS: MONTHS, pad: pad, isISODate: isISODate, daysInMonth: daysInMonth, todayIST: todayIST,
    nowISTString: nowISTString, addDays: addDays, monthOf: monthOf, parseDate: parseDate, ageOn: ageOn,
    fmtDate: fmtDate, fmtMonth: fmtMonth, fmtTime12: fmtTime12, fmtDateTime: fmtDateTime,
    groupIN: groupIN, fmtINR: fmtINR, fmtHours: fmtHours,
    cleanText: cleanText, sheetSafe: sheetSafe, unSheetSafe: unSheetSafe,
    normMobile: normMobile, isMobile: isMobile, isName: isName, isEmail: isEmail, isGSTIN: isGSTIN,
    isPAN: isPAN, splitList: splitList, staffId: staffId, isUsername: isUsername,
    validateStaff: validateStaff, validateCompany: validateCompany, validateRate: validateRate,
    validatePassword: validatePassword
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OSC;
