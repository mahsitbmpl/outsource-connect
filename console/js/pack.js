/*
 * OutSource Connect — month-end Excel pack (same tabs and layout as Sample_Sheet.xlsx) and bill PDF, from an OSCBill model.
 * Needs OSCXlsx, OSCPdf and OSCBill (loaded before this file). Plain ES2019, no imports.
 */
var OSCPack = (function () {
  'use strict';
  var X = typeof OSCXlsx !== 'undefined' ? OSCXlsx : require('./xlsx.js');
  var P = typeof OSCPdf !== 'undefined' ? OSCPdf : require('./pdf.js');
  var B = typeof OSCBill !== 'undefined' ? OSCBill : require('./billing.js');
  var YELLOW = 'FFFF00', INR_FMT = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';
  var col = X.colName;

  function fileBase(m) { return 'OSC_' + (m.dept.code || 'DEPT') + '_' + m.ym + '_' + (m.company.code || 'CO') + (m.status === 'FINAL' ? '' : '_DRAFT'); }

  // =============================== Excel ===============================
  function xlsx(m) {
    var wb = X.workbook();
    wb.title = (m.dept.code || '') + ' bill ' + m.monthLabel;
    var bd = { border: true }, hd = { b: true, border: true, fill: YELLOW, h: 'center', v: 'center', wrap: true };
    var num = function (fmt, extra) { return Object.assign({ border: true, fmt: fmt }, extra || {}); };
    var deptName = String(m.dept.name || m.dept.code || '').toUpperCase();
    var foot = '&L' + (m.org.name || '') + '&C' + (m.billNo || '') + '&RPage &P of &N';

    // ---------- Bill Details ----------
    var ws = wb.sheet('Bill Details', { widths: { A: 30, B: 15.7, C: 12, D: 18, E: 12, F: 15.5, G: 14, H: 18 }, footer: foot });
    ws.merge('A1:H1').set('A1', m.org.name || '', { b: true, sz: 12, h: 'center' });
    ws.merge('A2:D2', { border: true }).set('A2', m.dept.code + ' Bill ' + m.monthShort, { b: true, sz: 15, h: 'center', border: true });
    ws.row('A3', ['Particulars', 'Duties', 'Rates', 'Amount'], { b: true, sz: 12, border: true, fill: YELLOW });
    var info = [['Bill No', m.billNo || '(draft)'], ['Status', m.status === 'FINAL' ? 'Final (month locked)' : 'Draft (month open)'], ['Service provider', m.company.name || ''],
      ['Provider GSTIN', m.company.gstin || ''], ['Department', (m.dept.name || '') + ' (' + m.dept.code + ')'], ['Period', B.fmtDate(m.from) + ' to ' + B.fmtDate(m.to)],
      ['Generated', (m.generatedAt ? m.generatedAt.replace('T', ' ').slice(0, 16) : '') + (m.generatedBy ? ' by ' + m.generatedBy : '')]];
    info.forEach(function (r, i) { var row = 3 + i; ws.set('F' + row, r[0], { b: true, border: true, fill: 'E2F2F0', v: 'center' }); ws.merge('G' + row + ':H' + row, { border: true }).set('G' + row, r[1], { border: true, wrap: true, v: 'center', sz: 10 }); });

    var detailsStart = 0, r = 4, lineRows = [];
    // detail rows sit below the bill; compute their row numbers first so the bill can link to them
    var nLines = Math.max(1, m.lines.length);
    var billEnd = r + nLines + 7; // sub total, penalty, total, gst, net, round off, payable
    var detTitle = billEnd + 3; detailsStart = detTitle + 3;
    m.lines.forEach(function (l, i) {
      var dr = detailsStart + i;
      ws.set('A' + r, l.label, bd);
      ws.set('B' + r, { f: 'H' + dr, v: l.duties }, num('0.000'));
      ws.set('C' + r, l.rate == null ? 'NO RATE' : l.rate, num('#,##0.00', l.rate == null ? { color: 'B3261E', b: true } : null));
      ws.set('D' + r, { f: 'ROUND(B' + r + '*C' + r + ',2)', v: l.amount }, num(INR_FMT));
      lineRows.push(r); r++;
    });
    if (!m.lines.length) { ws.row('A' + r, ['No duties in this month', '', '', 0], [bd, bd, bd, num(INR_FMT)]); lineRows.push(r); r++; }
    var subR = r, penR = r + 1, totR = r + 2, gstR = r + 3, netR = r + 4, roR = r + 5, payR = r + 6;
    var lbl = function (row, text, extra) { ws.set('A' + row, text, Object.assign({ b: true, border: true }, extra || {})); ws.merge('B' + row + ':C' + row, { border: true }); };
    lbl(subR, 'Sub total'); ws.set('D' + subR, { f: 'SUM(D' + lineRows[0] + ':D' + lineRows[lineRows.length - 1] + ')', v: m.gross }, num(INR_FMT, { b: true }));
    lbl(penR, 'Penalty'); ws.set('D' + penR, m.penaltyTotal, num(INR_FMT));
    lbl(totR, 'Total'); ws.set('D' + totR, { f: 'D' + subR + '-D' + penR, v: m.taxable }, num(INR_FMT, { b: true }));
    var one = m.gstLines.length === 1;
    lbl(gstR, one ? 'GST (' + m.gstLines[0].pct + '%)' : 'GST (' + m.gstLines.map(function (g) { return g.pct + '%'; }).join(' + ') + ')');
    ws.set('D' + gstR, one ? { f: 'ROUND(D' + totR + '*' + m.gstLines[0].pct + '%,2)', v: m.gst } : m.gst, num(INR_FMT));
    lbl(netR, 'Net Amount'); ws.set('D' + netR, { f: 'D' + totR + '+D' + gstR, v: m.net }, num(INR_FMT, { b: true }));
    lbl(roR, 'Round off'); ws.set('D' + roR, { f: 'ROUND(D' + netR + ',0)-D' + netR, v: m.roundOff }, num('0.00'));
    lbl(payR, 'Net payable', { fill: 'E2F2F0', sz: 12 }); ws.set('D' + payR, { f: 'ROUND(D' + netR + ',0)', v: m.payable }, num(INR_FMT, { b: true, sz: 12, fill: 'E2F2F0' }));
    ws.merge('A' + (payR + 1) + ':H' + (payR + 1)).set('A' + (payR + 1), m.words, { i: true, b: true });

    // HK Details
    ws.merge('A' + detTitle + ':H' + detTitle, { border: true }).set('A' + detTitle, m.dept.code + ' Details', { b: true, sz: 15, fill: YELLOW, h: 'center', border: true });
    ws.merge('A' + (detTitle + 1) + ':H' + (detTitle + 1), { border: true }).set('A' + (detTitle + 1), m.monthShort, { b: true, sz: 15, fill: YELLOW, h: 'center', border: true });
    ws.row('A' + (detTitle + 2), ['Particulars', '8 Hrs', '4 Hrs', 'Double duty', 'Total Hrs', 'Deduction hours', 'Net Hours', 'Total Duties'], hd);
    ws.height(detTitle + 2, 30);
    m.lines.forEach(function (l, i) {
      var dr = detailsStart + i;
      ws.row('A' + dr, [l.label, l.h8, l.h4, l.dd, { f: 'B' + dr + '+C' + dr + '+D' + dr, v: l.total }, l.dedH, { f: 'E' + dr + '-F' + dr, v: l.netH }, { f: 'G' + dr + '/' + m.dutyHours, v: l.duties }],
        [bd, num('0.00'), num('0.00'), num('0.00'), num('0.00', { b: true }), num('0.00'), num('0.00', { b: true }), num('0.000', { b: true })]);
    });
    var dtot = detailsStart + m.lines.length;
    if (m.lines.length > 1) {
      var a = detailsStart, z = dtot - 1;
      ws.row('A' + dtot, ['Total'].concat(['B', 'C', 'D', 'E', 'F', 'G', 'H'].map(function (c) { var k = { B: 'h8', C: 'h4', D: 'dd', E: 'total', F: 'dedH', G: 'netH', H: 'duties' }[c]; return { f: 'SUM(' + c + a + ':' + c + z + ')', v: m.hoursTotal[k] }; })),
        [{ b: true, border: true }].concat([0, 1, 2, 3, 4, 5].map(function () { return num('0.00', { b: true }); })).concat([num('0.000', { b: true })]));
      dtot++;
    }

    // Deduction details
    var ded = dtot + 1;
    ws.merge('A' + ded + ':E' + ded, { border: true }).set('A' + ded, 'Deduction Duties details (' + m.monthShort + ')', { b: true, fill: YELLOW, h: 'center', border: true });
    ws.row('A' + (ded + 1), ['Staff Name', 'Designation', '8hrs', '4hrs', 'Total'], { b: true, border: true });
    var dr2 = ded + 2;
    if (!m.deductionRows.length) { ws.merge('A' + dr2 + ':E' + dr2, bd).set('A' + dr2, 'No deductions this month', { i: true, border: true }); dr2++; }
    m.deductionRows.forEach(function (d) {
      ws.row('A' + dr2, [d.name + ' (' + d.staffId + ')', d.designation, d.h8, d.h4, { f: 'C' + dr2 + '+D' + dr2, v: d.hours }], [bd, bd, num('0.00'), num('0.00'), num('0.00', { b: true })]);
      dr2++;
    });

    // Penalty remarks
    var pr = dr2 + 1;
    ws.set('A' + pr, 'Penalty Remarks', { b: true, sz: 14 });
    ws.merge('B' + pr + ':E' + pr).set('B' + pr, m.penaltyTotal, { b: true, sz: 14, fmt: INR_FMT, h: 'left' });
    if (!m.penaltyRows.length) { ws.merge('B' + (pr + 1) + ':E' + (pr + 1)).set('B' + (pr + 1), 'No penalties this month', { i: true }); pr++; }
    m.penaltyRows.forEach(function (p, i) {
      var row = pr + 1 + i;
      ws.set('A' + row, p.no, { h: 'center' });
      ws.merge('B' + row + ':H' + row).set('B' + row, p.reason + (p.name ? ' (' + p.name + ')' : '') + ' [' + B.fmtDate(p.date) + ']: ' + B.inr(p.amount, p.amount % 1 ? 2 : 0));
    });
    var sig = pr + Math.max(1, m.penaltyRows.length) + 3;
    signatures(ws, sig, m.signatures, ['A', 'C', 'F'], ['B', 'E', 'H']);

    // ---------- Summary Sheet ----------
    var n = m.dates.length, lastC = col(2 + n), widths = { A: 26 };
    for (var c = 2; c <= n + 1; c++) widths[col(c)] = 9.5;
    widths[lastC] = 12;
    var su = wb.sheet('Summary Sheet', { widths: widths, landscape: true, freeze: 'B5', footer: foot });
    su.merge('A1:' + lastC + '1').set('A1', 'Summary Sheet (' + m.dept.code + ')', { b: true, sz: 14, h: 'center' });
    su.merge('A2:' + lastC + '2').set('A2', (m.org.name || '') + ' · ' + (m.company.name || '') + ' · ' + m.monthLabel, { h: 'center' });
    su.merge('A3:' + lastC + '3');
    su.set('A4', 'Hrs/ Date', hd);
    m.dates.forEach(function (iso, i) { su.set({ r: 4, c: 2 + i }, B.excelDate(iso), { b: true, border: true, fill: YELLOW, fmt: 'dd-mmm', h: 'center' }); });
    su.set(lastC + '4', 'Total', hd);
    var S = m.summary;
    var rowsDef = [[5, '8hrs', 'h8', '0.00'], [6, '4hrs', 'h4', '0.00'], [7, 'Double Duty', 'dd', '0.00']];
    rowsDef.forEach(function (d) {
      su.set('A' + d[0], d[1], { b: true, border: true });
      S.byDate.forEach(function (x, i) { su.set({ r: d[0], c: 2 + i }, x[d[2]], num(d[3])); });
      su.set(lastC + d[0], { f: 'SUM(B' + d[0] + ':' + col(1 + n) + d[0] + ')', v: S.totals[d[2]] }, num(d[3], { b: true }));
    });
    su.set('A9', 'Total Hours', { b: true, border: true }); su.set('A10', 'Total Duties', { b: true, border: true }); su.set('A11', 'Double Duties', { b: true, border: true }); su.set('A12', ' Double Duties Staff Names', { b: true, border: true, wrap: true });
    S.byDate.forEach(function (x, i) {
      var cl = col(2 + i);
      su.set(cl + '9', { f: 'SUM(' + cl + '5:' + cl + '7)', v: x.total }, num('0.00', { b: true }));
      su.set(cl + '10', { f: cl + '9/' + m.dutyHours, v: x.duties }, num('0.000'));
      su.set(cl + '11', x.ddCount || '', num('0'));
      su.set(cl + '12', x.ddNames.join(','), { border: true, wrap: true, v: 'top', sz: 9 });
    });
    su.set(lastC + '9', { f: 'SUM(B9:' + col(1 + n) + '9)', v: S.totals.total }, num('0.00', { b: true }));
    su.set(lastC + '10', { f: lastC + '9/' + m.dutyHours, v: S.totals.duties }, num('0.000', { b: true }));
    su.set(lastC + '11', { f: 'SUM(B11:' + col(1 + n) + '11)', v: S.totals.ddCount }, num('0', { b: true }));
    su.set(lastC + '12', '', bd);
    su.height(12, 60);

    // ---------- 8 Hours / 4 Hours / Double Duty grids ----------
    grid(wb, m, '8 Hours Duty', 'h8', 't8', deptName, foot, false);
    grid(wb, m, '4 Hours Duty', 'h4', 't4', deptName, foot, false);
    grid(wb, m, 'Double Duty', 'dd', 'tdd', deptName, foot, true);
    return wb.build();
  }

  function signatures(ws, row, labels, starts, ends) {
    (labels || []).slice(0, starts.length).forEach(function (l, i) {
      ws.merge(starts[i] + row + ':' + ends[i] + (row + 3), { border: true });
      ws.set(starts[i] + row, l, { b: true, v: 'top', border: true });
    });
  }

  function grid(wb, m, title, key, totKey, deptName, foot, onlyWith) {
    var n = m.dates.length, totC = col(4 + n), widths = { A: 4.5, B: 24, C: 6 };
    for (var c = 4; c < 4 + n; c++) widths[col(c)] = key === 'dd' ? 5 : 5.5;
    widths[totC] = 13;
    var g = wb.sheet(title, { widths: widths, landscape: true, freeze: 'D5', footer: foot });
    g.merge('A1:' + totC + '1', { fill: YELLOW }).set('A1', (m.org.name || ''), { b: true, sz: 12, fill: YELLOW, h: 'center' });
    g.merge('A2:' + totC + '2', { fill: YELLOW }).set('A2', title + ' · ' + (m.dept.name || m.dept.code) + ' · ' + m.monthLabel + ' · ' + (m.company.name || ''), { b: true, fill: YELLOW, h: 'center' });
    g.merge('A3:' + totC + '3').set('A3', deptName + ' STAFF', { h: 'center' });
    var hd = { b: true, border: true, h: 'center' };
    g.set('A4', 'SR', hd); g.set('B4', 'NAME', hd); g.set('C4', '', hd);
    m.dates.forEach(function (iso, i) { g.set({ r: 4, c: 4 + i }, i + 1, hd); });
    g.set(totC + '4', 'TOTAL HOUR', hd);
    var people = m.grid.filter(function (s) { return !onlyWith || s[totKey] > 0; }), r = 5;
    if (!people.length) { g.merge('B5:' + totC + '5', { border: true }).set('B5', 'No ' + title.toLowerCase() + ' this month', { i: true, border: true }); r = 6; }
    people.forEach(function (s, idx) {
      g.set('A' + r, idx + 1, { border: true, h: 'center' });
      g.set('B' + r, s.name, { border: true });
      g.set('C' + r, s.short, { border: true, h: 'center' });
      m.dates.forEach(function (iso, i) {
        var v = s.cells[iso], val = v && typeof v === 'object' ? v[key] : (onlyWith ? 0 : v);
        g.set({ r: r, c: 4 + i }, val === '' ? null : val, val === 'A' ? { border: true, h: 'center', color: 'B3261E' } : { border: true, h: 'center', fmt: 'General' });
      });
      g.set(totC + r, { f: 'SUM(D' + r + ':' + col(3 + n) + r + ')', v: s[totKey] }, { border: true, b: true, fmt: '0.00' });
      r++;
    });
    var tr = r;
    g.set('B' + tr, 'Total', { b: true, border: true }); g.set('A' + tr, '', { border: true }); g.set('C' + tr, '', { border: true });
    m.dates.forEach(function (iso, i) {
      var cl = col(4 + i), v = m.summary.byDate[i][key];
      g.set(cl + tr, { f: 'SUM(' + cl + '5:' + cl + (tr - 1) + ')', v: v }, { b: true, border: true, h: 'center', fmt: 'General' });
    });
    g.set(totC + tr, { f: 'SUM(D' + tr + ':' + col(3 + n) + tr + ')', v: m.summary.totals[key] }, { b: true, border: true, fmt: '0.00' });
    // signature boxes, as in the sample (four boxes below the table)
    var sr = tr + 2, span = n + 1, w = Math.floor(span / 4);
    var starts = [col(3), col(3 + w), col(3 + 2 * w), col(3 + 3 * w)], ends = [col(2 + w), col(2 + 2 * w), col(2 + 3 * w), totC];
    signatures(g, sr, ['Prepared by', 'Checked by', 'Service provider', 'Approved by'], starts, ends);
  }

  // =============================== PDF ===============================
  var TEAL = [11, 107, 102], SOFT = [226, 242, 240], INK = [15, 30, 29], MUTED = [102, 116, 111], LINE = [200, 212, 209];
  function pdf(m) {
    var doc = P.doc({ title: m.dept.code + ' bill ' + m.monthLabel + ' ' + (m.company.name || '') }), L = 40, R = 555, Wd = R - L;
    var page, top, pages = [];
    function newPage(cont) {
      page = doc.page(); pages.push(page); top = 40;
      if (m.status !== 'FINAL') page.text(300, 520, 'DRAFT', { size: 110, bold: true, color: [232, 236, 235], angle: 35, align: 'center' });
      if (cont) {
        page.text(L, top, (m.org.name || '') + ' · Bill ' + (m.billNo || '(draft)') + ' (continued)', { size: 9, color: MUTED });
        top += 18;
      }
    }
    function need(h) { if (top + h > 842 - 60) newPage(true); }
    var t = function (x, y, s, o) { return page.text(x, y, s, o); };

    newPage(false);
    t(297.6, top + 4, m.org.name || '', { size: 16, bold: true, align: 'center', color: INK });
    top += 20;
    if (m.org.address) { t(297.6, top + 2, m.org.address, { size: 9, align: 'center', color: MUTED, maxWidth: Wd }); top += 13; }
    if (m.org.gstin) { t(297.6, top + 2, 'GSTIN: ' + m.org.gstin, { size: 9, align: 'center', color: MUTED }); top += 13; }
    top += 6;
    page.rect(L, top, Wd, 24, { fill: TEAL });
    t(297.6, top + 16, 'OUTSOURCED SERVICES BILL · ' + String(m.dept.name || m.dept.code).toUpperCase() + ' · ' + m.monthLabel.toUpperCase(), { size: 11.5, bold: true, align: 'center', color: [255, 255, 255] });
    top += 34;

    // info boxes
    var half = (Wd - 12) / 2, boxTop = top;
    var left = [['Service provider', m.company.name || '', true], ['Address', m.company.address || '-'], ['GSTIN', m.company.gstin || '-'], ['PAN', m.company.pan || '-']];
    var right = [['Bill No', m.billNo || '(draft, not final)', true], ['Bill month', m.monthLabel], ['Period', B.fmtDate(m.from) + ' to ' + B.fmtDate(m.to)], ['Department', (m.dept.name || '') + ' (' + m.dept.code + ')'], ['Status', m.status === 'FINAL' ? 'FINAL (month locked)' : 'DRAFT (month open)']];
    function infoBox(x, rows) {
      var y = boxTop + 14;
      rows.forEach(function (r) {
        t(x + 8, y, r[0], { size: 8, color: MUTED });
        var lines = P.wrap(r[1], half - 96, 9, !!r[2]).slice(0, 2);
        lines.forEach(function (ln, i) { t(x + 88, y + i * 11, ln, { size: 9, bold: !!r[2], color: INK }); });
        y += 11 * lines.length + 4;
      });
      return y;
    }
    var h1 = infoBox(L, left), h2 = infoBox(L + half + 12, right), bh = Math.max(h1, h2) - boxTop + 2;
    page.rect(L, boxTop, half, bh, { stroke: LINE }); page.rect(L + half + 12, boxTop, half, bh, { stroke: LINE });
    top = boxTop + bh + 16;

    // bill table
    section('Bill');
    var cols = [{ w: 24, label: '#', align: 'center' }, { w: 241, label: 'Particulars' }, { w: 70, label: 'Duties', align: 'right' }, { w: 80, label: 'Rate (Rs.)', align: 'right' }, { w: 100, label: 'Amount (Rs.)', align: 'right' }];
    table(cols, m.lines.map(function (l, i) { return [i + 1, l.label + '  (' + B.inr(l.netH) + ' h net)', B.r3(l.duties).toFixed(3), l.rate == null ? 'NO RATE' : B.inr(l.rate), B.inr(l.amount)]; }));
    var sumRows = [['Sub total', B.inr(m.gross), false], ['Less: Penalties (' + m.penaltyRows.length + ')', m.penaltyTotal ? '- ' + B.inr(m.penaltyTotal) : '0.00', false], ['Taxable amount', B.inr(m.taxable), true]];
    m.gstLines.forEach(function (g) {
      var split = sameState(m) && g.pct ? '  (CGST ' + g.pct / 2 + '% + SGST ' + g.pct / 2 + '%)' : '';
      sumRows.push(['GST @ ' + g.pct + '%' + split, B.inr(g.amount), false]);
    });
    sumRows.push(['Net amount', B.inr(m.net), true], ['Round off', (m.roundOff > 0 ? '+ ' : m.roundOff < 0 ? '- ' : '') + B.inr(Math.abs(m.roundOff)), false]);
    sumRows.forEach(function (r) {
      need(16);
      t(R - 108, top + 11, r[0], { size: 9, bold: r[2], align: 'right', color: INK });
      t(R - 6, top + 11, r[1], { size: 9, bold: r[2], align: 'right', color: INK });
      page.line(R - 290, top + 15, R, top + 15, { color: LINE, w: 0.4 });
      top += 16;
    });
    need(30);
    page.rect(R - 290, top + 2, 290, 22, { fill: SOFT, stroke: TEAL });
    t(R - 108, top + 17, 'NET PAYABLE', { size: 10.5, bold: true, align: 'right', color: TEAL });
    t(R - 6, top + 17, 'Rs. ' + B.inr(m.payable, 2), { size: 11, bold: true, align: 'right', color: TEAL });
    top += 32;
    need(26);
    page.rect(L, top, Wd, 20, { stroke: LINE });
    t(L + 8, top + 13.5, 'Amount in words: ', { size: 8.5, color: MUTED });
    t(L + 82, top + 13.5, m.words, { size: 9, bold: true, color: INK, maxWidth: Wd - 90 });
    top += 32;

    // hours and duties
    section('Hours and duties (' + m.monthLabel + ')');
    var hc = [{ w: 135, label: 'Particulars' }, { w: 50, label: '8 Hrs', align: 'right' }, { w: 50, label: '4 Hrs', align: 'right' }, { w: 55, label: 'Double', align: 'right' }, { w: 55, label: 'Total Hrs', align: 'right' }, { w: 60, label: 'Deduction', align: 'right' }, { w: 55, label: 'Net Hrs', align: 'right' }, { w: 55, label: 'Duties', align: 'right' }];
    var hr = m.lines.map(function (l) { return [l.label, B.inr(l.h8), B.inr(l.h4), B.inr(l.dd), B.inr(l.total), B.inr(l.dedH), B.inr(l.netH), B.r3(l.duties).toFixed(3)]; });
    if (m.lines.length > 1) { var T = m.hoursTotal; hr.push([{ s: 'Total', b: true }, B.inr(T.h8), B.inr(T.h4), B.inr(T.dd), B.inr(T.total), B.inr(T.dedH), B.inr(T.netH), B.r3(T.duties).toFixed(3)]); }
    table(hc, hr);
    top += 6;

    // deductions
    if (m.deductionRows.length) {
      section('Deduction details');
      var dc = [{ w: 24, label: '#', align: 'center' }, { w: 70, label: 'Date', align: 'left' }, { w: 160, label: 'Staff' }, { w: 70, label: 'Designation' }, { w: 45, label: 'Hours', align: 'right' }, { w: 146, label: 'Reason' }];
      var rows = [], k = 0;
      m.deductionRows.forEach(function (d) { d.items.forEach(function (it) { rows.push([++k, B.fmtDate(it.date), d.name + ' (' + d.staffId + ')', d.designation, B.inr(it.hours), it.reason]); }); });
      table(dc, rows); top += 6;
    }
    // penalties
    section('Penalty remarks');
    if (!m.penaltyRows.length) { need(16); t(L + 6, top + 10, 'No penalties this month.', { size: 9, color: MUTED }); top += 20; }
    else {
      var pc = [{ w: 24, label: '#', align: 'center' }, { w: 70, label: 'Date' }, { w: 321, label: 'Remark' }, { w: 100, label: 'Amount (Rs.)', align: 'right' }];
      var prs = m.penaltyRows.map(function (p) { return [p.no, B.fmtDate(p.date), p.reason + (p.name ? ' (' + p.name + ')' : ''), B.inr(p.amount)]; });
      prs.push(['', '', { s: 'Total penalties', b: true }, { s: B.inr(m.penaltyTotal), b: true }]);
      table(pc, prs); top += 6;
    }
    // notes and signatures
    need(110);
    t(L, top + 8, 'Duties = net hours / ' + m.dutyHours + '. Rates are per ' + m.dutyHours + '-hour duty, from the rate card in force on each date. GST is charged after penalties.', { size: 7.5, color: MUTED, maxWidth: Wd });
    t(L, top + 18, 'Hours come from face punches on the hospital tablet; corrections are recorded separately with reasons in the audit log.', { size: 7.5, color: MUTED, maxWidth: Wd });
    top += 34;
    var sigs = (m.signatures || []).slice(0, 4), sw = (Wd - (sigs.length - 1) * 14) / Math.max(1, sigs.length);
    sigs.forEach(function (s, i) {
      var x = L + i * (sw + 14);
      page.rect(x, top, sw, 62, { stroke: LINE });
      t(x + 8, top + 13, s, { size: 9, bold: true, color: INK });
      if (i === 0 && m.generatedBy) t(x + 8, top + 26, m.generatedBy, { size: 8, color: MUTED, maxWidth: sw - 16 });
      page.line(x + 8, top + 46, x + sw - 8, top + 46, { color: LINE });
      t(x + 8, top + 56, 'Signature and date', { size: 7, color: MUTED });
    });
    top += 70;

    // footers with page numbers
    pages.forEach(function (pg, i) {
      pg.line(L, 806, R, 806, { color: LINE, w: 0.4 });
      pg.text(L, 818, 'OutSource Connect ' + (m.version || '') + ' · generated ' + (m.generatedAt || '').replace('T', ' ').slice(0, 16) + (m.generatedBy ? ' by ' + m.generatedBy : ''), { size: 7, color: MUTED });
      pg.text(R, 818, 'Page ' + (i + 1) + ' of ' + pages.length, { size: 7, color: MUTED, align: 'right' });
      if (m.footer) pg.text(297.6, 830, m.footer, { size: 7, color: MUTED, align: 'center' });
    });
    return doc.build();

    function section(title) {
      need(40);
      t(L, top + 10, title, { size: 10.5, bold: true, color: TEAL });
      page.line(L, top + 14, R, top + 14, { color: TEAL, w: 0.8 });
      top += 20;
    }
    function table(cols, rows) {
      var rowH = 15, size = 8.5;
      function head() {
        page.rect(L, top, Wd, rowH + 2, { fill: SOFT });
        var x = L; cols.forEach(function (c) { cell(x, c, { s: c.label, b: true }, top + 11.5); x += c.w; });
        top += rowH + 2;
      }
      function cell(x, c, v, y) {
        var o = v && typeof v === 'object' ? v : { s: v }, s = o.s == null ? '' : String(o.s);
        var tx = c.align === 'right' ? x + c.w - 5 : c.align === 'center' ? x + c.w / 2 : x + 5;
        page.text(tx, y, s, { size: size, bold: !!o.b, align: c.align || 'left', color: INK, maxWidth: c.w - 8 });
      }
      need(rowH * 2 + 4); head();
      rows.forEach(function (r) {
        if (top + rowH > 842 - 60) { newPage(true); head(); }
        var x = L; cols.forEach(function (c, i) { cell(x, c, r[i], top + 10.5); x += c.w; });
        page.line(L, top + rowH, R, top + rowH, { color: LINE, w: 0.4 });
        top += rowH;
      });
      if (!rows.length) { page.text(L + 5, top + 10.5, 'None', { size: size, color: MUTED }); top += rowH; }
      top += 4;
    }
  }
  function sameState(m) {
    var a = String(m.org.gstin || '').slice(0, 2), b = String(m.company.gstin || '').slice(0, 2);
    return a && b && a === b;
  }

  return { xlsx: xlsx, pdf: pdf, fileBase: fileBase };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OSCPack;
