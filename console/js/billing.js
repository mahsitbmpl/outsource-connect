/*
 * OutSource Connect — month bill model (one file for server, console and tests). Plain ES2019, no imports.
 *
 * Billing logic (from Sample_Sheet.xlsx, confirmed in Phase 0):
 *   per bill line (department + designation + rate card):
 *     Total hrs = 8 Hrs + 4 Hrs + Double duty     (billable hours only: over-12 hours count only when approved)
 *     Net hrs   = Total hrs - Deduction hrs
 *     Duties    = Net hrs / 12
 *     Amount    = Duties x Rate per duty          (rounded to paise)
 *   Sub total = sum of amounts; Taxable = Sub total - Penalties; GST on the taxable amount (after penalties, as in the sample);
 *   Net = Taxable + GST; Net payable = Net rounded to the nearest rupee (Round off shown separately).
 *   A deduction of h hours is shown as 2/3 in "8hrs" and 1/3 in "4hrs" (sample: 24 h = 16 + 8).
 */
var OSCBill = (function () {
  'use strict';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function r2(n) { return Math.round((Number(n) || 0) * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100; }
  function r3(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function daysIn(ym) { return new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(); }
  function monthDates(ym) { var n = daysIn(ym), out = []; for (var d = 1; d <= n; d++) out.push(ym + '-' + pad(d)); return out; }
  function monthLabel(ym) { return MON[+ym.slice(5, 7) - 1] + '-' + ym.slice(0, 4); }
  function monthShort(ym) { return MON[+ym.slice(5, 7) - 1] + '-' + ym.slice(2, 4); }
  function fmtDate(iso) { return iso ? iso.slice(8, 10) + '-' + MON[+iso.slice(5, 7) - 1] + '-' + iso.slice(0, 4) : ''; }
  function prevMonth(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1; if (!m) { y--; m = 12; } return y + '-' + pad(m); }
  function isSupervisor(desig) { return /super/i.test(String(desig || '')); }
  /** Indian digit grouping: 1234567.5 -> "12,34,567.50". */
  function inr(n, dec) {
    dec = dec == null ? 2 : dec;
    var neg = n < 0, s = Math.abs(Number(n) || 0).toFixed(dec), parts = s.split('.'), x = parts[0];
    var last3 = x.slice(-3), rest = x.slice(0, -3);
    if (rest) last3 = ',' + last3;
    var g = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last3;
    return (neg ? '-' : '') + g + (parts[1] ? '.' + parts[1] : '');
  }

  // ---------- amount in words (Indian system) ----------
  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function two(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
  function three(n) { var h = Math.floor(n / 100), r = n % 100; return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : ''); }
  function intWords(n) {
    if (n === 0) return 'Zero';
    var out = [], crore = Math.floor(n / 10000000); n %= 10000000;
    if (crore) out.push((crore > 999 ? intWords(crore) : three(crore)) + ' Crore');
    var lakh = Math.floor(n / 100000); n %= 100000; if (lakh) out.push(two(lakh) + ' Lakh');
    var th = Math.floor(n / 1000); n %= 1000; if (th) out.push(two(th) + ' Thousand');
    if (n) out.push(three(n));
    return out.join(' ');
  }
  /** 637680 -> "Rupees Six Lakh Thirty Seven Thousand Six Hundred Eighty Only"; paise are added when present. */
  function words(amount) {
    var a = Math.abs(r2(amount)), rs = Math.floor(a + 1e-9), paise = Math.round((a - rs) * 100);
    return (amount < 0 ? 'Minus ' : '') + 'Rupees ' + intWords(rs) + (paise ? ' and ' + two(paise) + ' Paise' : '') + ' Only';
  }

  // ---------- totals ----------
  /** lines: [{amount, gstPct}], penalty: rupees. GST is charged on (sub total - penalties); penalties are shared pro rata when GST rates differ. */
  function totals(lines, penaltyTotal) {
    var gross = r2(lines.reduce(function (a, l) { return a + l.amount; }, 0)), pen = r2(penaltyTotal || 0), byPct = {};
    lines.forEach(function (l) { var k = String(Number(l.gstPct) || 0); byPct[k] = (byPct[k] || 0) + l.amount; });
    var taxable = r2(gross - pen), gstLines = [], gst = 0, pcts = Object.keys(byPct).sort(function (a, b) { return +b - +a; });
    pcts.forEach(function (k, i) {
      var share = gross ? byPct[k] / gross : (i === 0 ? 1 : 0), base = r2(byPct[k] - pen * share), g = r2(base * (+k) / 100);
      gstLines.push({ pct: +k, base: base, amount: g }); gst += g;
    });
    if (!pcts.length) gstLines.push({ pct: 0, base: taxable, amount: 0 });
    gst = r2(gst);
    var net = r2(taxable + gst), payable = Math.round(net), roundOff = r2(payable - net);
    return { gross: gross, penaltyTotal: pen, taxable: taxable, gstLines: gstLines, gst: gst, net: net, roundOff: roundOff, payable: payable, words: words(payable) };
  }

  /**
   * Builds the bill model for one department + company + month.
   * input: { ym, dept:{code,name}, company:{companyId,code,name,gstin,pan,address}, org:{name,address,gstin},
   *          staff:[{staffId,title,fullName,designation,dates:{iso:true}}]  (dates = days the person belonged to this department and company),
   *          days:[{staffId,date,h8,h4,dd,billable,pending,open,designation,ratePerDuty,gstPct}]  (h8/h4/dd = split of the billable hours),
   *          deductions:[{date,staffId,hours,reason}], penalties:[{date,staffId,name,reason,amount}],
   *          dutyHours (12), billNo, status ('DRAFT'|'FINAL'), generatedAt, generatedBy, version, signatures:[], footer }
   */
  function build(input) {
    var ym = input.ym, dept = input.dept || {}, dutyH = input.dutyHours || 12, dates = monthDates(ym), warnings = [], blockers = (input.blockers || []).slice();
    var staffById = {}; (input.staff || []).forEach(function (s) { staffById[s.staffId] = s; });
    var days = (input.days || []).filter(function (d) { return d.date && d.date.slice(0, 7) === ym; });
    var lineMap = {}, lines = [];
    function lineFor(desig, rate, gst) {
      var k = desig + '|' + (rate == null || rate === '' ? 'none' : Number(rate)) + '|' + (Number(gst) || 0);
      if (!lineMap[k]) {
        lineMap[k] = { key: k, designation: desig, label: (dept.code ? dept.code + ' ' : '') + desig, rate: rate == null || rate === '' ? null : Number(rate), gstPct: Number(gst) || 0,
          h8: 0, h4: 0, dd: 0, total: 0, dedH: 0, netH: 0, duties: 0, amount: 0, people: {} };
        lines.push(lineMap[k]);
      }
      return lineMap[k];
    }
    var dayIndex = {}, pending = 0, missingRate = {};
    days.forEach(function (d) {
      var desig = d.designation || (staffById[d.staffId] || {}).designation || 'Staff';
      var l = lineFor(desig, d.ratePerDuty, d.gstPct);
      l.h8 += Number(d.h8) || 0; l.h4 += Number(d.h4) || 0; l.dd += Number(d.dd) || 0; l.people[d.staffId] = 1;
      dayIndex[d.staffId + ':' + d.date] = { d: d, line: l };
      pending += Number(d.pending) || 0;
      if (l.rate == null && (Number(d.billable) || 0) > 0) missingRate[desig] = 1;
      if (d.open) blockers.push({ type: 'OPEN_DUTY', text: 'Duty without OUT on ' + fmtDate(d.date) + ' (' + ((staffById[d.staffId] || {}).fullName || d.staffId) + ')' });
    });
    Object.keys(missingRate).forEach(function (desig) { blockers.push({ type: 'NO_RATE', text: 'No rate card for ' + (dept.code || '') + ' ' + desig + ' in ' + monthLabel(ym) + '. Add it in Companies & rates.' }); });
    if (pending > 0) blockers.push({ type: 'PENDING_HOURS', text: r2(pending) + ' hours beyond 12 h are waiting for approval (not billed yet)' });

    // deductions: each goes to the line the person worked under that day (or their usual line)
    var dedRows = {}, dedList = [];
    (input.deductions || []).forEach(function (x) {
      var hit = dayIndex[x.staffId + ':' + x.date], l = hit ? hit.line : null;
      var s = staffById[x.staffId] || { fullName: x.name || x.staffId, designation: x.designation || 'Staff' };
      if (!l) l = lines.filter(function (y) { return y.people[x.staffId]; })[0] || lines.filter(function (y) { return y.designation === s.designation; })[0] || null;
      if (!l) { warnings.push('Deduction of ' + x.hours + ' h for ' + s.fullName + ' on ' + fmtDate(x.date) + ' has no duty this month, so it is not applied'); return; }
      l.dedH += Number(x.hours) || 0;
      var row = dedRows[x.staffId];
      if (!row) { row = dedRows[x.staffId] = { staffId: x.staffId, name: ((s.title ? s.title + ' ' : '') + (s.fullName || '')).trim(), designation: l.designation, hours: 0, items: [] }; dedList.push(row); }
      row.hours += Number(x.hours) || 0; row.items.push({ date: x.date, hours: Number(x.hours) || 0, reason: x.reason || '' });
    });
    dedList.forEach(function (r) { r.hours = r2(r.hours); r.h8 = r2(r.hours * 2 / 3); r.h4 = r2(r.hours - r.h8); });

    // order: supervisors first, then by designation, then by rate
    lines.sort(function (a, b) { return (isSupervisor(b.designation) - isSupervisor(a.designation)) || (a.designation < b.designation ? -1 : a.designation > b.designation ? 1 : (a.rate || 0) - (b.rate || 0)); });
    var sameDesig = {}; lines.forEach(function (l) { sameDesig[l.designation] = (sameDesig[l.designation] || 0) + 1; });
    lines.forEach(function (l) {
      l.h8 = r2(l.h8); l.h4 = r2(l.h4); l.dd = r2(l.dd); l.dedH = r2(l.dedH);
      l.total = r2(l.h8 + l.h4 + l.dd); l.netH = r2(l.total - l.dedH);
      l.duties = l.netH / dutyH; l.amount = r2(l.duties * (l.rate || 0));
      l.people = Object.keys(l.people).length;
      if (sameDesig[l.designation] > 1 && l.rate != null) l.label += ' @ ' + inr(l.rate);
      if (l.netH < 0) warnings.push('Deductions for ' + l.label + ' are more than the hours worked');
    });

    var penaltyRows = (input.penalties || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
      .map(function (p, i) { return { no: i + 1, date: p.date, staffId: p.staffId || '', name: p.name || '', reason: p.reason, amount: r2(p.amount) }; });
    var t = totals(lines, penaltyRows.reduce(function (a, p) { return a + p.amount; }, 0));

    // summary per date and staff grids
    var byDate = dates.map(function (iso) { return { date: iso, h8: 0, h4: 0, dd: 0, total: 0, duties: 0, ddCount: 0, ddNames: [] }; });
    var dateIdx = {}; dates.forEach(function (iso, i) { dateIdx[iso] = i; });
    var firstNames = {}; (input.staff || []).forEach(function (s) { var f = String(s.fullName || '').split(/\s+/)[0]; firstNames[f] = (firstNames[f] || 0) + 1; });
    function shortName(s) { var f = String(s.fullName || s.staffId).split(/\s+/)[0]; return firstNames[f] > 1 ? f + ' (' + s.staffId + ')' : f; }
    var gridStaff = (input.staff || []).slice().sort(function (a, b) {
      return (isSupervisor(b.designation) - isSupervisor(a.designation)) || (a.staffId < b.staffId ? -1 : 1);
    }).map(function (s, i) {
      var cells = {}, t8 = 0, t4 = 0, tdd = 0;
      dates.forEach(function (iso) {
        var hit = dayIndex[s.staffId + ':' + iso];
        if (hit) { var d = hit.d; cells[iso] = { h8: r2(d.h8), h4: r2(d.h4), dd: r2(d.dd) }; t8 += Number(d.h8) || 0; t4 += Number(d.h4) || 0; tdd += Number(d.dd) || 0; }
        else cells[iso] = s.dates && s.dates[iso] ? 'A' : '';
      });
      return { sr: i + 1, staffId: s.staffId, name: s.fullName, title: s.title || '', designation: s.designation, short: isSupervisor(s.designation) ? 'SUP' : (dept.code || 'STAFF'), cells: cells, t8: r2(t8), t4: r2(t4), tdd: r2(tdd) };
    });
    // people with duties but missing from the staff list (should not happen) still count in the summary
    days.forEach(function (d) {
      var row = byDate[dateIdx[d.date]]; if (!row) return;
      row.h8 += Number(d.h8) || 0; row.h4 += Number(d.h4) || 0; row.dd += Number(d.dd) || 0;
      if ((Number(d.dd) || 0) > 0) { row.ddCount++; row.ddNames.push(shortName(staffById[d.staffId] || { staffId: d.staffId })); }
    });
    byDate.forEach(function (r) { r.h8 = r2(r.h8); r.h4 = r2(r.h4); r.dd = r2(r.dd); r.total = r2(r.h8 + r.h4 + r.dd); r.duties = r.total / dutyH; });
    var sumT = byDate.reduce(function (a, r) { a.h8 += r.h8; a.h4 += r.h4; a.dd += r.dd; a.ddCount += r.ddCount; return a; }, { h8: 0, h4: 0, dd: 0, ddCount: 0 });
    sumT.h8 = r2(sumT.h8); sumT.h4 = r2(sumT.h4); sumT.dd = r2(sumT.dd); sumT.total = r2(sumT.h8 + sumT.h4 + sumT.dd); sumT.duties = sumT.total / dutyH;

    var totalHours = lines.reduce(function (a, l) { return { h8: a.h8 + l.h8, h4: a.h4 + l.h4, dd: a.dd + l.dd, total: a.total + l.total, dedH: a.dedH + l.dedH, netH: a.netH + l.netH, duties: a.duties + l.duties }; }, { h8: 0, h4: 0, dd: 0, total: 0, dedH: 0, netH: 0, duties: 0 });
    Object.keys(totalHours).forEach(function (k) { totalHours[k] = k === 'duties' ? totalHours[k] : r2(totalHours[k]); });

    return {
      ym: ym, monthLabel: monthLabel(ym), monthShort: monthShort(ym), from: dates[0], to: dates[dates.length - 1], dates: dates, dutyHours: dutyH,
      dept: dept, company: input.company || {}, org: input.org || {}, billNo: input.billNo || '', status: input.status || 'DRAFT',
      generatedAt: input.generatedAt || '', generatedBy: input.generatedBy || '', version: input.version || '', signatures: input.signatures || ['Prepared by', 'Checked by', 'Approved by'], footer: input.footer || '',
      lines: lines, hoursTotal: totalHours, deductionRows: dedList, penaltyRows: penaltyRows,
      gross: t.gross, penaltyTotal: t.penaltyTotal, taxable: t.taxable, gstLines: t.gstLines, gst: t.gst, net: t.net, roundOff: t.roundOff, payable: t.payable, words: t.words,
      summary: { byDate: byDate, totals: sumT }, grid: gridStaff,
      warnings: warnings, blockers: blockers, ready: !blockers.length
    };
  }

  /** What-if: same hours, other rates / GST / penalties. changes: {rates:{lineKey: rate}, gstPct, penaltyTotal}. */
  function whatIf(model, changes) {
    changes = changes || {};
    var lines = model.lines.map(function (l) {
      var rate = changes.rates && changes.rates[l.key] != null && changes.rates[l.key] !== '' ? Number(changes.rates[l.key]) : (l.rate || 0);
      var gst = changes.gstPct != null && changes.gstPct !== '' ? Number(changes.gstPct) : l.gstPct;
      return { key: l.key, label: l.label, duties: l.duties, rate: rate, gstPct: gst, amount: r2(l.duties * rate) };
    });
    var t = totals(lines, changes.penaltyTotal != null && changes.penaltyTotal !== '' ? Number(changes.penaltyTotal) : model.penaltyTotal);
    t.lines = lines; t.difference = r2(t.payable - model.payable);
    return t;
  }

  /** Excel day number for a date (1900 date system). */
  function excelDate(iso) { return (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000; }

  return { build: build, totals: totals, whatIf: whatIf, words: words, inr: inr, r2: r2, r3: r3, monthDates: monthDates, monthLabel: monthLabel, monthShort: monthShort,
    fmtDate: fmtDate, prevMonth: prevMonth, daysIn: daysIn, isSupervisor: isSupervisor, excelDate: excelDate };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OSCBill;
