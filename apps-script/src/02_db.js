/* ===== 02 Db: tiny table layer over Google Sheets ===== */
var Db = (function () {
  var memo = {};        // per-execution cache: table -> rows
  var headerMemo = {};
  var ss_ = null;

  function ss() {
    if (ss_) return ss_;
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    ss_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
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
  function invalidate(table) {
    delete memo[table];
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

  function insert(table, obj) {
    var sh = sheet(table), h = headers(table);
    var row = objToRow(table, h, obj);
    var r = sh.getLastRow() + 1;
    sh.getRange(r, 1, 1, h.length).setValues([row]);
    invalidate(table);
    var out = {}; Object.keys(obj).forEach(function (k) { out[k] = obj[k]; }); out._row = r;
    return out;
  }
  function insertMany(table, objs) {
    if (!objs.length) return;
    var sh = sheet(table), h = headers(table);
    var rows = objs.map(function (o) { return objToRow(table, h, o); });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, h.length).setValues(rows);
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
    sh.appendRow(objToRow(table, h, obj));
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
    delete headerMemo[table];
    return added.map(function (c) { return c[0]; });
  }

  function reset() { memo = {}; headerMemo = {}; ss_ = null; }

  return {
    ss: ss, sheet: sheet, headers: headers, all: all, find: find, where: where, insert: insert,
    insertMany: insertMany, update: update, append: append, tail: tail, deleteWhere: deleteWhere,
    ensureTable: ensureTable, invalidate: invalidate, reset: reset, fromCell: fromCell, toCell: toCell
  };
})();

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail('BUSY', 'The system is busy. Please try again in a few seconds.');
  try { return fn(); } finally { lock.releaseLock(); }
}
