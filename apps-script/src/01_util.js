/* ===== 01 Util: errors, time, ids ===== */
function AppError(code, message, fields) {
  this.name = 'AppError';
  this.code = code;
  this.message = message;
  this.fields = fields || null;
}
AppError.prototype = Object.create(Error.prototype);

function fail(code, message, fields) { throw new AppError(code, message, fields); }
function failFields(fields) { throw new AppError('VALIDATION', 'Please correct the highlighted fields', fields); }

var Clock = {
  /** Overridable in tests. */
  nowMs: function () { return Date.now(); },
  now: function () { return OSC.nowISTString(Clock.nowMs()); },
  today: function () { return OSC.todayIST(Clock.nowMs()); }
};

function newId(prefix) {
  var u = Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
  return (prefix || '') + u;
}

function bytesToB64(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function b64ToBytes(s) {
  while (s.length % 4) s += '=';
  return Utilities.base64DecodeWebSafe(s);
}
function bytesToHex(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function sha256Hex(str) {
  return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8));
}
function randomBytes(n) {
  // Apps Script has no CSPRNG API; SHA-256 over several UUIDs (which are random v4) is the standard workaround.
  var out = [];
  while (out.length < n) {
    var seed = Utilities.getUuid() + Utilities.getUuid() + Clock.nowMs() + Math.random();
    out = out.concat(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed, Utilities.Charset.UTF_8));
  }
  return out.slice(0, n);
}
function isoPlusMinutes(minutes) {
  return OSC.nowISTString(Clock.nowMs() + minutes * 60000);
}
function isPast(iso) { return iso && Date.parse(iso) <= Clock.nowMs(); }

function toList(v) { return OSC.splitList(v); }
function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
