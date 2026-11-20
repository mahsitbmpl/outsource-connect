'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../shared/rules.js');
const CASES = require('../shared/rule-cases.js');

const RULES = R.normalise({}).rules;
const ms = (s) => Date.parse(s.replace(' ', 'T') + ':00+05:30');

for (const c of CASES) {
  test(`${c.id} ${c.group}: IN ${c.in} OUT ${c.out} = ${c.h} h${c.note ? ' (' + c.note + ')' : ''}`, () => {
    const d = R.computeDuty(ms(c.in), ms(c.out), RULES);
    assert.equal(d.hours, c.h);
    if (c.g != null) { assert.equal(d.lateGrace, true); assert.equal(d.graceHours, c.g); }
    else assert.equal(d.lateGrace, false, 'no grace decision expected');
    assert.equal(d.dutyDate, c.date || c.in.slice(0, 10));
    if (c.shift) assert.equal(d.shift, c.shift);
    if (c.split) { const s = R.split(d.hours, RULES); assert.deepEqual([s.h8, s.h4, s.dd], c.split); }
    assert.ok(d.startHow && d.endHow, 'explanation present');
  });
}

const P = (type, s, extra) => Object.assign({ punchId: type + s, type, at: ms(s), status: 'Accepted' }, extra || {});
const NOW = ms('2026-11-05 12:00');

test('pairing: normal day and night duties', () => {
  const out = R.pair([P('IN', '2026-11-02 08:00'), P('OUT', '2026-11-02 20:05'), P('IN', '2026-11-03 20:00'), P('OUT', '2026-11-04 08:00')], RULES, NOW);
  assert.deepEqual(out.map((x) => x.kind), ['pair', 'pair']);
});
test('pairing: forgotten OUT (IN followed by IN) gives a missing OUT, then a normal duty', () => {
  const out = R.pair([P('IN', '2026-11-02 08:00'), P('IN', '2026-11-03 08:00'), P('OUT', '2026-11-03 20:00')], RULES, NOW);
  assert.deepEqual(out.map((x) => x.kind), ['missingOut', 'pair']);
  assert.equal(out[0].reason, 'another IN followed');
});
test('pairing: forgotten IN (OUT with no open IN) gives a missing IN', () => {
  const out = R.pair([P('OUT', '2026-11-02 20:02'), P('IN', '2026-11-03 08:00'), P('OUT', '2026-11-03 20:00')], RULES, NOW);
  assert.deepEqual(out.map((x) => x.kind), ['missingIn', 'pair']);
});
test('pairing: duplicates within 3 minutes are dropped; Duplicate status ignored', () => {
  const out = R.pair([P('IN', '2026-11-02 08:00'), P('IN', '2026-11-02 08:02'), P('IN', '2026-11-02 08:01', { status: 'Duplicate' }), P('OUT', '2026-11-02 20:00'), P('OUT', '2026-11-02 20:02')], RULES, NOW);
  assert.deepEqual(out.map((x) => x.kind), ['pair']);
  assert.equal(out[0].in.punchId, 'IN2026-11-02 08:00');
});
test('pairing: punches uploaded out of order (offline) are sorted by time', () => {
  const out = R.pair([P('OUT', '2026-11-02 20:00'), P('IN', '2026-11-03 08:00'), P('IN', '2026-11-02 08:00'), P('OUT', '2026-11-03 20:00')], RULES, NOW);
  assert.deepEqual(out.map((x) => x.kind), ['pair', 'pair']);
});
test('pairing: open duty is "open" up to 24 h, then a missing OUT', () => {
  let out = R.pair([P('IN', '2026-11-05 08:00')], RULES, ms('2026-11-05 22:00'));
  assert.equal(out[0].kind, 'open'); assert.equal(out[0].openHours, 14);
  assert.equal(R.openFlag(out[0].openHours, RULES), 'amber');
  out = R.pair([P('IN', '2026-11-04 08:00')], RULES, ms('2026-11-05 08:30'));
  assert.equal(out[0].kind, 'missingOut');
  assert.equal(R.openFlag(24.5, RULES), 'red');
  assert.equal(R.openFlag(12, RULES), '');
});
test('pairing: offline duplicate (same punch uploaded twice) cannot double a duty', () => {
  const a = P('IN', '2026-11-02 08:00'), b = P('OUT', '2026-11-02 20:00');
  assert.equal(R.pair([a, a, b, b], RULES, NOW).length, 1);
});
test('suggestions: missing OUT -> 12 h after counted start; missing IN -> 12 h before last boundary', () => {
  assert.equal(R.suggestOut(ms('2026-11-02 08:05'), RULES), ms('2026-11-02 20:00'));
  assert.equal(R.suggestOut(ms('2026-11-02 19:55'), RULES), ms('2026-11-03 08:00'));
  assert.equal(R.suggestIn(ms('2026-11-02 20:05'), RULES), ms('2026-11-02 08:00'));
  assert.equal(R.suggestIn(ms('2026-11-03 08:10'), RULES), ms('2026-11-02 20:00'));
});
test('split per date: two separate duties on one date add up before the split', () => {
  const a = R.computeDuty(ms('2026-11-02 08:00'), ms('2026-11-02 20:00'), RULES).hours;
  const b = R.computeDuty(ms('2026-11-02 20:05'), ms('2026-11-03 08:00'), RULES).hours;
  assert.deepEqual(R.split(a + b, RULES), { total: 24, h8: 8, h4: 4, dd: 12 });
  assert.deepEqual(R.split(11, RULES), { total: 11, h8: 8, h4: 3, dd: 0 });
  assert.deepEqual(R.split(6, RULES), { total: 6, h8: 6, h4: 0, dd: 0 });
});
test('rule versions are validated', () => {
  assert.equal(R.normalise({ graceMin: 15 }).rules.graceMin, 15);
  assert.ok(R.normalise({ boundaries: '8am' }).errors.boundaries);
  assert.ok(R.normalise({ split8: 8, split4: 5 }).errors.split4);
  assert.ok(R.normalise({ extraHalfFromMin: 40, extraFullFromMin: 35 }).errors.extraFullFromMin);
  assert.deepEqual(R.normalise({ boundaries: '20:00, 08:00' }).rules.boundaries, ['08:00', '20:00']);
});
test('a different rule version changes results (grace 15 min)', () => {
  const r15 = R.normalise({ graceMin: 15 }).rules;
  assert.equal(R.computeDuty(ms('2026-11-02 08:14'), ms('2026-11-02 20:00'), r15).hours, 12);
  assert.equal(R.computeDuty(ms('2026-11-02 08:14'), ms('2026-11-02 20:00'), RULES).hours, 11);
});
test('seconds are ignored (08:10:59 is still within grace)', () => {
  assert.equal(R.computeDuty(Date.parse('2026-11-02T08:10:59+05:30'), ms('2026-11-02 20:00'), RULES).hours, 12);
});
