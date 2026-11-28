#!/usr/bin/env node
/*
 * Local test server (for developers only, not needed to run the real system).
 * Serves console/ and kiosk/ on http://localhost:8787/console/ and /kiosk/ and answers POST /api with the real Code.gs running on the
 * in-memory Google imitation from tests/gas-mock.js. Usage: node tools/dev-server.js [--demo] [--punches] [--month]
 * Browser tests redirect requests for script.google.com to /api.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('../tests/gas-mock');

const root = path.join(__dirname, '..');
const env = makeEnv({ now: Date.now() });
env.ctx.setup();
const temp = /Temporary password: (\S+)/.exec(env.alerts[0].text)[1];
if (process.argv.includes('--demo')) env.ctx.seedDemoData();
if (process.argv.includes('--punches')) {
  // fake punches for demo staff over the last two days, then turn them into duties
  const crypto = require('crypto');
  const day = (n) => new Date(Date.now() + 19800000 - n * 86400000).toISOString().slice(0, 10);
  const at = (d, t) => Date.parse(d + 'T' + t + ':00+05:30');
  const P = [['HK001', 'IN', 1, '08:05'], ['HK001', 'OUT', 1, '20:32'], ['HK002', 'IN', 1, '09:05'], ['HK002', 'OUT', 1, '20:00'], ['HK003', 'IN', 1, '08:00'],
    ['HK004', 'IN', 1, '20:00'], ['HK004', 'OUT', 0, '08:10'], ['HK005', 'IN', 1, '08:00'], ['HK005', 'OUT', 0, '01:00'], ['SS001', 'OUT', 1, '20:03'], ['SC001', 'IN', 1, '08:12'], ['SC001', 'OUT', 1, '15:20']];
  env.ctx.Kiosk.punch({ deviceId: 'TAB0' }, { punches: P.map(([s, t, d, hm]) => ({ punchId: crypto.randomUUID(), staffId: s, type: t, at: at(day(d), hm), deviceTime: at(day(d), hm), distance: 0.3 })) });
  env.newRequest(); console.log('duties:', JSON.stringify(env.ctx.DutyEngine.processNew()));
}
if (process.argv.includes('--month')) {
  // a whole previous month of fake punches for the demo staff (needs --demo), with a few problems left open
  const crypto = require('crypto');
  const nowIst = new Date(Date.now() + 19800000), y = nowIst.getUTCFullYear(), m = nowIst.getUTCMonth(); // previous month = m (1-based)
  const ym = (m === 0 ? y - 1 : y) + '-' + String(m === 0 ? 12 : m).padStart(2, '0'), days = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const at = (d, t, plus) => Date.parse(ym + '-' + String(d).padStart(2, '0') + 'T' + t + ':00+05:30') + (plus || 0) * 86400000;
  const staff = env.ctx.Db.all('Staff').filter((s) => s.status === 'Active');
  const P = [];
  staff.forEach((s, i) => {
    const night = i % 4 === 3;
    for (let d = 1; d <= days; d++) {
      if ((d + i) % 7 === 0) continue; // weekly off
      if (s.joinDate > ym + '-' + String(d).padStart(2, '0')) continue;
      const lastOpen = s.staffId === 'HK003' && d === days - 1;
      const inT = night ? '20:00' : (d + i) % 11 === 0 ? '08:12' : (d + i) % 13 === 0 ? '07:50' : '08:00';
      const outT = night ? '08:05' : (d + i) % 9 === 0 ? '20:40' : (d + i) % 17 === 0 ? '23:00' : '20:02';
      P.push([s.staffId, 'IN', at(d, inT)]);
      if (!lastOpen) P.push([s.staffId, 'OUT', at(d, outT, night ? 1 : 0)]);
    }
  });
  P.sort((a, b) => a[2] - b[2]);
  const tbl = env.ctx.punchTable(ym.slice(0, 4)); env.ctx.Db.ensureTable(tbl);
  const iso = (ms) => env.ctx.OSC.nowISTString(ms);
  env.ctx.Db.insertMany(tbl, P.map(([sid, t, ms]) => ({ punchId: crypto.randomUUID(), staffId: sid, type: t, at: iso(ms), deviceTime: iso(ms), receivedAt: iso(ms + 5000), deviceId: 'TAB0', distance: 0.3, liveness: 'blink', offline: false, status: 'Accepted', photoFileId: '', note: 'demo' })));
  env.newRequest(); console.log('month duties:', JSON.stringify(env.ctx.DutyEngine.processNew()));
  env.newRequest();
  const sys = { username: 'demo-seeder', fullName: 'Demo seeder', role: 'ADMIN' };
  // approve every over-12 day except one in HK, so the HK bill still has something to clear
  const open = env.ctx.DutyEngine.exceptions('Open');
  open.filter((x) => x.type === 'LONG_DUTY').forEach((x, k) => { if (k > 0 || !/^HK/.test(x.staffId)) { env.newRequest(); env.ctx.Actions.approve(sys, { staffId: x.staffId, date: x.dutyDate, approve: true, reasonCode: 'Hospital requirement', note: 'Demo approval' }); } });
  open.filter((x) => x.type === 'LATE_GRACE').forEach((x) => { env.newRequest(); env.ctx.Actions.grace(sys, { dutyId: x.dutyId, dutyDate: x.dutyDate, choice: 'strict', reasonCode: 'Other', note: 'Demo decision' }); });
  env.newRequest();
  const short = env.ctx.DutyEngine.exceptions('Open').filter((x) => x.type === 'SHORT_DUTY');
  short.forEach((x, i) => { if (i < 4) return; env.newRequest(); env.ctx.Actions.reviewShort(sys, { staffId: x.staffId, date: x.dutyDate, reasonCode: 'Other', note: 'Demo review' }); });
  env.newRequest();
  [['HK', 3000, 'Grooming and punctuality'], ['HK', 3000, 'Phone usage on duty'], ['SS', 2000, 'Late reporting of supervisor']].forEach(([d, a, r], k) => { env.newRequest(); env.ctx.Actions.addPenalty(sys, { date: ym + '-' + String(5 + k * 6).padStart(2, '0'), deptCode: d, amount: a, reason: r }); });
  env.newRequest(); env.ctx.Actions.addDeduction(sys, { date: ym + '-10', staffId: 'HK002', hours: 4, reason: 'Left duty without relief' });
  env.newRequest(); env.ctx.Settings.update(sys, 'emailTo', 'ops@example.com', 'Demo');
  env.newRequest(); [1, 2, 3, 4].forEach((k) => env.ctx.Db.insert('UnrecognisedFaces', { unrecId: 'UDEMO' + k, at: ym + '-' + String(10 + k).padStart(2, '0') + 'T08:0' + k + ':00+05:30', status: 'Open', photoFileId: '', bestStaffId: 'HK00' + k, bestDistance: 0.55 }));
  env.newRequest(); console.log('open items after demo decisions:', env.ctx.DutyEngine.exceptions('Open').length, 'month', ym);
}
setInterval(() => env.setNow(new Date().toISOString()), 1000);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.csv': 'text/csv', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.json': 'application/json', '.bin': 'application/octet-stream' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      env.newRequest(); // each request is a fresh execution, as on Google
      const out = JSON.parse(env.ctx.doPost({ postData: { contents: body } }).content);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  if (req.url === '/__admin') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(temp); return; }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(302, { Location: '/console/' }); res.end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(8787, () => console.log('Console http://localhost:8787/console/  Kiosk http://localhost:8787/kiosk/  admin temporary password: ' + temp));
