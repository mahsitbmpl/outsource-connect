/*
 * OutSource Connect — tiny Excel (.xlsx) writer. Plain ES2019, no imports; runs in Apps Script, the browser and Node.
 * Supports: several sheets, numbers, text, formulas with stored results, styles (font, fill, border, alignment,
 * number format), merged cells, column widths, row heights, frozen panes, print setup. Output: array of bytes 0..255.
 *
 *   var wb = OSCXlsx.workbook();
 *   var ws = wb.sheet('Bill Details', { widths: { A: 22, B: 14 }, landscape: false });
 *   ws.set('A1', 'Title', { b: true, sz: 15, fill: 'FFFF00', h: 'center' });
 *   ws.set('B2', { f: 'SUM(B3:B9)', v: 120 }, { fmt: '0.00', border: true });
 *   ws.merge('A1:D1');
 *   var bytes = wb.build();
 */
var OSCXlsx = (function () {
  'use strict';

  // ---------- helpers ----------
  function colName(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function parseRef(ref) { var m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) throw new Error('Bad cell ' + ref); return { c: colNum(m[1]), r: +m[2] }; }
  function ref(r, c) { return colName(c) + r; }
  function xml(s) {
    return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; })
      // characters Excel refuses inside XML
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
  }
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) { var d = str.charCodeAt(i + 1); if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; } }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  // ---------- zip (stored, no compression; every spreadsheet program accepts it) ----------
  var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var out = [], central = [], offset = 0;
    function u16(a, v) { a.push(v & 255, (v >>> 8) & 255); }
    function u32(a, v) { a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data), h = [];
      u32(h, 0x04034b50); u16(h, 20); u16(h, 0x0800); u16(h, 0); u16(h, 0); u16(h, 0x21); // time 0, date 1980-01-01
      u32(h, crc); u32(h, data.length); u32(h, data.length); u16(h, name.length); u16(h, 0);
      var c = [];
      u32(c, 0x02014b50); u16(c, 20); u16(c, 20); u16(c, 0x0800); u16(c, 0); u16(c, 0); u16(c, 0x21);
      u32(c, crc); u32(c, data.length); u32(c, data.length); u16(c, name.length); u16(c, 0); u16(c, 0); u16(c, 0); u16(c, 0); u32(c, 0); u32(c, offset);
      push(out, h); push(out, name); push(out, data);
      push(central, c); push(central, name);
      offset += h.length + name.length + data.length;
    });
    var end = [];
    u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, files.length); u16(end, files.length); u32(end, central.length); u32(end, offset); u16(end, 0);
    push(out, central); push(out, end);
    return out;
  }
  function push(a, b) { for (var i = 0; i < b.length; i++) a.push(b[i]); }

  // ---------- styles ----------
  function Styles() {
    var fonts = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    var borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], numFmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    var idx = { font: {}, fill: {}, border: {}, fmt: {}, xf: {} };
    var BUILTIN = { 'General': 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '@': 49 };
    function add(list, map, key, x) { if (map[key] == null) { map[key] = list.length; list.push(x); } return map[key]; }
    function fontId(s) {
      var key = [s.b ? 1 : 0, s.i ? 1 : 0, s.u ? 1 : 0, s.sz || 11, s.color || '', s.font || 'Calibri'].join('|');
      if (key === '0|0|0|11||Calibri') return 0;
      return add(fonts, idx.font, key, '<font>' + (s.b ? '<b/>' : '') + (s.i ? '<i/>' : '') + (s.u ? '<u/>' : '') + '<sz val="' + (s.sz || 11) + '"/>' +
        (s.color ? '<color rgb="FF' + s.color + '"/>' : '') + '<name val="' + xml(s.font || 'Calibri') + '"/><family val="2"/></font>');
    }
    function fillId(s) { if (!s.fill) return 0; return add(fills, idx.fill, s.fill, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + s.fill + '"/><bgColor indexed="64"/></patternFill></fill>'); }
    function borderId(s) {
      var b = s.border; if (!b) return 0;
      var st = b === 'medium' ? 'medium' : 'thin', side = function (n) { return '<' + n + ' style="' + st + '"><color auto="1"/></' + n + '>'; };
      return add(borders, idx.border, st, '<border>' + side('left') + side('right') + side('top') + side('bottom') + '<diagonal/></border>');
    }
    function fmtId(s) {
      if (!s.fmt) return 0;
      if (BUILTIN[s.fmt] != null) return BUILTIN[s.fmt];
      if (idx.fmt[s.fmt] == null) { idx.fmt[s.fmt] = 164 + numFmts.length; numFmts.push('<numFmt numFmtId="' + idx.fmt[s.fmt] + '" formatCode="' + xml(s.fmt) + '"/>'); }
      return idx.fmt[s.fmt];
    }
    function xfId(s) {
      if (!s) return 0;
      var f = fontId(s), fi = fillId(s), b = borderId(s), n = fmtId(s);
      var al = (s.h || s.v || s.wrap) ? '<alignment' + (s.h ? ' horizontal="' + s.h + '"' : '') + (s.v ? ' vertical="' + s.v + '"' : '') + (s.wrap ? ' wrapText="1"' : '') + '/>' : '';
      var key = [f, fi, b, n, al].join('|');
      if (key === '0|0|0|0|') return 0;
      return add(xfs, idx.xf, key, '<xf numFmtId="' + n + '" fontId="' + f + '" fillId="' + fi + '" borderId="' + b + '" xfId="0"' +
        (n ? ' applyNumberFormat="1"' : '') + (f ? ' applyFont="1"' : '') + (fi ? ' applyFill="1"' : '') + (b ? ' applyBorder="1"' : '') + (al ? ' applyAlignment="1">' + al + '</xf>' : '/>'));
    }
    function toXml() {
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.join('') + '</numFmts>' : '') +
        '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
        '<borders count="' + borders.length + '">' + borders.join('') + '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    }
    return { xfId: xfId, toXml: toXml };
  }

  // ---------- workbook ----------
  function workbook() {
    var sheets = [], styles = Styles(), sst = [], sstIdx = {}, sstCount = 0;
    function sharedString(s) { sstCount++; if (sstIdx[s] == null) { sstIdx[s] = sst.length; sst.push(s); } return sstIdx[s]; }

    function sheet(name, opts) {
      opts = opts || {};
      var safe = String(name).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31);
      if (sheets.some(function (s) { return s.name.toLowerCase() === safe.toLowerCase(); })) throw new Error('Duplicate sheet name ' + safe);
      var cells = {}, merges = [], heights = {}, widths = {};
      Object.keys(opts.widths || {}).forEach(function (k) { widths[colNum(k)] = opts.widths[k]; });
      var ws = {
        name: safe, opts: opts,
        set: function (at, value, style) {
          var p = typeof at === 'string' ? parseRef(at) : at;
          cells[p.r + ':' + p.c] = { r: p.r, c: p.c, v: value, s: style || null };
          return ws;
        },
        /** Writes a row of values starting at a cell; styles may be one object or an array. */
        row: function (at, values, style) {
          var p = parseRef(at);
          values.forEach(function (v, i) { ws.set({ r: p.r, c: p.c + i }, v, Array.isArray(style) ? style[i] : style); });
          return ws;
        },
        /** Gives every cell in a range a style (keeps values); used for borders around merged cells. */
        style: function (range, style) {
          var a = range.split(':'), p = parseRef(a[0]), q = parseRef(a[1] || a[0]);
          for (var r = p.r; r <= q.r; r++) for (var c = p.c; c <= q.c; c++) { var k = r + ':' + c; if (cells[k]) cells[k].s = Object.assign({}, cells[k].s || {}, style); else cells[k] = { r: r, c: c, v: null, s: style }; }
          return ws;
        },
        merge: function (range, style) { merges.push(range); if (style) ws.style(range, style); return ws; },
        height: function (r, h) { heights[r] = h; return ws; },
        width: function (col, w) { widths[typeof col === 'string' ? colNum(col) : col] = w; return ws; },
        get: function (at) { var p = parseRef(at); var x = cells[p.r + ':' + p.c]; return x ? x.v : undefined; }
      };
      ws._cells = cells; ws._merges = merges; ws._heights = heights; ws._widths = widths;
      sheets.push(ws);
      return ws;
    }

    function cellXml(x) {
      var s = styles.xfId(x.s), a = ' r="' + ref(x.r, x.c) + '"' + (s ? ' s="' + s + '"' : ''), v = x.v;
      if (v == null || v === '') return '<c' + a + '/>';
      if (typeof v === 'object' && v.f) {
        var res = v.v;
        if (typeof res === 'number' && isFinite(res)) return '<c' + a + '><f>' + xml(v.f) + '</f><v>' + num(res) + '</v></c>';
        if (typeof res === 'string') return '<c' + a + ' t="str"><f>' + xml(v.f) + '</f><v>' + xml(res) + '</v></c>';
        return '<c' + a + '><f>' + xml(v.f) + '</f></c>';
      }
      if (typeof v === 'number') return isFinite(v) ? '<c' + a + '><v>' + num(v) + '</v></c>' : '<c' + a + '/>';
      if (typeof v === 'boolean') return '<c' + a + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
      return '<c' + a + ' t="s"><v>' + sharedString(String(v)) + '</v></c>';
    }
    function num(n) { var s = String(Math.round(n * 1e10) / 1e10); return s; }

    function sheetXml(ws) {
      var list = Object.keys(ws._cells).map(function (k) { return ws._cells[k]; }).sort(function (a, b) { return a.r - b.r || a.c - b.c; });
      var maxR = 1, maxC = 1; list.forEach(function (x) { if (x.r > maxR) maxR = x.r; if (x.c > maxC) maxC = x.c; });
      var rows = {}; list.forEach(function (x) { (rows[x.r] = rows[x.r] || []).push(x); });
      Object.keys(ws._heights).forEach(function (r) { rows[r] = rows[r] || []; });
      var o = ws.opts, out = [];
      out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
      out.push('<sheetPr>' + (o.tab ? '<tabColor rgb="FF' + o.tab + '"/>' : '') + '<pageSetUpPr fitToPage="1"/></sheetPr>');
      out.push('<dimension ref="A1:' + ref(maxR, maxC) + '"/>');
      var sv = '<sheetView workbookViewId="0"' + (sheets.indexOf(ws) === 0 ? ' tabSelected="1"' : '') + (o.zoom ? ' zoomScale="' + o.zoom + '"' : '') + (o.gridlines === false ? ' showGridLines="0"' : '') + '>';
      if (o.freeze) {
        var f = parseRef(o.freeze), xs = f.c - 1, ys = f.r - 1;
        if (xs || ys) sv += '<pane' + (xs ? ' xSplit="' + xs + '"' : '') + (ys ? ' ySplit="' + ys + '"' : '') + ' topLeftCell="' + o.freeze + '" activePane="' + (xs && ys ? 'bottomRight' : xs ? 'topRight' : 'bottomLeft') + '" state="frozen"/>';
      }
      out.push('<sheetViews>' + sv + '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>');
      var wcols = Object.keys(ws._widths).map(Number).sort(function (a, b) { return a - b; });
      if (wcols.length) out.push('<cols>' + wcols.map(function (c) { return '<col min="' + c + '" max="' + c + '" width="' + ws._widths[c] + '" customWidth="1"/>'; }).join('') + '</cols>');
      out.push('<sheetData>');
      Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
        var h = ws._heights[r];
        out.push('<row r="' + r + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>' + rows[r].sort(function (a, b) { return a.c - b.c; }).map(cellXml).join('') + '</row>');
      });
      out.push('</sheetData>');
      if (ws._merges.length) out.push('<mergeCells count="' + ws._merges.length + '">' + ws._merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>');
      out.push('<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>');
      out.push('<pageSetup paperSize="9" orientation="' + (o.landscape ? 'landscape' : 'portrait') + '" fitToWidth="1" fitToHeight="0"/>');
      if (o.footer) out.push('<headerFooter><oddFooter>' + xml(o.footer) + '</oddFooter></headerFooter>');
      out.push('</worksheet>');
      return out.join('');
    }

    function build() {
      if (!sheets.length) throw new Error('Workbook has no sheets');
      var sheetFiles = sheets.map(function (ws, i) { return { name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: utf8(sheetXml(ws)) }; });
      var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
      var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
      var book = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + xml(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets>' +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
      var n = sheets.length;
      var bookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '<Relationship Id="rId' + (n + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>';
      var sstXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + sstCount + '" uniqueCount="' + sst.length + '">' +
        sst.map(function (s) { return '<si><t xml:space="preserve">' + xml(s) + '</t></si>'; }).join('') + '</sst>';
      var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + xml(api.title || '') + '</dc:title><dc:creator>OutSource Connect</dc:creator></cp:coreProperties>';
      var app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>OutSource Connect</Application></Properties>';
      var styleXml = styles.toXml(); // after sheets (styles are collected while writing cells)
      return zip([
        { name: '[Content_Types].xml', data: utf8(ct) }, { name: '_rels/.rels', data: utf8(rels) },
        { name: 'docProps/core.xml', data: utf8(core) }, { name: 'docProps/app.xml', data: utf8(app) },
        { name: 'xl/workbook.xml', data: utf8(book) }, { name: 'xl/_rels/workbook.xml.rels', data: utf8(bookRels) }
      ].concat(sheetFiles).concat([{ name: 'xl/styles.xml', data: utf8(styleXml) }, { name: 'xl/sharedStrings.xml', data: utf8(sstXml) }]));
    }
    var api = { sheet: sheet, build: build, title: '' };
    return api;
  }

  return { workbook: workbook, colName: colName, colNum: colNum, ref: ref, zip: zip, crc32: crc32, utf8: utf8 };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OSCXlsx;
