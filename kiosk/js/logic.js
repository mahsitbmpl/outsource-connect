/*
 * OutSource Connect kiosk — pure logic (no camera, no DOM), shared by the tablet and the Node tests.
 * Matching, IN/OUT decision, duplicate filter, liveness (blink / head turn), image quality.
 */
var KioskLogic = (function () {
  'use strict';

  function dist(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  }

  /**
   * gallery: [{staffId, descriptors: [[128 floats], ...]}]
   * Best person = smallest distance over that person's samples.
   * ok only if best < threshold AND the next different person is at least `margin` further away.
   */
  function bestMatch(desc, gallery, threshold, margin) {
    var best = null, second = null;
    for (var i = 0; i < gallery.length; i++) {
      var g = gallery[i], d = Infinity;
      for (var j = 0; j < g.descriptors.length; j++) { var x = dist(desc, g.descriptors[j]); if (x < d) d = x; }
      if (!best || d < best.distance) { second = best; best = { staffId: g.staffId, distance: d }; }
      else if (!second || d < second.distance) second = { staffId: g.staffId, distance: d };
    }
    if (!best) return { ok: false, reason: 'empty', staffId: null, distance: null };
    var r = { staffId: best.staffId, distance: round4(best.distance), secondId: second ? second.staffId : null, secondDistance: second ? round4(second.distance) : null };
    if (best.distance >= threshold) { r.ok = false; r.reason = 'far'; return r; }
    if (second && second.distance - best.distance < margin) { r.ok = false; r.reason = 'ambiguous'; return r; }
    r.ok = true;
    return r;
  }

  /** Same person must win `need` of the last `of` recognitions before a punch is made. */
  function Consensus(need, of) {
    var hist = [];
    return {
      push: function (staffId) {
        hist.push(staffId); if (hist.length > of) hist.shift();
        if (!staffId) return null;
        var n = hist.filter(function (x) { return x === staffId; }).length;
        return n >= need ? staffId : null;
      },
      reset: function () { hist = []; }
    };
  }

  /**
   * Decide IN/OUT from this person's own last punch.
   * last: {type:'IN'|'OUT', at: ms} or null. Returns {kind:'IN'|'OUT'|'DUP', last}
   * - within dupWindowMin of the last punch -> DUP (ignored)
   * - last IN still open and younger than newInAfterHours -> OUT
   * - otherwise IN (an IN older than newInAfterHours is treated as a forgotten OUT; the server flags it)
   */
  function decideType(last, nowMs, dupWindowMin, newInAfterHours) {
    if (last && nowMs - last.at < dupWindowMin * 60000 && nowMs >= last.at) return { kind: 'DUP', last: last };
    if (last && last.type === 'IN' && nowMs - last.at < newInAfterHours * 3600000) return { kind: 'OUT', last: last };
    return { kind: 'IN', last: last };
  }

  // ---------- liveness ----------
  function pdist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
  /** Eye aspect ratio from the 6 eye points of the 68-point model. Open ~0.3, closed < 0.2. */
  function ear(e) { return (pdist(e[1], e[5]) + pdist(e[2], e[4])) / (2 * pdist(e[0], e[3])); }
  /** pts: 68 landmark points. Returns {ear, yaw, roll, eyeDist} */
  function pose(pts) {
    var le = pts.slice(36, 42), re = pts.slice(42, 48), nose = pts[30];
    var lc = centre(le), rc = centre(re), mid = { x: (lc.x + rc.x) / 2, y: (lc.y + rc.y) / 2 };
    var eyeDist = pdist(lc, rc);
    return {
      ear: (ear(le) + ear(re)) / 2,
      yaw: (nose.x - mid.x) / eyeDist,                         // 0 = straight, +/- = turned
      roll: Math.atan2(rc.y - lc.y, rc.x - lc.x) * 180 / Math.PI, // degrees of head tilt
      eyeDist: eyeDist
    };
  }
  function centre(ps) { var x = 0, y = 0; ps.forEach(function (p) { x += p.x; y += p.y; }); return { x: x / ps.length, y: y / ps.length }; }

  /**
   * Liveness check: passes on a blink (eyes open -> closed -> open within 1 s)
   * or on a small head turn (yaw moves 0.18 from where it started). A printed photo does neither.
   */
  function Liveness(opts) {
    opts = opts || {};
    var closeT = opts.closeEar || 0.2, openT = opts.openEar || 0.25, turnT = opts.turn || 0.18;
    var state = 'wait-open', closedAt = 0, baseYaw = null, passed = null;
    return {
      feed: function (p, tMs) {
        if (passed) return passed;
        if (baseYaw === null) baseYaw = p.yaw;
        if (Math.abs(p.yaw - baseYaw) >= turnT) { passed = 'turn'; return passed; }
        if (state === 'wait-open' && p.ear > openT) state = 'open';
        else if (state === 'open' && p.ear < closeT) { state = 'closed'; closedAt = tMs; }
        else if (state === 'closed') {
          if (p.ear > openT && tMs - closedAt <= 1000) { passed = 'blink'; return passed; }
          if (tMs - closedAt > 1000) state = p.ear > openT ? 'open' : 'wait-open';
        }
        return null;
      },
      passed: function () { return passed; },
      reset: function () { state = 'wait-open'; baseYaw = null; passed = null; }
    };
  }

  // ---------- image quality (face crop as grey pixels) ----------
  function toGrey(rgba) {
    var g = new Float32Array(rgba.length / 4);
    for (var i = 0, j = 0; i < rgba.length; i += 4, j++) g[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    return g;
  }
  function brightness(grey) { var s = 0; for (var i = 0; i < grey.length; i++) s += grey[i]; return s / grey.length; }
  /** Variance of the Laplacian: low = blurry. */
  function sharpness(grey, w, h) {
    var vals = [], s = 0;
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      var i = y * w + x;
      var l = grey[i - w] + grey[i + w] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      vals.push(l); s += l;
    }
    var m = s / vals.length, v = 0;
    for (var k = 0; k < vals.length; k++) v += (vals[k] - m) * (vals[k] - m);
    return v / vals.length;
  }
  /**
   * q: {faceWidthRatio, score, yaw, roll, brightness, sharpness}; limits from settings.
   * Returns the first problem as a key, or null when the frame is good for enrollment.
   */
  function enrollProblem(q, lim) {
    if (q.faceWidthRatio < lim.minFaceRatio) return 'closer';
    if (q.faceWidthRatio > lim.maxFaceRatio) return 'farther';
    if (Math.abs(q.yaw) > lim.maxYaw || Math.abs(q.roll) > lim.maxRoll) return 'straight';
    if (q.brightness < lim.minBright) return 'dark';
    if (q.brightness > lim.maxBright) return 'bright';
    if (q.sharpness < lim.minSharp) return 'blurry';
    if (q.score < lim.minScore) return 'unclear';
    return null;
  }
  /** Enrollment samples must agree with each other (same person, steady). */
  function samplesConsistent(descs, maxPair) {
    for (var i = 0; i < descs.length; i++) for (var j = i + 1; j < descs.length; j++) if (dist(descs[i], descs[j]) > maxPair) return false;
    return descs.length > 0;
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function round4(x) { return Math.round(x * 10000) / 10000; }
  function packDescriptor(d) { return Array.prototype.map.call(d, round4); }
  /** "TAB1-ABCD-EFGH-..." -> {deviceId:'TAB1', secret:'ABCDEFGH...'} or null */
  function parseSetupCode(code) {
    var s = String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
    var m = /^([A-Z]{3}\d{1,3})-?((?:[A-Z2-7]{4}-?){8})$/.exec(s);
    if (!m) return null;
    return { deviceId: m[1], secret: m[2].replace(/-/g, '') };
  }
  function elapsedText(ms) {
    var m = Math.max(0, Math.round(ms / 60000));
    return Math.floor(m / 60) + ' h ' + ('0' + (m % 60)).slice(-2) + ' m';
  }

  return {
    dist: dist, bestMatch: bestMatch, Consensus: Consensus, decideType: decideType, ear: ear, pose: pose, Liveness: Liveness,
    toGrey: toGrey, brightness: brightness, sharpness: sharpness, enrollProblem: enrollProblem, samplesConsistent: samplesConsistent,
    uuid: uuid, round4: round4, packDescriptor: packDescriptor, parseSetupCode: parseSetupCode, elapsedText: elapsedText
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = KioskLogic;
