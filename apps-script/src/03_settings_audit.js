/* ===== 03 Settings and Audit ===== */
var Settings = {
  raw: function (key) {
    var r = Db.find('Settings', key);
    if (r) return r.value;
    return DEFAULT_SETTINGS[key] ? DEFAULT_SETTINGS[key][0] : '';
  },
  str: function (key) { return String(Settings.raw(key)); },
  int: function (key) { var n = parseInt(Settings.raw(key), 10); return isNaN(n) ? parseInt(DEFAULT_SETTINGS[key][0], 10) : n; },
  num: function (key) { var n = parseFloat(Settings.raw(key)); return isNaN(n) ? parseFloat(DEFAULT_SETTINGS[key][0]) : n; },
  bool: function (key) { return String(Settings.raw(key)).toLowerCase() === 'true'; },
  list: function (key) { return toList(Settings.raw(key)); },

  /** Public view for the console (no secrets live in Settings). */
  allForUi: function () {
    var rows = Db.all('Settings'), map = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      map[k] = { key: k, value: DEFAULT_SETTINGS[k][0], type: DEFAULT_SETTINGS[k][1], description: DEFAULT_SETTINGS[k][2] };
    });
    rows.forEach(function (r) { if (map[r.key]) { map[r.key].value = r.value; map[r.key].updatedAt = r.updatedAt; map[r.key].updatedBy = r.updatedBy; } });
    return Object.keys(map).map(function (k) { return map[k]; });
  },

  validateValue: function (key, value) {
    var def = DEFAULT_SETTINGS[key];
    if (!def) fail('VALIDATION', 'Unknown setting ' + key);
    var v = OSC.cleanText(value, 2000);
    switch (def[1]) {
      case 'int':
        if (!/^\d{1,6}$/.test(v)) failFields({ value: 'Enter a whole number' });
        break;
      case 'num':
        if (!/^\d{1,4}(\.\d{1,4})?$/.test(v)) failFields({ value: 'Enter a number, for example 0.45' });
        break;
      case 'bool':
        v = v.toLowerCase();
        if (v !== 'true' && v !== 'false') failFields({ value: 'Enter true or false' });
        break;
      case 'time':
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) failFields({ value: 'Use 24-hour HH:MM, for example 09:00' });
        break;
      case 'list':
        v = toList(v).join(',');
        if (/^email/.test(key)) {
          var bad = toList(v).filter(function (x) { return !OSC.isEmail(x); });
          if (bad.length) failFields({ value: 'Not a valid email: ' + bad.join(', ') });
        }
        if ((key === 'titles' || key === 'designations') && !v) failFields({ value: 'The list cannot be empty' });
        break;
    }
    return v;
  },

  update: function (user, key, value, reason) {
    var v = Settings.validateValue(key, value);
    if (key === 'designations') {
      var used = {}; Db.all('Staff').forEach(function (s) { used[s.designation] = 1; });
      var missing = Object.keys(used).filter(function (d) { return toList(v).indexOf(d) < 0; });
      if (missing.length) failFields({ value: 'Designation in use by staff, cannot remove: ' + missing.join(', ') });
    }
    return withLock(function () {
      var cur = Db.find('Settings', key);
      var now = Clock.now();
      if (cur) {
        var ch = Db.update('Settings', key, { value: v, updatedAt: now, updatedBy: user.username });
        Audit.log(user, 'settings.update', 'Settings', key, reason, { value: ch.before.value }, { value: v });
      } else {
        Db.insert('Settings', { key: key, value: v, type: DEFAULT_SETTINGS[key][1], description: DEFAULT_SETTINGS[key][2], updatedAt: now, updatedBy: user.username });
        Audit.log(user, 'settings.update', 'Settings', key, reason, null, { value: v });
      }
      return { key: key, value: v };
    });
  }
};

var Audit = {
  log: function (user, action, entity, entityId, reason, before, after) {
    Db.append('AuditLog', {
      auditId: newId('AU'), at: Clock.now(), username: user ? user.username : 'system',
      action: action, entity: entity, entityId: entityId || '', reason: reason || '',
      before: before == null ? '' : before, after: after == null ? '' : after
    });
  },
  recent: function (limit, filter) {
    var rows = Db.tail('AuditLog', Math.min(Math.max(limit || 200, 1), 1000));
    if (filter && filter.entity) rows = rows.filter(function (r) { return r.entity === filter.entity; });
    if (filter && filter.entityId) rows = rows.filter(function (r) { return r.entityId === filter.entityId; });
    return rows.map(function (r) { delete r._row; return r; });
  }
};

function requireReason(reason) {
  var r = OSC.cleanText(reason, 300);
  if (r.length < 3) failFields({ reason: 'Enter a reason (at least 3 characters)' });
  return r;
}
