/*
 * OutSource Connect — attendance rules engine (one file for server, console, tablet and tests).
 * All times are handled as whole IST minutes; seconds are dropped. Plain ES2019, no imports.
 *
 * Duty hours for one IN/OUT pair:
 *  1. Start: if IN is within [boundary - earlySnapMin, boundary + graceMin] it snaps to that boundary (08:00 / 20:00).
 *     Otherwise an IN exactly on a full hour starts then, and any other IN rounds UP to the next full hour.
 *     If the IN is within graceMin after a full hour that is not a boundary (e.g. 09:05), the strict start (10:00)
 *     is used and a "late arrival grace" decision is raised; with grace the start would be 09:00.
 *  2. End: if no boundary is passed after the start, hours are exact minutes (leaving early = exact).
 *     Otherwise hours = (last boundary passed - start) + extra after that boundary, where extra counts whole hours
 *     and the leftover minutes give 0 (< 30), 0.5 (30-44) or 1.0 (45-59).
 *  3. The duty belongs to the date of the IN. Shift tag: Day if IN is 04:00-13:59, otherwise Night.
 *  4. Per person and duty date: first 8 hours -> "8 Hrs", next 4 -> "4 Hrs", the rest -> "Double Duty" (needs approval).
 */
var OSCRules = (function () {
  'use strict';
  var IST = 330 * 60000;

  var DEFAULTS = {
    boundaries: ['08:00', '20:00'], graceMin: 10, earlySnapMin: 120, lateRoundUp: true, lateGraceReview: true,
    extraHalfFromMin: 30, extraFullFromMin: 45, split8: 8, split4: 4, dutyHours: 12,
    dayFrom: '04:00', dayTo: '13:59', dupWindowMin: 3, openAmberH: 13, openRedH: 24,
    over12NeedsApproval: true, shortDutyBelowH: 12
  };
  var KEYS = Object.keys(DEFAULTS);

  function hm(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /** ms -> whole IST minutes since 1970-01-01 00:00 IST */
  function toMin(ms) { return Math.floor((ms + IST) / 60000); }
  function minToMs(m) { return m * 60000 - IST; }
  function minDate(m) { var d = new Date(Math.floor(m / 1440) * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function minClock(m) { var x = ((m % 1440) + 1440) % 1440; return pad(Math.floor(x / 60)) + ':' + pad(x % 60); }
  function r2(x) { return Math.round(x * 100) / 100; }

  /** Merges stored values over the defaults and checks them. Returns {ok, rules, errors}. */
  function normalise(input) {
    var r = {}, e = {};
    KEYS.forEach(function (k) { r[k] = input && input[k] !== undefined && input[k] !== '' ? input[k] : DEFAULTS[k]; });
    if (typeof r.boundaries === 'string') r.boundaries = r.boundaries.split(',').map(function (s) { return s.trim(); });
    if (!Array.isArray(r.boundaries) || !r.boundaries.length || r.boundaries.some(function (b) { return !/^([01]\d|2[0-3]):[0-5]\d$/.test(b); })) e.boundaries = 'Use 24-hour times like 08:00, 20:00';
    ['graceMin', 'earlySnapMin', 'extraHalfFromMin', 'extraFullFromMin', 'dupWindowMin'].forEach(function (k) { r[k] = Number(r[k]); if (!(r[k] >= 0 && r[k] <= 240)) e[k] = 'Minutes between 0 and 240'; });
    ['split8', 'split4', 'dutyHours', 'openAmberH', 'openRedH', 'shortDutyBelowH'].forEach(function (k) { r[k] = Number(r[k]); if (!(r[k] >= 0 && r[k] <= 72)) e[k] = 'Hours between 0 and 72'; });
    ['lateRoundUp', 'lateGraceReview', 'over12NeedsApproval'].forEach(function (k) { r[k] = r[k] === true || String(r[k]).toLowerCase() === 'true'; });
    ['dayFrom', 'dayTo'].forEach(function (k) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(r[k]))) e[k] = 'Use HH:MM'; });
    if (!e.extraFullFromMin && r.extraFullFromMin < r.extraHalfFromMin) e.extraFullFromMin = 'Must be at least the half-hour value';
    if (!e.split8 && r.split8 + r.split4 !== r.dutyHours) e.split4 = '8 Hrs + 4 Hrs must equal the duty length';
    if (!e.openRedH && r.openRedH < r.openAmberH) e.openRedH = 'Red must be later than amber';
    if (r.boundaries && !e.boundaries) r.boundaries = r.boundaries.slice().sort();
    return { ok: Object.keys(e).length === 0, rules: r, errors: e };
  }

  function boundaryMins(R) { return R.boundaries.map(hm); }
  /** Boundaries (absolute minutes) between a and b inclusive. */
  function boundariesBetween(a, b, R) {
    var out = [], bs = boundaryMins(R);
    for (var d = Math.floor(a / 1440) - 1; d <= Math.floor(b / 1440) + 1; d++) bs.forEach(function (x) { var m = d * 1440 + x; if (m >= a && m <= b) out.push(m); });
    return out.sort(function (x, y) { return x - y; });
  }
  function extraRound(min, R) {
    var h = Math.floor(min / 60), m = min % 60;
    return h * 60 + (m < R.extraHalfFromMin ? 0 : m < R.extraFullFromMin ? 30 : 60);
  }
  function hoursFrom(start, outM, R) {
    if (outM <= start) return { hours: 0, how: 'OUT before start' };
    var passed = boundariesBetween(start + 1, outM, R);
    if (!passed.length) return { hours: r2((outM - start) / 60), how: 'left before ' + nextBoundaryText(start, R) + ': exact minutes' };
    var last = passed[passed.length - 1], extra = extraRound(outM - last, R);
    return { hours: r2((last - start + extra) / 60), how: 'to ' + minClock(last) + ' = ' + r2((last - start) / 60) + ' h, then ' + (outM - last) + ' min extra counted as ' + r2(extra / 60) + ' h' };
  }
  function nextBoundaryText(start, R) { var n = boundariesBetween(start + 1, start + 1440, R)[0]; return minClock(n); }

  /** Start rule for an IN minute. */
  function startOf(inM, R) {
    var near = boundariesBetween(inM - R.graceMin, inM + R.earlySnapMin, R);
    for (var i = 0; i < near.length; i++) {
      var B = near[i];
      if (inM >= B - R.earlySnapMin && inM <= B + R.graceMin) return { start: B, how: inM < B ? 'early, counted from ' + minClock(B) : inM === B ? 'on time' : 'within ' + R.graceMin + ' min grace, counted from ' + minClock(B) };
    }
    var mo = ((inM % 60) + 60) % 60;
    if (mo === 0 || !R.lateRoundUp) return { start: inM, how: 'counted from the IN time' };
    var res = { start: inM - mo + 60, how: 'late: counted from the next full hour ' + minClock(inM - mo + 60) };
    if (R.lateGraceReview && mo <= R.graceMin) { res.graceStart = inM - mo; res.how += ' (grace to ' + minClock(inM - mo) + ' needs a decision)'; }
    return res;
  }
  function shiftOf(inM, R) { var x = ((inM % 1440) + 1440) % 1440; return x >= hm(R.dayFrom) && x <= hm(R.dayTo) ? 'Day' : 'Night'; }

  /**
   * One duty from IN/OUT instants (ms). outMs may be null (open). Returns hours, grace alternative, explanation.
   */
  function computeDuty(inMs, outMs, R) {
    var inM = toMin(inMs), s = startOf(inM, R);
    var d = { dutyDate: minDate(inM), shift: shiftOf(inM, R), inClock: minClock(inM), startClock: minClock(s.start), startMs: minToMs(s.start), startHow: s.how, lateGrace: s.graceStart != null };
    if (outMs == null) { d.open = true; d.hours = null; return d; }
    var outM = toMin(outMs), h = hoursFrom(s.start, outM, R);
    d.outClock = minClock(outM); d.hours = h.hours; d.endHow = h.how;
    if (d.lateGrace) { d.graceHours = hoursFrom(s.graceStart, outM, R).hours; d.graceStartClock = minClock(s.graceStart); }
    d.rawMinutes = outM - inM;
    return d;
  }

  /** Split one person's total for one duty date into 8 Hrs / 4 Hrs / Double Duty. */
  function split(total, R) {
    total = r2(total || 0);
    return { total: total, h8: r2(Math.min(total, R.split8)), h4: r2(Math.min(Math.max(total - R.split8, 0), R.split4)), dd: r2(Math.max(total - R.split8 - R.split4, 0)) };
  }

  /**
   * Pairs one person's punches (sorted or not) into duties.
   * punches: [{punchId, type:'IN'|'OUT', at: ms, status}] (Duplicate/Rejected are ignored).
   * Returns [{kind:'pair'|'missingOut'|'missingIn'|'open', in, out}]
   */
  function pair(punches, R, nowMs) {
    var list = punches.filter(function (p) { return p.status !== 'Duplicate' && p.status !== 'Rejected' && p.status !== 'Void'; })
      .slice().sort(function (a, b) { return a.at - b.at || (a.type === 'IN' ? -1 : 1); });
    var kept = [];
    list.forEach(function (p) { var prev = kept[kept.length - 1]; if (prev && p.at - prev.at < R.dupWindowMin * 60000 && p.type === prev.type) return; kept.push(p); });
    var out = [], open = null;
    kept.forEach(function (p) {
      if (p.type === 'IN') { if (open) out.push({ kind: 'missingOut', in: open, out: null, reason: 'another IN followed' }); open = p; }
      else if (open) { out.push({ kind: 'pair', in: open, out: p }); open = null; }
      else out.push({ kind: 'missingIn', in: null, out: p });
    });
    if (open) {
      var openH = ((nowMs == null ? Date.now() : nowMs) - open.at) / 3600000;
      out.push({ kind: openH > R.openRedH ? 'missingOut' : 'open', in: open, out: null, openHours: r2(openH), reason: openH > R.openRedH ? 'open for more than ' + R.openRedH + ' h' : '' });
    }
    return out;
  }
  /** Suggested OUT for a missing OUT: the standard end, dutyHours after the counted start. */
  function suggestOut(inMs, R) { var s = startOf(toMin(inMs), R); return minToMs(s.start + R.dutyHours * 60); }
  /** Suggested IN for a missing IN: dutyHours before the last boundary at or before OUT. */
  function suggestIn(outMs, R) {
    var outM = toMin(outMs), b = boundariesBetween(outM - 1440, outM, R);
    return minToMs((b.length ? b[b.length - 1] : outM) - R.dutyHours * 60);
  }
  function openFlag(openHours, R) { return openHours > R.openRedH ? 'red' : openHours > R.openAmberH ? 'amber' : ''; }

  return { DEFAULTS: DEFAULTS, KEYS: KEYS, normalise: normalise, computeDuty: computeDuty, split: split, pair: pair, suggestOut: suggestOut, suggestIn: suggestIn,
    openFlag: openFlag, shiftOf: shiftOf, toMin: toMin, minToMs: minToMs, minDate: minDate, minClock: minClock, r2: r2 };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OSCRules;
