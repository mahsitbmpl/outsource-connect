/* ===== 09 Tablet (kiosk): device tokens, sync, punches, face enrollment, unrecognised faces ===== */
var KIOSK_APP_MIN = '3.0.0';
var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

var Devices = (function () {
  function props() { return PropertiesService.getScriptProperties(); }
  function base32(bytes) {
    var bits = 0, val = 0, out = '';
    bytes.forEach(function (b) { val = (val << 8) | (b & 0xff); bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } });
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out;
  }
  function payload(req) {
    if (typeof req.payload !== 'string') fail('BAD_REQUEST', 'Missing payload');
    try { var d = JSON.parse(req.payload); return d && typeof d === 'object' ? d : {}; } catch (e) { fail('BAD_REQUEST', 'Payload is not JSON'); }
  }
  /** Checks the tablet's HMAC signature, clock and nonce. Returns the device row. */
  function verify(req) {
    var d = req.device || {};
    if (!/^[A-Z]{3}\d{1,3}$/.test(d.id || '') || !/^\d{10,15}$/.test(d.ts || '') || !/^[\d-]{8,60}$/.test(d.nonce || '') || typeof d.sig !== 'string') fail('DEVICE_AUTH', 'Tablet request is not signed');
    var dev = Db.find('Devices', d.id);
    var secret = props().getProperty('DEVICE_SECRET_' + d.id);
    if (!dev || !dev.active || !secret) fail('DEVICE_REVOKED', 'This tablet is not registered. Ask the Admin for a new setup code.');
    if (Math.abs(Number(d.ts) - Clock.nowMs()) > 10 * 60000) fail('CLOCK', 'Tablet time differs from the server by more than 10 minutes');
    var msg = [d.id, d.ts, d.nonce, req.action, req.payload].join('\n');
    var want = bytesToB64(Utilities.computeHmacSha256Signature(msg, secret, Utilities.Charset.UTF_8));
    var diff = want.length ^ d.sig.length;
    for (var i = 0; i < Math.min(want.length, d.sig.length); i++) diff |= want.charCodeAt(i) ^ d.sig.charCodeAt(i);
    if (diff !== 0) fail('DEVICE_AUTH', 'Tablet signature is wrong');
    var cache = CacheService.getScriptCache(), nk = 'n:' + d.id + ':' + d.nonce;
    if (cache.get(nk)) fail('REPLAY', 'Request already used');
    cache.put(nk, '1', 1500);
    touch(dev);
    return dev;
  }
  /** lastSeenAt is written at most every 2 minutes to keep the sheet quiet. */
  function touch(dev) {
    var cache = CacheService.getScriptCache(), k = 'seen:' + dev.deviceId;
    cache.put('seenAt:' + dev.deviceId, Clock.now(), 21600);
    if (cache.get(k)) return;
    cache.put(k, '1', 120);
    try { Db.update('Devices', dev.deviceId, { lastSeenAt: Clock.now() }); } catch (e) { /* ignore */ }
  }
  function lastSeen(dev) { return CacheService.getScriptCache().get('seenAt:' + dev.deviceId) || dev.lastSeenAt; }
  function list() {
    return Db.all('Devices').map(function (d) {
      var seen = lastSeen(d), mins = seen ? (Clock.nowMs() - Date.parse(seen)) / 60000 : null;
      return { deviceId: d.deviceId, name: d.name, active: d.active, createdAt: d.createdAt, createdBy: d.createdBy, lastSeenAt: seen, minutesSinceSeen: mins == null ? null : Math.round(mins),
        online: d.active && mins != null && mins <= Settings.int('tabletSilentAlertMinutes'), appVersion: d.appVersion, battery: d.battery, charging: d.charging,
        queueSize: d.queueSize, cameraOk: d.cameraOk, lastPunchAt: d.lastPunchAt, backend: d.backend };
    });
  }
  function create(admin, name) {
    name = OSC.cleanText(name, 40) || 'Lobby tablet';
    var secret = base32(randomBytes(20));
    var id = withLock(function () {
      var n = Db.all('Devices').length + 1, did;
      do { did = 'TAB' + n++; } while (Db.find('Devices', did));
      Db.insert('Devices', { deviceId: did, name: name, active: true, createdAt: Clock.now(), createdBy: admin.username });
      props().setProperty('DEVICE_SECRET_' + did, secret);
      return did;
    });
    Audit.log(admin, 'devices.create', 'Devices', id, name, null, { name: name });
    return { deviceId: id, name: name, setupCode: id + '-' + secret.match(/.{4}/g).join('-') };
  }
  function revoke(admin, deviceId, reason) {
    reason = requireReason(reason);
    if (!Db.find('Devices', deviceId)) fail('NOT_FOUND', 'Tablet not found');
    withLock(function () {
      Db.update('Devices', deviceId, { active: false, revokedAt: Clock.now(), revokedBy: admin.username });
      props().deleteProperty('DEVICE_SECRET_' + deviceId);
    });
    Audit.log(admin, 'devices.revoke', 'Devices', deviceId, reason, null, null);
    return { done: true };
  }
  function heartbeat(dev, h) {
    var patch = { appVersion: OSC.cleanText(h.appVersion, 20), battery: isFinite(h.battery) ? Math.round(h.battery) : '', charging: !!h.charging,
      queueSize: isFinite(h.queueSize) ? Number(h.queueSize) : '', cameraOk: !!h.cameraOk, backend: OSC.cleanText(h.backend, 20), userAgent: OSC.cleanText(h.userAgent, 200), lastSeenAt: Clock.now() };
    if (h.lastPunchAt) patch.lastPunchAt = String(h.lastPunchAt).slice(0, 30);
    Db.update('Devices', dev.deviceId, patch);
    var cache = CacheService.getScriptCache(), k = 'hblog:' + dev.deviceId;
    if (!cache.get(k)) {
      cache.put(k, '1', 1800); // history row at most every 30 minutes
      Db.append('Heartbeats', { at: Clock.now(), deviceId: dev.deviceId, battery: patch.battery, charging: patch.charging, queueSize: patch.queueSize, cameraOk: patch.cameraOk, appVersion: patch.appVersion, note: '' });
    }
    return { ok: true };
  }
  return { verify: verify, payload: payload, list: list, create: create, revoke: revoke, heartbeat: heartbeat, base32: base32 };
})();

var Kiosk = (function () {
  function bumpFaces() { PropertiesService.getScriptProperties().setProperty('FACES_VERSION', String(Clock.nowMs())); }
  function facesVersion() { return PropertiesService.getScriptProperties().getProperty('FACES_VERSION') || '0'; }
  function config() {
    return {
      orgName: Settings.str('orgName'), languages: Settings.list('kioskLanguages'), threshold: Settings.num('faceMatchThreshold'),
      margin: Settings.num('faceMatchMargin'), liveness: Settings.bool('livenessEnabled'), dupWindowMin: Settings.int('duplicateWindowMin'),
      newInAfterHours: Settings.int('kioskNewInAfterHours'), minFacePct: Settings.int('kioskMinFacePct'), reloadTime: Settings.str('kioskReloadTime'),
      minAppVersion: KIOSK_APP_MIN
    };
  }
  /** Everything the tablet needs to work offline: settings, active faces, each person's last punch. */
  function sync() {
    var dm = {}; Db.all('Departments').forEach(function (d) { dm[d.code] = d.name; });
    var staff = {}; Db.all('Staff').forEach(function (s) { if (s.status === 'Active') staff[s.staffId] = s; });
    var faces = {};
    Db.all('FaceData').forEach(function (f) {
      if (f.status !== 'Active' || !staff[f.staffId] || !Array.isArray(f.descriptors)) return;
      (faces[f.staffId] = faces[f.staffId] || []).push.apply(faces[f.staffId], f.descriptors);
    });
    var thumbs = {}; Db.all('FaceThumbs').forEach(function (t) { thumbs[t.staffId] = t.thumb; });
    var state = {}; Db.all('StaffState').forEach(function (t) { state[t.staffId] = t; });
    var people = Object.keys(faces).map(function (id) {
      var s = staff[id], st = state[id];
      return { staffId: id, name: s.title + ' ' + s.fullName, dept: dm[s.deptCode] || s.deptCode, designation: s.designation, descriptors: faces[id],
        thumb: thumbs[id] || '', last: st && st.lastAt ? { type: st.lastType, at: Date.parse(st.lastAt), punchId: st.lastPunchId } : null };
    });
    return { config: Kiosk.config(), facesVersion: facesVersion(), people: people };
  }
  function poll(dev) {
    var p = pendingRequest();
    return { facesVersion: facesVersion(), enroll: p, deviceName: dev.name };
  }

  // ----- punches -----
  function seenPunch(year, id) {
    var cache = CacheService.getScriptCache();
    if (cache.get('pid:' + id)) return true;
    var t = punchTable(year);
    if (!Db.ss().getSheetByName(t)) return false;
    return Db.tail(t, 3000).some(function (r) { return r.punchId === id; });
  }
  function photoFolder(kind, ym) {
    var props = PropertiesService.getScriptProperties();
    var key = 'DRIVE_' + kind + '_' + ym;
    var id = props.getProperty(key);
    if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* re-create */ } }
    var parent = DriveApp.getFolderById(props.getProperty('DRIVE_' + kind + '_ID'));
    var f = parent.createFolder(ym);
    props.setProperty(key, f.getId());
    return f;
  }
  function savePhoto(kind, dataUrl, name, ym) {
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/jpeg;base64,') !== 0 || dataUrl.length > 400000) return '';
    try {
      var blob = Utilities.newBlob(Utilities.base64Decode(dataUrl.slice(23)), 'image/jpeg', name + '.jpg');
      return photoFolder(kind, ym).createFile(blob).getId();
    } catch (e) { console.error('photo save failed: ' + e); return ''; }
  }
  /** Stores a batch of punches. Safe to repeat: a punch id that already exists is acknowledged, not stored twice. */
  function punch(dev, data) {
    var list = Array.isArray(data.punches) ? data.punches.slice(0, 20) : [];
    var results = [];
    list.forEach(function (p) {
      var r = { punchId: String(p.punchId || ''), done: false };
      results.push(r);
      if (!/^[0-9a-f-]{36}$/.test(r.punchId)) { r.done = true; r.status = 'Rejected'; r.reason = 'bad id'; return; }
      var atMs = Number(p.at), s = Db.find('Staff', String(p.staffId || ''));
      if (!isFinite(atMs) || ['IN', 'OUT'].indexOf(p.type) < 0 || !s) { r.done = true; r.status = 'Rejected'; r.reason = 'bad data'; return; }
      var at = OSC.nowISTString(atMs), year = at.slice(0, 4);
      if (seenPunch(year, r.punchId)) { r.done = true; r.status = 'Exists'; return; }
      withLock(function () {
        if (seenPunch(year, r.punchId)) { r.status = 'Exists'; r.done = true; return; }
        var t = punchTable(year);
        if (!Db.ss().getSheetByName(t)) Db.ensureTable(t);
        var notes = [], nowMs = Clock.nowMs();
        if (atMs > nowMs + 2 * 60000) notes.push('time ahead of server');
        if (nowMs - atMs > 7 * 86400000) notes.push('uploaded more than 7 days late');
        var st = Db.find('StaffState', s.staffId), status = 'Accepted';
        if (st && st.lastAt && Math.abs(atMs - Date.parse(st.lastAt)) < Settings.int('duplicateWindowMin') * 60000 && st.lastType === p.type) status = 'Duplicate';
        var photoId = savePhoto('PHOTOS', p.photo, at.slice(0, 10) + '_' + s.staffId + '_' + p.type + '_' + r.punchId.slice(0, 8), at.slice(0, 7));
        Db.append(t, { punchId: r.punchId, staffId: s.staffId, type: p.type, at: at, deviceTime: isFinite(p.deviceTime) ? OSC.nowISTString(Number(p.deviceTime)) : '',
          receivedAt: Clock.now(), deviceId: dev.deviceId, distance: isFinite(p.distance) ? Number(p.distance) : '', liveness: OSC.cleanText(p.liveness, 10),
          offline: !!p.offline, status: status, photoFileId: photoId, note: notes.join('; ') });
        if (status === 'Accepted' && (!st || !st.lastAt || atMs > Date.parse(st.lastAt))) {
          var rec = { staffId: s.staffId, lastPunchId: r.punchId, lastType: p.type, lastAt: at };
          if (st) Db.update('StaffState', s.staffId, rec); else Db.insert('StaffState', rec);
        }
        CacheService.getScriptCache().put('pid:' + r.punchId, '1', 21600);
        r.status = status; r.done = true;
      });
    });
    return { results: results };
  }
  function unrecognised(dev, data) {
    var id = String(data.id || '');
    if (!/^[0-9a-f-]{36}$/.test(id)) fail('BAD_REQUEST', 'bad id');
    if (Db.find('UnrecognisedFaces', id)) return { done: true };
    var at = OSC.nowISTString(isFinite(data.at) ? Number(data.at) : Clock.nowMs());
    var photo = savePhoto('UNRECOGNISED', data.photo, at.slice(0, 10) + '_' + id.slice(0, 8), at.slice(0, 7));
    withLock(function () {
      if (Db.find('UnrecognisedFaces', id)) return;
      Db.insert('UnrecognisedFaces', { unrecId: id, at: at, deviceId: dev.deviceId, photoFileId: photo, bestStaffId: OSC.cleanText(data.bestStaffId, 10),
        bestDistance: isFinite(data.bestDistance) ? Number(data.bestDistance) : '', status: 'Open', note: '' });
    });
    return { done: true };
  }

  // ----- enrollment -----
  function pendingRequest() {
    var cache = CacheService.getScriptCache(), c = cache.get('enroll:pending');
    if (c !== null) return c ? JSON.parse(c) : null;
    var r = Db.where('EnrollRequests', function (x) { return x.status === 'Requested' || x.status === 'InProgress' || x.status === 'Captured'; })[0] || null;
    var out = null;
    if (r) {
      var s = Db.find('Staff', r.staffId);
      out = { reqId: r.reqId, staffId: r.staffId, mode: r.mode, status: r.status, name: s ? s.title + ' ' + s.fullName : r.staffId };
    }
    cache.put('enroll:pending', out ? JSON.stringify(out) : '', 600);
    return out;
  }
  function clearPending() { CacheService.getScriptCache().remove('enroll:pending'); }
  function setReq(reqId, patch) {
    patch.updatedAt = Clock.now();
    var ch = Db.update('EnrollRequests', reqId, patch);
    clearPending();
    return ch.after;
  }
  function getReq(reqId, statuses) {
    var r = Db.find('EnrollRequests', reqId);
    if (!r) fail('NOT_FOUND', 'Enrollment request not found');
    if (statuses && statuses.indexOf(r.status) < 0) fail('ENROLL_STATE', 'This enrollment is already ' + r.status.toLowerCase());
    return r;
  }
  function requestEnroll(user, data) {
    var s = Db.find('Staff', data.staffId);
    if (!s) fail('NOT_FOUND', 'Staff not found');
    if (s.status !== 'Active') fail('VALIDATION', 'Only active staff can be enrolled');
    var mode = data.mode === 'sample' ? 'sample' : 'enroll';
    if (mode === 'sample' && s.faceStatus !== FACE.ACTIVE) fail('VALIDATION', 'Enroll the face first; extra samples are for people already enrolled');
    if (!Db.where('Devices', function (d) { return d.active; }).length) fail('VALIDATION', 'No tablet is set up yet. The Admin adds one under Tablet.');
    return withLock(function () {
      var busy = pendingRequest();
      if (busy) {
        if (busy.staffId === s.staffId) return getReq(busy.reqId);
        fail('BUSY', 'The tablet is enrolling ' + busy.name + ' (' + busy.staffId + '). Finish or cancel that first.');
      }
      var rec = { reqId: newId('ER'), staffId: s.staffId, mode: mode, status: 'Requested', requestedBy: user.username, requestedAt: Clock.now(), updatedAt: Clock.now(), deviceId: '', message: '' };
      Db.insert('EnrollRequests', rec);
      clearPending();
      Audit.log(user, 'face.requestEnroll', 'Staff', s.staffId, mode, null, { reqId: rec.reqId });
      return rec;
    });
  }
  function enrollStatus(reqId) { var r = getReq(reqId); delete r._row; return r; }
  function cancelEnroll(user, reqId) {
    var r = getReq(reqId, ['Requested', 'InProgress', 'Captured']);
    withLock(function () {
      setReq(reqId, { status: 'Cancelled', message: 'Cancelled by ' + user.username });
      discardPending(r);
    });
    Audit.log(user, 'face.cancelEnroll', 'Staff', r.staffId, '', null, { reqId: reqId });
    return { done: true };
  }
  function enrollStart(dev, data) {
    getReq(data.reqId, ['Requested', 'InProgress']);
    return withLock(function () { return setReq(data.reqId, { status: 'InProgress', deviceId: dev.deviceId, message: 'Tablet is capturing' }); });
  }
  function validDescriptors(list) {
    return Array.isArray(list) && list.length >= 3 && list.length <= 10 && list.every(function (d) {
      return Array.isArray(d) && d.length === 128 && d.every(function (x) { return typeof x === 'number' && isFinite(x) && Math.abs(x) < 2; });
    });
  }
  function distance(a, b) { var s = 0; for (var i = 0; i < 128; i++) { var d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
  /** Who else (another active person) has a face closer than the match threshold? */
  function duplicateOf(staffId, descs) {
    var thr = Settings.num('faceMatchThreshold'), best = null;
    var active = {}; Db.all('Staff').forEach(function (s) { if (s.status === 'Active') active[s.staffId] = 1; });
    Db.all('FaceData').forEach(function (f) {
      if (f.status !== 'Active' || f.staffId === staffId || !active[f.staffId] || !Array.isArray(f.descriptors)) return;
      f.descriptors.forEach(function (g) { descs.forEach(function (d) { var x = distance(d, g); if (x < thr && (!best || x < best.distance)) best = { staffId: f.staffId, distance: x }; }); });
    });
    return best;
  }
  function enrollSubmit(dev, data) {
    var r = getReq(data.reqId, ['InProgress', 'Requested']);
    if (!validDescriptors(data.descriptors)) fail('BAD_REQUEST', 'Face samples are not valid');
    var dup = duplicateOf(r.staffId, data.descriptors);
    if (dup) {
      withLock(function () { setReq(r.reqId, { status: 'Failed', message: 'This face is already enrolled as ' + dup.staffId }); });
      return { status: 'Failed', duplicateOf: dup.staffId, message: 'This face matches ' + dup.staffId + '. Enrollment stopped.' };
    }
    return withLock(function () {
      Db.where('FaceData', function (f) { return f.reqId === r.reqId; }).forEach(function (f) { Db.update('FaceData', f.faceId, { status: 'Disabled', disabledAt: Clock.now(), note: 'replaced by a new capture' }); });
      Db.insert('FaceData', { faceId: newId('FD'), staffId: r.staffId, descriptors: data.descriptors.map(function (d) { return d.map(function (x) { return Math.round(x * 10000) / 10000; }); }),
        samples: data.descriptors.length, quality: data.quality || '', source: r.mode, status: 'Pending', reqId: r.reqId, createdAt: Clock.now() });
      if (typeof data.thumb === 'string' && data.thumb.indexOf('data:image/jpeg;base64,') === 0 && data.thumb.length < 40000) {
        if (Db.find('FaceThumbs', r.staffId)) Db.update('FaceThumbs', r.staffId, { thumb: data.thumb, updatedAt: Clock.now() });
        else Db.insert('FaceThumbs', { staffId: r.staffId, thumb: data.thumb, updatedAt: Clock.now() });
      }
      var s = Db.find('Staff', r.staffId);
      if (s.faceStatus !== FACE.ACTIVE) Db.update('Staff', r.staffId, { faceStatus: FACE.PENDING });
      setReq(r.reqId, { status: 'Captured', message: 'Captured. Waiting for the test punch.' });
      return { status: 'Captured' };
    });
  }
  /** The test punch matched: the new samples become active. The test punch is not attendance. */
  function enrollConfirm(dev, data) {
    var r = getReq(data.reqId, ['Captured']);
    return withLock(function () {
      var now = Clock.now();
      Db.where('FaceData', function (f) { return f.staffId === r.staffId; }).forEach(function (f) {
        if (f.reqId === r.reqId && f.status === 'Pending') Db.update('FaceData', f.faceId, { status: 'Active', activatedAt: now });
        else if (r.mode === 'enroll' && f.status === 'Active') Db.update('FaceData', f.faceId, { status: 'Disabled', disabledAt: now, note: 're-enrolled' });
      });
      Db.update('Staff', r.staffId, { faceStatus: FACE.ACTIVE, updatedAt: now, updatedBy: 'tablet ' + dev.deviceId });
      setReq(r.reqId, { status: 'Done', message: 'Test punch matched (distance ' + (isFinite(data.distance) ? Number(data.distance).toFixed(3) : '?') + ')' });
      bumpFaces();
      Audit.log({ username: 'tablet ' + dev.deviceId }, r.mode === 'sample' ? 'face.addSample' : 'face.enroll', 'Staff', r.staffId, 'Enrollment ' + r.reqId, null, { faceStatus: FACE.ACTIVE });
      return { status: 'Done' };
    });
  }
  function discardPending(r) {
    Db.where('FaceData', function (f) { return f.reqId === r.reqId && f.status === 'Pending'; }).forEach(function (f) { Db.update('FaceData', f.faceId, { status: 'Disabled', disabledAt: Clock.now(), note: 'enrollment not completed' }); });
    var s = Db.find('Staff', r.staffId);
    if (s && s.faceStatus === FACE.PENDING) {
      var any = Db.where('FaceData', function (f) { return f.staffId === r.staffId && f.status === 'Active'; }).length;
      Db.update('Staff', r.staffId, { faceStatus: any ? FACE.ACTIVE : FACE.NONE });
    }
  }
  function enrollFail(dev, data) {
    var r = getReq(data.reqId, ['Requested', 'InProgress', 'Captured']);
    return withLock(function () {
      setReq(r.reqId, { status: 'Failed', message: OSC.cleanText(data.message, 200) || 'Failed on tablet' });
      discardPending(r);
      return { status: 'Failed' };
    });
  }
  /** Called when staff exit: face data stops working at once (deleted later by the retention job). */
  function disableFaces(staffId, why) {
    withLock(function () {
      Db.where('FaceData', function (f) { return f.staffId === staffId && (f.status === 'Active' || f.status === 'Pending'); })
        .forEach(function (f) { Db.update('FaceData', f.faceId, { status: 'Disabled', disabledAt: Clock.now(), note: why }); });
    });
    bumpFaces();
  }

  // ----- console views -----
  function recentPunches(dateIso) {
    var d = OSC.parseDate(dateIso) || Clock.today(), t = punchTable(d.slice(0, 4));
    if (!Db.ss().getSheetByName(t)) return [];
    var staff = {}; Db.all('Staff').forEach(function (s) { staff[s.staffId] = s; });
    return Db.tail(t, 4000).filter(function (p) { return p.at.slice(0, 10) === d; }).map(function (p) {
      var s = staff[p.staffId] || {};
      return { punchId: p.punchId, staffId: p.staffId, name: s.title ? s.title + ' ' + s.fullName : p.staffId, deptCode: s.deptCode, type: p.type, at: p.at,
        receivedAt: p.receivedAt, offline: p.offline, status: p.status, distance: p.distance, liveness: p.liveness, hasPhoto: !!p.photoFileId, note: p.note };
    });
  }
  function photo(data) {
    var fileId = '';
    if (data.unrecId) { var u = Db.find('UnrecognisedFaces', data.unrecId); fileId = u ? u.photoFileId : ''; }
    else if (data.punchId && data.date) {
      var t = punchTable(String(data.date).slice(0, 4));
      var p = Db.ss().getSheetByName(t) ? Db.tail(t, 4000).filter(function (x) { return x.punchId === data.punchId; })[0] : null;
      fileId = p ? p.photoFileId : '';
    }
    if (!fileId) fail('NOT_FOUND', 'No photo for this record');
    var bytes;
    try { bytes = DriveApp.getFileById(fileId).getBlob().getBytes(); } catch (e) { fail('NOT_FOUND', 'This photo was removed after the photo retention period (Settings: photoRetentionDays)'); }
    return { dataUrl: 'data:image/jpeg;base64,' + Utilities.base64Encode(bytes) };
  }
  function unrecList(status) {
    return Db.all('UnrecognisedFaces').filter(function (u) { return !status || status === 'All' || u.status === status; })
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 300).map(function (u) { delete u._row; return u; });
  }
  function unrecDismiss(user, unrecId, reason) {
    reason = requireReason(reason);
    var u = Db.find('UnrecognisedFaces', unrecId);
    if (!u) fail('NOT_FOUND', 'Not found');
    if (u.status !== 'Open') fail('VALIDATION', 'Already ' + u.status.toLowerCase());
    withLock(function () { Db.update('UnrecognisedFaces', unrecId, { status: 'Dismissed', resolvedBy: user.username, resolvedAt: Clock.now(), note: reason }); });
    Audit.log(user, 'unrecognised.dismiss', 'UnrecognisedFaces', unrecId, reason, null, null);
    return { done: true };
  }
  function thumb(staffId) { var t = Db.find('FaceThumbs', staffId); return { thumb: t ? t.thumb : '' }; }
  function faceSummary(staffId) {
    var rows = Db.where('FaceData', function (f) { return f.staffId === staffId; });
    return { active: rows.filter(function (f) { return f.status === 'Active'; }).length, samples: rows.filter(function (f) { return f.status === 'Active'; }).reduce(function (a, f) { return a + (f.samples || 0); }, 0),
      lastEnrolledAt: rows.filter(function (f) { return f.activatedAt; }).map(function (f) { return f.activatedAt; }).sort().pop() || '' };
  }

  return { sync: sync, poll: poll, punch: punch, unrecognised: unrecognised, requestEnroll: requestEnroll, enrollStatus: enrollStatus, cancelEnroll: cancelEnroll,
    enrollStart: enrollStart, enrollSubmit: enrollSubmit, enrollConfirm: enrollConfirm, enrollFail: enrollFail, disableFaces: disableFaces, bumpFaces: bumpFaces,
    recentPunches: recentPunches, photo: photo, unrecList: unrecList, unrecDismiss: unrecDismiss, thumb: thumb, faceSummary: faceSummary, config: config };
})();

// ----- routes -----
ROUTES['kiosk.sync'] = ['DEVICE', function () { return Kiosk.sync(); }];
ROUTES['kiosk.poll'] = ['DEVICE', function (dev) { return Kiosk.poll(dev); }];
ROUTES['kiosk.heartbeat'] = ['DEVICE', function (dev, d) { return Devices.heartbeat(dev, d); }];
ROUTES['kiosk.punch'] = ['DEVICE', function (dev, d) { return Kiosk.punch(dev, d); }];
ROUTES['kiosk.unrecognised'] = ['DEVICE', function (dev, d) { return Kiosk.unrecognised(dev, d); }];
ROUTES['kiosk.enrollStart'] = ['DEVICE', function (dev, d) { return Kiosk.enrollStart(dev, d); }];
ROUTES['kiosk.enrollSubmit'] = ['DEVICE', function (dev, d) { return Kiosk.enrollSubmit(dev, d); }];
ROUTES['kiosk.enrollConfirm'] = ['DEVICE', function (dev, d) { return Kiosk.enrollConfirm(dev, d); }];
ROUTES['kiosk.enrollFail'] = ['DEVICE', function (dev, d) { return Kiosk.enrollFail(dev, d); }];

ROUTES['devices.list'] = ['APP', function () { return Devices.list(); }];
ROUTES['devices.create'] = ['ADMIN', function (u, d) { return Devices.create(u, d.name); }];
ROUTES['devices.revoke'] = ['ADMIN', function (u, d) { return Devices.revoke(u, d.deviceId, d.reason); }];
ROUTES['face.requestEnroll'] = ['APP', function (u, d) { return Kiosk.requestEnroll(u, d); }];
ROUTES['face.enrollStatus'] = ['APP', function (u, d) { return Kiosk.enrollStatus(d.reqId); }];
ROUTES['face.cancelEnroll'] = ['APP', function (u, d) { return Kiosk.cancelEnroll(u, d.reqId); }];
ROUTES['face.thumb'] = ['APP', function (u, d) { return Kiosk.thumb(d.staffId); }];
ROUTES['face.summary'] = ['APP', function (u, d) { return Kiosk.faceSummary(d.staffId); }];
ROUTES['punches.byDate'] = ['APP', function (u, d) { return Kiosk.recentPunches(d.date); }];
ROUTES['punches.photo'] = ['APP', function (u, d) { return Kiosk.photo(d); }];
ROUTES['unrecognised.list'] = ['APP', function (u, d) { return Kiosk.unrecList(d.status); }];
ROUTES['unrecognised.dismiss'] = ['APP', function (u, d) { return Kiosk.unrecDismiss(u, d.unrecId, d.reason); }];

// Staff changes that affect the tablet: names, exits, transfers. Wrap the Phase 1 routes.
['staff.update', 'staff.transfer', 'staff.reactivate'].forEach(function (a) {
  var h = ROUTES[a][1];
  ROUTES[a][1] = function (u, d) { var r = h(u, d); Kiosk.bumpFaces(); return r; };
});
(function () {
  var h = ROUTES['staff.exit'][1];
  ROUTES['staff.exit'][1] = function (u, d) { var r = h(u, d); Kiosk.disableFaces(d.staffId, 'staff exited'); return r; };
})();
