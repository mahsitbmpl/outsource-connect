/*
 * Minimal in-memory imitation of the Google Apps Script services used by Code.gs,
 * so the exact file that gets deployed can be tested with Node.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const toSigned = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const toBuf = (v) => (Array.isArray(v) ? Buffer.from(v.map((b) => b & 0xff)) : Buffer.from(String(v), 'utf8'));

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.rows[this.r - 1 + i] || [];
      const vals = [];
      for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; vals.push(v === undefined ? '' : v); }
      out.push(vals);
    }
    return out;
  }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((row) => row.length !== this.nc)) throw new Error('setValues: dimension mismatch');
    vals.forEach((row, i) => {
      const ri = this.r - 1 + i;
      while (this.sheet.rows.length <= ri) this.sheet.rows.push([]);
      row.forEach((v, j) => { this.sheet.rows[ri][this.c - 1 + j] = v; });
    });
    this.sheet.writes++;
    return this;
  }
}
['setFontWeight', 'setBackground', 'setNumberFormat', 'setWrap', 'setHorizontalAlignment'].forEach((m) => { Range.prototype[m] = function () { return this; }; });

class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.writes = 0; }
  getName() { return this.name; }
  getLastRow() { for (let i = this.rows.length - 1; i >= 0; i--) if ((this.rows[i] || []).some((v) => v !== '' && v !== undefined && v !== null)) return i + 1; return 0; }
  getLastColumn() { return this.rows.reduce((m, r) => { let n = 0; (r || []).forEach((v, j) => { if (v !== '' && v !== undefined) n = j + 1; }); return Math.max(m, n); }, 0); }
  getMaxRows() { return Math.max(1000, this.rows.length); }
  getRange(r, c, nr, nc) { if (r < 1 || c < 1 || (nr || 1) < 1 || (nc || 1) < 1) throw new Error('getRange: bad args ' + [r, c, nr, nc]); return new Range(this, r, c, nr || 1, nc || 1); }
  appendRow(arr) { this.rows.splice(this.getLastRow(), 0, arr.slice()); this.writes++; return this; }
  deleteRow(r) { this.rows.splice(r - 1, 1); return this; }
  setFrozenRows() { return this; }
}

function makeEnv(opts) {
  opts = opts || {};
  const book = {
    sheets: [new Sheet('Sheet1')],
    getId: () => 'TEST_SHEET_ID',
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; },
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; },
    getSheets() { return this.sheets.slice(); },
    deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); },
    setSpreadsheetTimeZone() {}
  };
  const alerts = [];
  const cacheStore = new Map();
  const props = new Map();
  const folders = new Map();
  let folderSeq = 0;
  const files = new Map();
  const makeFolder = (name) => {
    const id = 'F' + (++folderSeq);
    const f = { name, files: [], getId: () => id, createFolder: (n) => makeFolder(n),
      createFile: (blob) => { const fid = 'FILE' + (files.size + 1); files.set(fid, blob); f.files.push(fid); return { getId: () => fid }; } };
    folders.set(id, f); return f;
  };

  const sandbox = {
    console: opts.quiet === false ? console : { log() {}, error() {}, warn() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book,
      openById: () => book,
      getUi: () => ({
        alert: (title, text) => { alerts.push({ title, text }); },
        ButtonSet: { OK: 'OK' },
        createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => { if (String(v).length > 100000) throw new Error('cache value too large'); cacheStore.set(k, String(v)); },
        remove: (k) => { cacheStore.delete(k); }
      })
    },
    ScriptApp: (() => { const trig = []; return { triggers: trig, getProjectTriggers: () => trig.slice(), deleteTrigger: (t) => { trig.splice(trig.indexOf(t), 1); },
      newTrigger: (fn) => { const b = { timeBased: () => b, everyMinutes: (m) => { b.m = m; return b; }, everyDays: () => b, atHour: () => b, create: () => { const t = { getHandlerFunction: () => fn, m: b.m }; trig.push(t); return t; } }; return b; } }; })(),
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)), deleteProperty: (k) => props.delete(k) }) },
    DriveApp: { createFolder: (n) => makeFolder(n), getFolderById: (id) => { if (!folders.has(id)) throw new Error('no folder'); return folders.get(id); },
      getFileById: (id) => { if (!files.has(id)) throw new Error('no file'); const b = files.get(id); return { getBlob: () => b }; } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, v) => toSigned(crypto.createHash(alg).update(toBuf(v)).digest()),
      computeHmacSha256Signature: (value, key) => toSigned(crypto.createHmac('sha256', toBuf(key)).update(toBuf(value)).digest()),
      base64EncodeWebSafe: (bytes) => toBuf(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: (s) => toSigned(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      newBlob: (s, mime, name) => ({ mime, name, getBytes: () => (Array.isArray(s) ? s.slice() : toSigned(Buffer.from(String(s), 'utf8'))) }),
      base64Decode: (s) => toSigned(Buffer.from(s, 'base64')),
      base64Encode: (bytes) => toBuf(bytes).toString('base64')
    },
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, isFinite, isNaN, parseInt, parseFloat
  };
  const ctx = vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'dist', 'Code.gs'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'Code.gs' });

  let now = opts.now != null ? opts.now : Date.parse('2026-11-20T11:00:00+05:30');
  vm.runInContext('Clock.nowMs = function () { return __now(); };', Object.assign(ctx, { __now: () => now }));

  const env = {
    ctx, book, alerts, cacheStore, props, files, folders,
    setNow: (iso) => { now = Date.parse(iso); },
    advanceMinutes: (m) => { now += m * 60000; },
    /** Call the HTTP API exactly like the console does. */
    call: (action, data, token) => {
      vm.runInContext('Db.reset()', ctx); // each HTTP request is a fresh execution (cache survives)
      const out = ctx.doPost({ postData: { contents: JSON.stringify({ action, data: data || {}, token }) } });
      return JSON.parse(out.content);
    },
    sheet: (n) => book.getSheetByName(n),
    newRequest: () => vm.runInContext('Db.reset()', ctx)
  };
  return env;
}

module.exports = { makeEnv };
