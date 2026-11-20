/* ===== 04 Auth: passwords, sessions, users ===== */
var Auth = (function () {

  // ----- PBKDF2-HMAC-SHA256 (single 32-byte block) -----
  function strBytes(s) { return Utilities.newBlob(String(s)).getBytes(); }
  function hmac(keyBytes, msgBytes) { return Utilities.computeHmacSha256Signature(msgBytes, keyBytes); }
  function pbkdf2(password, saltBytes, iterations) {
    var pw = strBytes(password);
    var u = hmac(pw, saltBytes.concat([0, 0, 0, 1]));
    var t = u.slice();
    for (var i = 1; i < iterations; i++) {
      u = hmac(pw, u);
      for (var j = 0; j < t.length; j++) t[j] = t[j] ^ u[j];
    }
    return t.map(function (b) { b = b & 0xff; return b > 127 ? b - 256 : b; });
  }
  function hashPassword(password, iterations) {
    iterations = iterations || PBKDF2_ITERATIONS;
    var salt = randomBytes(16);
    return 'pbkdf2-sha256$' + iterations + '$' + bytesToB64(salt) + '$' + bytesToB64(pbkdf2(password, salt, iterations));
  }
  function verifyPassword(password, stored) {
    var p = String(stored || '').split('$');
    if (p.length !== 4 || p[0] !== 'pbkdf2-sha256') return false;
    var got = bytesToB64(pbkdf2(password, b64ToBytes(p[2]), parseInt(p[1], 10)));
    var want = p[3], diff = got.length ^ want.length;
    for (var i = 0; i < Math.min(got.length, want.length); i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
    return diff === 0;
  }
  /** Readable temporary password, e.g. 'Kite-4827-Rams' (14 chars, letters and digits). */
  function tempPassword() {
    var words = ['Kite', 'Lamp', 'Rose', 'Mint', 'Ruby', 'Jade', 'Neem', 'Tulsi', 'Lotus', 'Mango', 'Pearl', 'River', 'Cedar', 'Amber', 'Coral', 'Sagar'];
    var b = randomBytes(6);
    var n = ((b[0] & 0xff) * 256 + (b[1] & 0xff)) % 9000 + 1000;
    return words[(b[2] & 0xff) % words.length] + '-' + n + '-' + words[(b[3] & 0xff) % words.length] + ((b[4] & 0xff) % 10);
  }

  // ----- sessions -----
  function cache() { return CacheService.getScriptCache(); }
  function publicUser(u) { return { username: u.username, fullName: u.fullName, role: u.role, mustChange: !!u.mustChange }; }

  function login(username, password, userAgent) {
    username = OSC.cleanText(username).toLowerCase();
    var ua = clip(userAgent || '', 200);
    if (!username || !password) fail('AUTH', 'Enter username and password');
    return withLock(function () {
      var u = Db.find('Users', username);
      if (!u || !u.active) {
        Db.append('LoginLog', { at: Clock.now(), username: username, result: 'FAIL', detail: u ? 'disabled' : 'unknown user', userAgent: ua });
        fail('AUTH', 'Wrong username or password');
      }
      if (u.lockedUntil && !isPast(u.lockedUntil)) {
        Db.append('LoginLog', { at: Clock.now(), username: username, result: 'LOCKED', detail: 'until ' + u.lockedUntil, userAgent: ua });
        fail('LOCKED', 'Account locked after too many wrong passwords. Try again after ' + OSC.fmtDateTime(u.lockedUntil) + ' or ask the Admin to unlock it.');
      }
      if (!verifyPassword(password, u.pwHash)) {
        var count = (u.failedCount || 0) + 1, patch = { failedCount: count };
        var limit = Settings.int('lockoutAttempts');
        if (count >= limit) { patch.lockedUntil = isoPlusMinutes(Settings.int('lockoutMinutes')); patch.failedCount = 0; }
        Db.update('Users', username, patch);
        Db.append('LoginLog', { at: Clock.now(), username: username, result: patch.lockedUntil ? 'LOCKED' : 'FAIL', detail: 'wrong password ' + count + '/' + limit, userAgent: ua });
        if (patch.lockedUntil) fail('LOCKED', 'Too many wrong passwords. The account is locked for ' + Settings.int('lockoutMinutes') + ' minutes.');
        fail('AUTH', 'Wrong username or password');
      }
      var okPatch = { failedCount: 0, lockedUntil: '', lastLoginAt: Clock.now() };
      if (String(u.pwHash).split('$')[1] !== String(PBKDF2_ITERATIONS)) okPatch.pwHash = hashPassword(password); // upgrade/downgrade rounds
      Db.update('Users', username, okPatch);
      var token = bytesToB64(randomBytes(32));
      var sid = sha256Hex(token);
      var sess = { sid: sid, username: username, createdAt: Clock.now(), expiresAt: isoPlusMinutes(Settings.int('sessionHours') * 60), lastSeenAt: Clock.now(), revoked: false, userAgent: ua };
      Db.insert('Sessions', sess);
      putCache(sess);
      Db.append('LoginLog', { at: Clock.now(), username: username, result: 'OK', detail: '', userAgent: ua });
      return { token: token, user: publicUser(u), expiresAt: sess.expiresAt };
    });
  }
  function putCache(sess) {
    try { cache().put('sess:' + sess.sid, JSON.stringify({ username: sess.username, expiresAt: sess.expiresAt, lastSeenAt: sess.lastSeenAt, revoked: !!sess.revoked }), 21600); } catch (e) { /* ignore */ }
  }

  /** Returns the user for a token or throws AUTH. Updates idle timer. */
  function check(token) {
    if (!token || typeof token !== 'string' || token.length < 20) fail('AUTH', 'Please sign in');
    var sid = sha256Hex(token);
    var c = cache().get('sess:' + sid), s;
    if (c) s = JSON.parse(c);
    else {
      var row = Db.find('Sessions', sid);
      if (!row) fail('AUTH', 'Please sign in');
      s = { username: row.username, expiresAt: row.expiresAt, lastSeenAt: row.lastSeenAt, revoked: row.revoked };
    }
    if (s.revoked) fail('AUTH', 'You have been signed out. Please sign in again.');
    if (isPast(s.expiresAt)) fail('AUTH', 'Your session has ended. Please sign in again.');
    var idleMs = Settings.int('sessionIdleMinutes') * 60000;
    if (Clock.nowMs() - Date.parse(s.lastSeenAt) > idleMs) fail('AUTH', 'Signed out after ' + Settings.int('sessionIdleMinutes') + ' idle minutes. Please sign in again.');
    var u = Db.find('Users', s.username);
    if (!u || !u.active) fail('AUTH', 'Your account is disabled');
    var nowMs = Clock.nowMs(), prev = Date.parse(s.lastSeenAt);
    s.lastSeenAt = Clock.now();
    s.sid = sid;
    putCache(s);
    if (nowMs - prev > 5 * 60000) { try { Db.update('Sessions', sid, { lastSeenAt: s.lastSeenAt }); } catch (e) { /* row may be missing */ } }
    return { username: u.username, fullName: u.fullName, role: u.role, mustChange: !!u.mustChange, sid: sid };
  }

  function logout(user) {
    withLock(function () {
      Db.update('Sessions', user.sid, { revoked: true });
      try { cache().remove('sess:' + user.sid); } catch (e) { /* ignore */ }
    });
    return { done: true };
  }
  function revokeAll(username) {
    Db.where('Sessions', function (s) { return s.username === username && !s.revoked; }).forEach(function (s) {
      Db.update('Sessions', s.sid, { revoked: true });
      try { cache().remove('sess:' + s.sid); } catch (e) { /* ignore */ }
    });
  }

  function changePassword(user, oldPw, newPw) {
    var u = Db.find('Users', user.username);
    if (!verifyPassword(oldPw || '', u.pwHash)) failFields({ oldPassword: 'Current password is wrong' });
    var probs = OSC.validatePassword(newPw, u.username, Settings.int('passwordMinLength'));
    if (probs.length) failFields({ newPassword: 'Password needs ' + probs.join(', ') });
    if (verifyPassword(newPw, u.pwHash)) failFields({ newPassword: 'Choose a password different from the current one' });
    withLock(function () {
      Db.update('Users', u.username, { pwHash: hashPassword(newPw), mustChange: false, pwChangedAt: Clock.now(), updatedAt: Clock.now(), updatedBy: u.username });
    });
    Audit.log(user, 'auth.changePassword', 'Users', u.username, '', null, null);
    return { done: true };
  }

  // ----- user admin -----
  function listUsers() {
    return Db.all('Users').map(function (u) {
      return { username: u.username, fullName: u.fullName, role: u.role, active: u.active, mustChange: u.mustChange,
        locked: !!(u.lockedUntil && !isPast(u.lockedUntil)), lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, createdBy: u.createdBy };
    });
  }
  function createUser(admin, data) {
    var e = {};
    var username = OSC.cleanText(data.username).toLowerCase();
    var fullName = OSC.cleanText(data.fullName, 60);
    var role = data.role === APP.roles.ADMIN ? APP.roles.ADMIN : APP.roles.OPS;
    if (!OSC.isUsername(username)) e.username = '4 to 30 characters: small letters, digits, dot or underscore, starting with a letter';
    if (!OSC.isName(fullName)) e.fullName = 'Enter the full name';
    if (Object.keys(e).length) failFields(e);
    var temp = tempPassword();
    withLock(function () {
      if (Db.find('Users', username)) failFields({ username: 'This username already exists' });
      Db.insert('Users', { username: username, fullName: fullName, role: role, active: true, pwHash: hashPassword(temp), mustChange: true, failedCount: 0, createdAt: Clock.now(), createdBy: admin.username, updatedAt: Clock.now(), updatedBy: admin.username });
    });
    Audit.log(admin, 'users.create', 'Users', username, '', null, { fullName: fullName, role: role });
    return { username: username, tempPassword: temp };
  }
  function setActive(admin, username, active, reason) {
    reason = requireReason(reason);
    if (username === admin.username && !active) fail('VALIDATION', 'You cannot disable your own account');
    var u = Db.find('Users', username);
    if (!u) fail('NOT_FOUND', 'User not found');
    if (!active && u.role === APP.roles.ADMIN) {
      var admins = Db.where('Users', function (x) { return x.role === APP.roles.ADMIN && x.active; });
      if (admins.length <= 1) fail('VALIDATION', 'At least one active Admin is required');
    }
    withLock(function () {
      Db.update('Users', username, { active: !!active, updatedAt: Clock.now(), updatedBy: admin.username });
      if (!active) revokeAll(username);
    });
    Audit.log(admin, active ? 'users.enable' : 'users.disable', 'Users', username, reason, { active: u.active }, { active: !!active });
    return { done: true };
  }
  function resetPassword(admin, username, reason) {
    reason = requireReason(reason);
    var u = Db.find('Users', username);
    if (!u) fail('NOT_FOUND', 'User not found');
    var temp = tempPassword();
    withLock(function () {
      Db.update('Users', username, { pwHash: hashPassword(temp), mustChange: true, failedCount: 0, lockedUntil: '', updatedAt: Clock.now(), updatedBy: admin.username });
      revokeAll(username);
    });
    Audit.log(admin, 'users.resetPassword', 'Users', username, reason, null, null);
    return { username: username, tempPassword: temp };
  }
  function loginLog(limit) {
    return Db.tail('LoginLog', Math.min(limit || 200, 1000)).map(function (r) { delete r._row; return r; });
  }

  return {
    pbkdf2: pbkdf2, hashPassword: hashPassword, verifyPassword: verifyPassword, tempPassword: tempPassword,
    login: login, check: check, logout: logout, changePassword: changePassword, revokeAll: revokeAll,
    listUsers: listUsers, createUser: createUser, setActive: setActive, resetPassword: resetPassword, loginLog: loginLog,
    publicUser: publicUser
  };
})();
