/* ===== 16 Speed: remembered answers for the console's read pages =====
 * A page asked again (by any user) is answered from Google's cache without opening the Sheet, as long as nothing was
 * saved since (the data version changes on every save, see Db.touch). Answers are stored compressed, in pieces.
 */
var Speed = (function () {
  // action -> seconds to keep. Short for pages that show live tablet status.
  var KEEP = {
    'dashboard': 60, 'home.summary': 120, 'staff.list': 900, 'staff.get': 900, 'companies.list': 900, 'companies.get': 900, 'departments.list': 900,
    'exceptions.list': 900, 'duties.list': 900, 'punches.byDate': 900, 'punches.range': 900, 'unrecognised.list': 900, 'rules.list': 900,
    'penalties.list': 900, 'deductions.list': 900, 'decide.list': 900, 'month.status': 900, 'month.preview': 900, 'month.bills': 900,
    'month.compare': 900, 'face.summary': 300, 'face.thumb': 900, 'meta.reasonCodes': 3600
  };
  var PIECE = 90000, MAX_PIECES = 10;
  function cache() { return CacheService.getScriptCache(); }
  function version() {
    var c = cache(), v = c.get('DATA_VER');
    if (!v) { v = String(Date.now()); c.put('DATA_VER', v, 21600); }
    return v;
  }
  function keyOf(user, action, data) {
    var raw = user.role + '|' + action + '|' + JSON.stringify(data || {});
    return 'RC:' + version() + ':' + Db.rowHash('', ['k'], [raw]).slice(0, 40);
  }
  function load(key) {
    var c = cache(), head = c.get(key);
    if (!head) return undefined;
    var n = parseInt(head, 10); if (!(n > 0)) return undefined;
    var keys = []; for (var i = 0; i < n; i++) keys.push(key + ':' + i);
    var got = c.getAll(keys), parts = [];
    for (var j = 0; j < n; j++) { if (got[keys[j]] == null) return undefined; parts.push(got[keys[j]]); }
    var bytes = Utilities.base64Decode(parts.join(''));
    return JSON.parse(Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString());
  }
  function save(key, value, seconds) {
    var json = JSON.stringify(value);
    var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, 'application/json')).getBytes());
    var n = Math.ceil(b64.length / PIECE); if (n > MAX_PIECES) return false;
    var put = {}; for (var i = 0; i < n; i++) put[key + ':' + i] = b64.slice(i * PIECE, (i + 1) * PIECE);
    cache().putAll(put, seconds); cache().put(key, String(n), seconds);
    return true;
  }
  /** Returns the remembered answer, or computes it and remembers it. Never fails because of the cache. */
  function remembered(user, action, data, compute) {
    var key = null;
    try { key = keyOf(user, action, data); var hit = load(key); if (hit !== undefined) { Speed.lastHit = true; return hit; } } catch (e) { key = key || null; }
    Speed.lastHit = false;
    var value = compute();
    if (key) { try { save(key, value, KEEP[action]); } catch (e) { /* too big or cache full: fine */ } }
    return value;
  }
  return { cacheable: function (a) { return !!KEEP[a]; }, remembered: remembered, version: version, lastHit: false };
})();
