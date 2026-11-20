#!/usr/bin/env node
/*
 * Local test server (for developers only, not needed to run the real system).
 * Serves console/ and kiosk/ on http://localhost:8787/console/ and /kiosk/ and answers POST /api with the real Code.gs running on the
 * in-memory Google imitation from tests/gas-mock.js. Usage: node tools/dev-server.js [--demo]
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
