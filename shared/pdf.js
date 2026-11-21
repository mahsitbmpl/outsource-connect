/*
 * OutSource Connect — tiny PDF writer for bills. Plain ES2019, no imports; runs in Apps Script, the browser and Node.
 * A4 pages, Helvetica / Helvetica-Bold (built into every PDF reader, so nothing is embedded), text, lines, boxes.
 * Coordinates are points from the TOP-LEFT corner (1 pt = 1/72 inch; A4 = 595 x 842).
 * Text outside the Windows-1252 set is replaced: '₹' -> 'Rs.', other unknown characters -> '?'.
 *
 *   var doc = OSCPdf.doc({ title: 'Bill' });
 *   var p = doc.page();
 *   p.text(40, 60, 'Hello', { size: 14, bold: true });
 *   p.line(40, 70, 555, 70);
 *   var bytes = doc.build();
 */
var OSCPdf = (function () {
  'use strict';
  var W = { // widths per 1000 units, codes 32..255 (WinAnsiEncoding)
    R: '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500',
    B: '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556'
  };
  var WIDTH = { R: W.R.split(',').map(Number), B: W.B.split(',').map(Number) };
  // Unicode -> Windows-1252 for the characters that differ from Latin-1
  var CP = { 0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02C6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017D: 142,
    0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155, 0x0153: 156, 0x017E: 158, 0x0178: 159 };

  /** Text -> array of byte codes in WinAnsi. */
  function encode(str) {
    var s = String(str == null ? '' : str).replace(/₹\s?/g, 'Rs. ').replace(/[   ]/g, ' ').replace(/[\r\n\t]+/g, ' ');
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 32 && c <= 126) out.push(c);
      else if (c >= 160 && c <= 255) out.push(c);
      else if (CP[c]) out.push(CP[c]);
      else if (c >= 0xD800 && c <= 0xDBFF) { out.push(63); i++; }
      else out.push(63);
    }
    return out;
  }
  function width(str, size, bold) {
    var t = WIDTH[bold ? 'B' : 'R'], codes = encode(str), w = 0;
    for (var i = 0; i < codes.length; i++) w += codes[i] >= 32 ? t[codes[i] - 32] : 500;
    return w * (size || 10) / 1000;
  }
  /** Cuts text to fit a width, adding '...' when shortened. */
  function fit(str, maxW, size, bold) {
    str = String(str == null ? '' : str);
    if (width(str, size, bold) <= maxW) return str;
    while (str.length && width(str + '...', size, bold) > maxW) str = str.slice(0, -1);
    return str + '...';
  }
  /** Splits text into lines that fit a width. */
  function wrap(str, maxW, size, bold) {
    var words = String(str == null ? '' : str).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (width(t, size, bold) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines.map(function (l) { return fit(l, maxW, size, bold); });
  }
  function n2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '') || '0'; }
  function rgb(c) { c = c || [0, 0, 0]; return n2(c[0] / 255) + ' ' + n2(c[1] / 255) + ' ' + n2(c[2] / 255); }
  function lit(codes) {
    var s = '(';
    codes.forEach(function (c) { if (c === 40 || c === 41 || c === 92) s += '\\' + String.fromCharCode(c); else s += String.fromCharCode(c); });
    return s + ')';
  }

  function doc(opts) {
    opts = opts || {};
    var PW = opts.width || 595.28, PH = opts.height || 841.89, pages = [];
    function page() {
      var ops = [];
      var y = function (top) { return n2(PH - top); };
      var p = {
        width: PW, height: PH,
        text: function (x, top, str, o) {
          o = o || {};
          var size = o.size || 10, bold = !!o.bold, s = o.maxWidth ? fit(str, o.maxWidth, size, bold) : String(str == null ? '' : str);
          var w = width(s, size, bold), x0 = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
          if (o.angle) {
            var a = o.angle * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
            ops.push('BT ' + rgb(o.color) + ' rg /' + (bold ? 'F2' : 'F1') + ' ' + n2(size) + ' Tf ' + [cs, sn, -sn, cs].map(n2).join(' ') + ' ' + n2(x0) + ' ' + y(top) + ' Tm ' + lit(encode(s)) + ' Tj ET');
          } else ops.push('BT ' + rgb(o.color) + ' rg /' + (bold ? 'F2' : 'F1') + ' ' + n2(size) + ' Tf ' + n2(x0) + ' ' + y(top) + ' Td ' + lit(encode(s)) + ' Tj ET');
          return w;
        },
        line: function (x1, t1, x2, t2, o) { o = o || {}; ops.push(n2(o.w || 0.6) + ' w ' + rgb(o.color) + ' RG ' + n2(x1) + ' ' + y(t1) + ' m ' + n2(x2) + ' ' + y(t2) + ' l S'); },
        rect: function (x, top, w, h, o) {
          o = o || {};
          var r = n2(x) + ' ' + n2(PH - top - h) + ' ' + n2(w) + ' ' + n2(h) + ' re';
          if (o.fill && o.stroke) ops.push(rgb(o.fill) + ' rg ' + n2(o.w || 0.6) + ' w ' + rgb(o.stroke) + ' RG ' + r + ' B');
          else if (o.fill) ops.push(rgb(o.fill) + ' rg ' + r + ' f');
          else ops.push(n2(o.w || 0.6) + ' w ' + rgb(o.stroke) + ' RG ' + r + ' S');
        },
        _ops: ops
      };
      pages.push(p);
      return p;
    }
    function build() {
      var objs = [], n = 0;
      function obj(body) { objs.push(body); return ++n; }
      var cat = obj(''), pagesId = obj(''), f1 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      var kids = [];
      pages.forEach(function (p) {
        var content = p._ops.join('\n');
        var cId = obj('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
        kids.push(obj('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + n2(PW) + ' ' + n2(PH) + '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> >> /Contents ' + cId + ' 0 R >>'));
      });
      objs[cat - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
      objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map(function (k) { return k + ' 0 R'; }).join(' ') + '] /Count ' + kids.length + ' >>';
      var info = obj('<< /Title ' + lit(encode(opts.title || 'Document')) + ' /Producer (OutSource Connect) /Creator (OutSource Connect) >>');
      var s = '%PDF-1.4\n%âãÏÓ\n', offsets = [];
      objs.forEach(function (b, i) { offsets.push(s.length); s += (i + 1) + ' 0 obj\n' + b + '\nendobj\n'; });
      var xref = s.length;
      s += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map(function (o) { return ('000000000' + o).slice(-10) + ' 00000 n \n'; }).join('');
      s += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + cat + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
      var bytes = new Array(s.length);
      for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 255;
      return bytes;
    }
    return { page: page, build: build, pages: pages, width: PW, height: PH };
  }

  return { doc: doc, width: width, fit: fit, wrap: wrap, encode: encode };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OSCPdf;
