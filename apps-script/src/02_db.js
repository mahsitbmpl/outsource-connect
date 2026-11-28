/* ===== 02 Db: tiny table layer over Google Sheets ===== */
var Db = (function () {
  var memo = {};        // per-execution cache: table -> rows
  var headerMemo = {};
  var ss_ = null;

  function ss() {
    if (ss_) return ss_;
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    // The script lives inside the Sheet, so the bound sheet is the quick way in; openById is the fallback.
    try { ss_ = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss_ = null; }
    if (!ss_ && id) ss_ = SpreadsheetApp.openById(id);
    if (!ss_) fail('SETUP', 'Spreadsheet not found. Run setup() from the script editor first.');
    return ss_;
  }
  function schema(table) {
    var s = SCHEMA[table];
    if (!s) fail('INTERNAL', 'Unknown table ' + table);
    return s;
  }
  function types(table) {
    var t = {};
    schema(table).cols.forEach(function (c) { t[c[0]] = c[1]; });
    return t;
  }
  function sheet(table) {
    var sh = ss().getSheetByName(table);
    if (!sh) fail('SETUP', 'Tab "' + table + '" is missing. Run setup() again.');
    return sh;
  }
  function headers(table) {
    if (headerMemo[table]) return headerMemo[table];
    var sh = sheet(table);
    var n = sh.getLastColumn();
    var h = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
    headerMemo[table] = h;
    return h;
  }

  function fromCell(type, v) {
    if (v === '' || v == null) return type === 'bool' ? false : (type === 'num' ? null : '');
    switch (type) {
      case 'num': var n = Number(v); return isFinite(n) ? n : null;
      case 'bool': return v === true || String(v).toLowerCase() === 'true';
      case 'date':
        if (Object.prototype.toString.call(v) === '[object Date]') return OSC.todayIST(v.getTime());
        return String(v).slice(0, 10);
      case 'datetime':
        if (Object.prototype.toString.call(v) === '[object Date]') return OSC.nowISTString(v.getTime());
        return String(v);
      case 'json':
        try { return JSON.parse(String(v)); } catch (e) { return String(v); }
      default: return OSC.unSheetSafe(String(v));
    }
  }
  function toCell(type, v) {
    if (v == null || v === '') return '';
    switch (type) {
      case 'num': var n = Number(v); return isFinite(n) ? n : '';
      case 'bool': return v === true || String(v).toLowerCase() === 'true';
      case 'json': return OSC.sheetSafe(clip(typeof v === 'string' ? v : JSON.stringify(v), 45000));
      default: return OSC.sheetSafe(clip(String(v), 45000));
    }
  }
  function rowToObj(table, h, row, rowNum) {
    var t = types(table), o = { _row: rowNum };
    for (var i = 0; i < h.length; i++) if (t[h[i]]) o[h[i]] = fromCell(t[h[i]], row[i]);
    return o;
  }
  function objToRow(table, h, obj) {
    var t = types(table);
    return h.map(function (name) { return t[name] ? toCell(t[name], obj[name]) : ''; });
  }

  function cacheKey(table) { return 'tbl:' + table; }
  /* Data version: changes after every save, so remembered answers (RESULT_CACHE in 16_speed.js) are never served stale.
   * Tables that change all the time but do not affect the console pages are left out. */
  var QUIET_TABLES = ['Sessions', 'LoginLog', 'Heartbeats', 'EmailLog', 'JobLog', 'Devices'];
  function touch(table) {
    if (QUIET_TABLES.indexOf(table) >= 0) return;
    try { CacheService.getScriptCache().put('DATA_VER', String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600); } catch (e) { /* cache unavailable: answers are just not remembered */ }
  }
  function invalidate(table) {
    delete memo[table];
    touch(table);
    if (CACHED_TABLES.indexOf(table) >= 0) {
      try { CacheService.getScriptCache().remove(cacheKey(table)); } catch (e) { /* ignore */ }
    }
  }

  function all(table) {
    if (memo[table]) return memo[table];
    var useCache = CACHED_TABLES.indexOf(table) >= 0, cache = null;
    if (useCache) {
      cache = CacheService.getScriptCache();
      var hit = cache.get(cacheKey(table));
      if (hit) { memo[table] = JSON.parse(hit); return memo[table]; }
    }
    var sh = sheet(table), h = headers(table), last = sh.getLastRow(), rows = [];
    if (last >= 2) {
      var vals = sh.getRange(2, 1, last - 1, h.length).getValues();
      for (var i = 0; i < vals.length; i++) {
        if (vals[i].join('') === '') continue;
        rows.push(rowToObj(table, h, vals[i], i + 2));
      }
    }
    memo[table] = rows;
    if (useCache) {
      var json = JSON.stringify(rows);
      if (json.length < 90000) { try { cache.put(cacheKey(table), json, 21600); } catch (e) { /* ignore */ } }
    }
    return rows;
  }
  function find(table, keyVal) {
    var k = schema(table).key;
    var rows = all(table);
    for (var i = 0; i < rows.length; i++) if (rows[i][k] === keyVal) return rows[i];
    return null;
  }
  function where(table, fn) { return all(table).filter(fn); }

  // ----- tamper evidence: chained SHA-256 over each new row of log tables (SCHEMA[t].chain) -----
  function rowHash(prev, h, row) {
    var parts = [prev || ''];
    for (var i = 0; i < h.length; i++) {
      if (h[i] === 'hash') continue;
      var v = row[i] == null ? '' : row[i];
      if (typeof v === 'string' && /^'[=+\-@\t\r]/.test(v)) v = v.slice(1); // Sheets may or may not keep the protective apostrophe
      parts.push(v === true ? 'true' : v === false ? 'false' : String(v));
    }
    var bytes = utf8Of(parts.join('\u001f'));
    var out = FastHash.sha256(bytes), hex = '';
    for (var j = 0; j < out.length; j++) hex += (out[j] < 16 ? '0' : '') + out[j].toString(16);
    return hex;
  }
  function utf8Of(str) { var o = []; for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); if (c < 128) o.push(c); else if (c < 2048) o.push(192 | c >> 6, 128 | c & 63); else o.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63); } return Uint8Array.from(o); }
  function chainHead(table) {
    var P = PropertiesService.getScriptProperties(), k = 'CHAIN_' + table, v = P.getProperty(k);
    if (v !== null) return v;
    var sh = sheet(table), h = headers(table), last = sh.getLastRow(), hi = h.indexOf('hash');
    return last >= 2 && hi >= 0 ? String(sh.getRange(last, hi + 1).getValues()[0][0] || '') : '';
  }
  function chainRows(table, h, rows) {
    if (!schema(table).chain) return rows;
    var hi = h.indexOf('hash'); if (hi < 0) return rows;
    return withLock(function () {
      var prev = chainHead(table);
      rows.forEach(function (row) { row[hi] = rowHash(prev, h, row); prev = row[hi]; });
      PropertiesService.getScriptProperties().setProperty('CHAIN_' + table, prev);
      return rows;
    });
  }

  function insert(table, obj) {
    var sh = sheet(table), h = headers(table), r;
    var write = function () { var row = chainRows(table, h, [objToRow(table, h, obj)])[0]; r = sh.getLastRow() + 1; sh.getRange(r, 1, 1, h.length).setValues([row]); };
    if (schema(table).chain) withLock(write); else write();
    invalidate(table);
    var out = {}; Object.keys(obj).forEach(function (k) { out[k] = obj[k]; }); out._row = r;
    return out;
  }
  function insertMany(table, objs) {
    if (!objs.length) return;
    var sh = sheet(table), h = headers(table);
    var rows = objs.map(function (o) { return objToRow(table, h, o); });
    if (schema(table).chain) withLock(function () { chainRows(table, h, rows); sh.getRange(sh.getLastRow() + 1, 1, rows.length, h.length).setValues(rows); });
    else sh.getRange(sh.getLastRow() + 1, 1, rows.length, h.length).setValues(rows);
    invalidate(table);
  }
  /** Updates a row found by key; returns {before, after}. */
  function update(table, keyVal, patch) {
    var cur = find(table, keyVal);
    if (!cur) fail('NOT_FOUND', table + ' ' + keyVal + ' not found');
    var before = {}, after = {};
    Object.keys(cur).forEach(function (k) { if (k !== '_row') { before[k] = cur[k]; after[k] = cur[k]; } });
    Object.keys(patch).forEach(function (k) { if (k !== '_row') after[k] = patch[k]; });
    var h = headers(table);
    sheet(table).getRange(cur._row, 1, 1, h.length).setValues([objToRow(table, h, after)]);
    invalidate(table);
    return { before: before, after: after };
  }
  /** Append-only tables (logs). */
  function append(table, obj) {
    var sh = sheet(table), h = headers(table);
    if (schema(table).chain) withLock(function () { sh.appendRow(chainRows(table, h, [objToRow(table, h, obj)])[0]); });
    else sh.appendRow(objToRow(table, h, obj));
    touch(table);
  }
  /** Re-checks a chained table: every row's hash must follow from the row before. Returns a short report. */
  function verifyChain(table) {
    var sh = sheet(table), h = headers(table), hi = h.indexOf('hash'), last = sh.getLastRow(), P = PropertiesService.getScriptProperties();
    var rep = { table: table, rows: Math.max(0, last - 1), checked: 0, notCovered: 0, ok: true, firstBadRow: null, problem: '' };
    if (hi < 0 || last < 2) return rep;
    var vals = sh.getRange(2, 1, last - 1, h.length).getValues(), prev = null;
    for (var i = 0; i < vals.length; i++) {
      var stored = String(vals[i][hi] || '');
      if (!stored) { if (prev === null) { rep.notCovered++; continue; } rep.ok = false; rep.firstBadRow = i + 2; rep.problem = 'Row without a check code after protected rows (row added by hand?)'; return rep; }
      if (prev === null) prev = P.getProperty('CHAIN_START_' + table) || '';
      var want = rowHash(prev, h, vals[i]);
      if (want !== stored) {
        // the first protected row may follow archived rows; accept it once if the start marker is unknown
        if (rep.checked === 0 && !P.getProperty('CHAIN_START_' + table)) { prev = stored; rep.checked++; continue; }
        rep.ok = false; rep.firstBadRow = i + 2; rep.problem = 'Row ' + (i + 2) + ' was changed, or a row before it was removed'; return rep;
      }
      prev = stored; rep.checked++;
    }
    var head = P.getProperty('CHAIN_' + table);
    if (head !== null && prev !== null && head !== prev) { rep.ok = false; rep.firstBadRow = last; rep.problem = 'The newest rows were removed or replaced'; }
    return rep;
  }
  /** Last n rows of a table, newest first, without reading the whole sheet. */
  function tail(table, n) {
    var sh = sheet(table), h = headers(table), last = sh.getLastRow();
    if (last < 2) return [];
    var start = Math.max(2, last - n + 1);
    var vals = sh.getRange(start, 1, last - start + 1, h.length).getValues();
    var out = [];
    for (var i = vals.length - 1; i >= 0; i--) out.push(rowToObj(table, h, vals[i], start + i));
    return out;
  }
  /** Deletes rows matching fn (bottom-up). Only for non-log tables. */
  function deleteWhere(table, fn) {
    if (schema(table).log) fail('INTERNAL', 'Log tables are append-only');
    var rows = all(table).filter(fn).sort(function (a, b) { return b._row - a._row; });
    var sh = sheet(table);
    rows.forEach(function (r) { sh.deleteRow(r._row); });
    invalidate(table);
    return rows.length;
  }

  /** Creates a tab or adds missing columns. Never removes or reorders. */
  function ensureTable(table) {
    var s = schema(table), book = ss();
    var sh = book.getSheetByName(table);
    if (!sh) sh = book.insertSheet(table);
    var lastCol = sh.getLastColumn();
    var existing = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    var added = [];
    s.cols.forEach(function (c) {
      if (existing.indexOf(c[0]) < 0) { existing.push(c[0]); added.push(c); }
    });
    if (added.length || !lastCol) {
      sh.getRange(1, 1, 1, existing.length).setValues([existing]);
      sh.getRange(1, 1, 1, existing.length).setFontWeight('bold').setBackground('#E2F2F0');
      sh.setFrozenRows(1);
    }
    // Keep text-like columns as plain text so Sheets never converts dates, numbers or formulas.
    s.cols.forEach(function (c) {
      if (['str', 'date', 'datetime', 'json'].indexOf(c[1]) >= 0) {
        var col = existing.indexOf(c[0]) + 1;
        sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat('@');
      }
    });
    // Google counts every cell of a tab towards the 10 million limit, so remove the empty columns a new tab comes with
    try { var maxC = sh.getMaxColumns(); if (maxC > existing.length) sh.deleteColumns(existing.length + 1, maxC - existing.length); } catch (e) { /* keep going */ }
    delete headerMemo[table];
    return added.map(function (c) { return c[0]; });
  }

  function reset() { memo = {}; headerMemo = {}; ss_ = null; }

  return {
    ss: ss, sheet: sheet, headers: headers, all: all, find: find, where: where, insert: insert,
    insertMany: insertMany, update: update, append: append, tail: tail, deleteWhere: deleteWhere,
    ensureTable: ensureTable, invalidate: invalidate, reset: reset, fromCell: fromCell, toCell: toCell, verifyChain: verifyChain, rowHash: rowHash, chainHead: chainHead, touch: touch
  };
})();

/* One script-wide lock. Nested calls in the same run reuse the lock instead of waiting for themselves. */
var LOCK_DEPTH = 0;
function withLock(fn, waitMs, onBusy) {
  if (LOCK_DEPTH > 0) { LOCK_DEPTH++; try { return fn(); } finally { LOCK_DEPTH--; } }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 20000)) { if (onBusy) return onBusy(); fail('BUSY', 'The system is busy. Please try again in a few seconds.'); }
  LOCK_DEPTH = 1;
  try { return fn(); } finally { LOCK_DEPTH = 0; lock.releaseLock(); }
}
