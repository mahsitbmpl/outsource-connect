'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const OSCBill = require('../shared/billing.js');
const OSCPack = require('../shared/pack.js');
const OSCXlsx = require('../shared/xlsx.js');
const OSCPdf = require('../shared/pdf.js');
const { sampleInput } = require('./fixtures/bill-sample.js');

/** Reads a stored zip (what OSCXlsx writes) into {name: text}. */
function unzip(bytes) {
  const b = Buffer.from(bytes), out = {};
  let i = 0;
  while (b.readUInt32LE(i) === 0x04034b50) {
    const method = b.readUInt16LE(i + 8), size = b.readUInt32LE(i + 18), n = b.readUInt16LE(i + 26), x = b.readUInt16LE(i + 28);
    const name = b.slice(i + 30, i + 30 + n).toString('utf8'), data = b.slice(i + 30 + n + x, i + 30 + n + x + size);
    out[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    i += 30 + n + x + size;
  }
  return out;
}

test('sample month: same hours, duties and money as Sample_Sheet.xlsx (rounded to paise)', () => {
  const m = OSCBill.build(sampleInput());
  assert.equal(m.lines.length, 2);
  const [sup, st] = m.lines;
  assert.equal(sup.label, 'HK Supervisor');
  assert.deepEqual([sup.h8, sup.h4, sup.dd, sup.total, sup.dedH, sup.netH], [208, 103, 0, 311, 0, 311]);
  assert.equal(OSCBill.r3(sup.duties), 25.917);
  assert.equal(sup.amount, 20900.5);
  assert.equal(st.label, 'HK Staff');
  assert.deepEqual([st.h8, st.h4, st.dd, st.total, st.dedH, st.netH], [5431, 2701, 119.6, 8251.6, 24, 8227.6]);
  assert.equal(OSCBill.r3(st.duties), 685.633);
  assert.equal(st.amount, 548506.67);
  assert.equal(m.gross, 569407.17);
  assert.equal(m.penaltyTotal, 29000);
  assert.equal(m.taxable, 540407.17);
  assert.equal(m.gst, 97273.29);
  assert.equal(m.net, 637680.46);
  assert.equal(m.roundOff, -0.46);
  assert.equal(m.payable, 637680);
  assert.equal(m.words, 'Rupees Six Lakh Thirty Seven Thousand Six Hundred Eighty Only');
  assert.equal(m.penaltyRows.length, 9);
  assert.deepEqual(m.deductionRows.map((d) => [d.staffId, d.h8, d.h4, d.hours]), [['HK002', 16, 8, 24]]);
  // summary sheet includes every day (the sample left out 31-Oct by mistake)
  assert.equal(m.summary.byDate.length, 31);
  assert.equal(m.summary.totals.total, 8562.6);
  assert.equal(OSCBill.r3(m.summary.totals.duties), 713.55);
  assert.equal(m.summary.totals.ddCount, 10);
  assert.equal(m.ready, true);
});

test('amount in words and Indian grouping', () => {
  assert.equal(OSCBill.words(0), 'Rupees Zero Only');
  assert.equal(OSCBill.words(15), 'Rupees Fifteen Only');
  assert.equal(OSCBill.words(100000), 'Rupees One Lakh Only');
  assert.equal(OSCBill.words(10000000), 'Rupees One Crore Only');
  assert.equal(OSCBill.words(123456789.5), 'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only');
  assert.equal(OSCBill.words(1001), 'Rupees One Thousand One Only');
  assert.equal(OSCBill.inr(637680), '6,37,680.00');
  assert.equal(OSCBill.inr(12345678.9), '1,23,45,678.90');
  assert.equal(OSCBill.inr(999), '999.00');
  assert.equal(OSCBill.inr(-1234.5), '-1,234.50');
});

test('totals: GST after penalties, round off both ways, mixed GST shares penalties pro rata', () => {
  let t = OSCBill.totals([{ amount: 1000, gstPct: 18 }], 100);
  assert.deepEqual([t.taxable, t.gst, t.net, t.payable, t.roundOff], [900, 162, 1062, 1062, 0]);
  t = OSCBill.totals([{ amount: 100.55, gstPct: 18 }], 0); // 118.649 -> 118.65 -> 119
  assert.deepEqual([t.gst, t.net, t.payable, t.roundOff], [18.1, 118.65, 119, 0.35]);
  t = OSCBill.totals([{ amount: 1000, gstPct: 18 }, { amount: 1000, gstPct: 12 }], 200);
  assert.deepEqual(t.gstLines.map((g) => [g.pct, g.base, g.amount]), [[18, 900, 162], [12, 900, 108]]);
  assert.equal(t.gst, 270);
});

test('blockers: open duty, missing rate card, hours waiting for approval; absent marks only on working days', () => {
  const inp = sampleInput();
  inp.days.push({ staffId: 'HK003', date: '2026-10-31', h8: 8, h4: 0, dd: 0, billable: 8, pending: 5, open: true, designation: 'Trainee', ratePerDuty: '', gstPct: '' });
  inp.staff[2].dates = { '2026-10-30': true, '2026-10-31': true }; // joined on the 30th
  const m = OSCBill.build(inp);
  assert.equal(m.ready, false);
  assert.deepEqual(m.blockers.map((b) => b.type).sort(), ['NO_RATE', 'OPEN_DUTY', 'PENDING_HOURS']);
  const row = m.grid.find((g) => g.staffId === 'HK003');
  assert.equal(row.cells['2026-10-01'] === '' || typeof row.cells['2026-10-01'] === 'object', true);
  assert.ok(m.lines.some((l) => l.rate === null && l.designation === 'Trainee'));
});

test('what-if: other rates and GST on the same duties', () => {
  const m = OSCBill.build(sampleInput());
  const w = OSCBill.whatIf(m, { rates: { [m.lines[1].key]: 820 }, gstPct: 18 });
  assert.equal(w.lines[1].amount, Math.round(m.lines[1].duties * 820 * 100) / 100);
  assert.ok(w.difference > 0);
  assert.equal(OSCBill.whatIf(m, {}).payable, m.payable);
});

test('Excel pack: five tabs like the sample, values and formulas with stored results', () => {
  const m = OSCBill.build(sampleInput());
  const files = unzip(OSCPack.xlsx(m));
  const book = files['xl/workbook.xml'];
  ['Bill Details', 'Summary Sheet', '8 Hours Duty', '4 Hours Duty', 'Double Duty'].forEach((n) => assert.ok(book.includes('name="' + n + '"'), n));
  assert.ok(files['xl/sharedStrings.xml'].includes('HK Bill Oct-26'));
  assert.ok(files['xl/sharedStrings.xml'].includes('Rupees Six Lakh Thirty Seven Thousand Six Hundred Eighty Only'));
  assert.ok(files['xl/worksheets/sheet1.xml'].includes('<f>ROUND(D'), 'payable formula');
  assert.ok(files['xl/worksheets/sheet1.xml'].includes('<v>637680</v>'));
  assert.ok(files['xl/worksheets/sheet3.xml'].includes('TOTAL HOUR') || files['xl/sharedStrings.xml'].includes('TOTAL HOUR'));
  Object.keys(files).filter((n) => n.endsWith('.xml')).forEach((n) => assert.ok(/^<\?xml/.test(files[n]), n));
});

test('bill PDF: valid structure, text, DRAFT mark only on drafts', () => {
  const m = OSCBill.build(sampleInput());
  const s = Buffer.from(OSCPack.pdf(m)).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.ok(s.includes('(NET PAYABLE)'));
  assert.ok(s.includes('Rs. 6,37,680.00'));
  assert.ok(!s.includes('(DRAFT)'));
  const xref = +/startxref\n(\d+)/.exec(s)[1];
  assert.equal(s.slice(xref, xref + 4), 'xref');
  const d = Buffer.from(OSCPack.pdf(OSCBill.build(Object.assign(sampleInput(), { status: 'DRAFT' })))).toString('latin1');
  assert.ok(d.includes('(DRAFT)'));
});

test('writers: crc, utf8, text fitting', () => {
  assert.equal(OSCXlsx.crc32(Array.from(Buffer.from('123456789'))), 0xCBF43926);
  assert.deepEqual(OSCXlsx.utf8('₹'), [0xE2, 0x82, 0xB9]);
  assert.equal(OSCPdf.encode('₹5')[0], 82); // 'R' of 'Rs.'
  assert.ok(OSCPdf.width('Hello', 10) > 20);
  assert.ok(OSCPdf.fit('A very long staff name that will not fit', 60, 9).endsWith('...'));
});
