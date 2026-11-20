#!/usr/bin/env node
/*
 * Local test server (for developers only, not needed to run the real system).
 * Serves console/ on http://localhost:8787 and answers POST /api with the real Code.gs running on the
 * in-memory Google imitation from tests/gas-mock.js. Usage: node tools/dev-server.js [--demo]
 * Browser tests redirect requests for script.google.com to /api.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('../tests/gas-mock');

const root = path.join(__dirname, '..', 'console');
const env = makeEnv({ now: Date.now() });
env.ctx.setup();
const temp = /Temporary password: (\S+)/.exec(env.alerts[0].text)[1];
if (process.argv.includes('--demo')) env.ctx.seedDemoData();
setInterval(() => env.setNow(new Date().toISOString()), 1000);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.csv': 'text/csv', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.json': 'application/json' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (e) { /* handled by server */ }
      const out = env.call(parsed.action, parsed.data, parsed.token);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  if (req.url === '/__admin') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(temp); return; }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(8787, () => console.log('Console on http://localhost:8787  admin temporary password: ' + temp));
