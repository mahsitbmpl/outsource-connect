/* Phase 4 dashboard (Home). Refreshes every 60 seconds while open; open-duty timers tick every 30 seconds. */
import { apiFast } from './api.js';
import { esc, icon, skeleton, setTitle, $ } from './ui.js';
import { state } from './state.js';

const OSC = window.OSC;
const TYPE = { MISSING_OUT: 'Missing OUT', MISSING_IN: 'Missing IN', LATE_GRACE: 'Late arrival grace', LONG_DUTY: 'Over 12 h approval', SHORT_DUTY: 'Short duty', UNRECOGNISED: 'Unrecognised faces' };
let timer = null, ticker = null;
const hm = (h) => Math.floor(h) + ' h ' + String(Math.round((h % 1) * 60)).padStart(2, '0') + ' m';

export async function dashboardView(c) {
  setTitle('Dashboard', OSC.fmtDate(state.boot.today));
  clearInterval(timer); clearInterval(ticker);
  if (!c.querySelector('.kpi')) c.innerHTML = skeleton(10);
  const d = await apiFast('dashboard');
  draw(c, d);
  timer = setInterval(async () => {
    if (!document.getElementById('dashRoot')) { clearInterval(timer); clearInterval(ticker); return; }
    try { draw(c, await apiFast('dashboard')); } catch (e) { /* keep last view */ }
  }, 60000);
}

function draw(c, d) {
  const att = d.attention || {}, tablet = d.tablets[0];
  const maxTrend = Math.max(1, ...d.trend.map((t) => t.people), ...d.depts.map((x) => x.reqDay + x.reqNight));
  const reqTotal = d.depts.reduce((a, x) => a + x.reqDay + x.reqNight, 0);
  c.innerHTML = `<div id="dashRoot" style="display:grid;gap:16px">
    <div class="grid g4">
      <div class="card kpi"><div class="l">${icon('users')}On duty now</div><div class="v">${d.onDuty} <small>/ ${d.required} required</small></div><div class="d">${esc(d.shiftNow)} shift · ${Math.max(0, d.required - d.onDuty)} short</div></div>
      <div class="card kpi"><div class="l">${icon('clock')}Day today · Night last</div><div class="v">${d.dayToday} <small>·</small> ${d.nightLast}</div><div class="d">people who started a duty</div></div>
      <a class="card kpi" href="#/exceptions" style="text-decoration:none;color:inherit${d.attentionTotal ? ';border-color:#F3D27A' : ''}"><div class="l">${icon('triangle-alert')}Needs attention</div><div class="v" style="${d.attentionTotal ? 'color:var(--warn)' : ''}">${d.attentionTotal}</div><div class="d">${Object.keys(att).filter((k) => att[k]).map((k) => esc(TYPE[k] || k) + ' ' + att[k]).join(' · ') || 'All clear'}</div></a>
      <a class="card kpi" href="#/tablet" style="text-decoration:none;color:inherit"><div class="l">${icon('tablet-smartphone')}Tablet</div><div class="v" style="color:${tablet && tablet.online ? 'var(--ok)' : 'var(--bad)'}">${tablet ? (tablet.online ? 'Online' : 'Silent') : 'None'}</div>
        <div class="d">${tablet ? `${tablet.battery === '' || tablet.battery == null ? '—' : esc(tablet.battery) + '%'}${tablet.charging ? ' charging' : ''} · queue ${esc(tablet.queueSize === '' || tablet.queueSize == null ? '—' : tablet.queueSize)} · seen ${tablet.minutesSinceSeen == null ? 'never' : esc(tablet.minutesSinceSeen) + ' min ago'}` : 'Admin adds one under Tablet'}</div></a>
    </div>
    <div class="grid g3">${d.depts.map((x) => `<div class="card"><div class="row"><b style="font-size:16px">${esc(x.name)}</b><span class="sp"></span>${x.shortage ? `<span class="pill warn">${icon('triangle-alert')}Short ${x.shortage}</span>` : '<span class="pill ok">Full</span>'}</div>
      <div class="kpi"><div class="v">${x.onDuty} <small>on duty / ${x.required} required now</small></div></div>
      <div class="bar"><i style="width:${Math.min(100, x.required ? Math.round(x.onDuty / x.required * 100) : 100)}%;${x.shortage ? 'background:var(--warn-fill)' : ''}"></i></div>
      <div class="row" style="font-size:12px;color:var(--muted)"><span>Day today ${x.dayCount} / ${x.reqDay}</span><span class="sp"></span><span>Night ${x.nightCount} / ${x.reqNight}</span><span>·</span><span>${x.active} active staff</span></div></div>`).join('')}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))">
      <div class="card"><h3>${icon('clock')}Open duties<span class="sp"></span><a href="#/duties" style="font-size:12px">All duties</a></h3>${d.open.length ? `<div class="tablebox" style="max-height:340px"><table class="t"><thead><tr><th>Employee</th><th>Dept</th><th class="n">IN</th><th class="n">On duty for</th></tr></thead><tbody>
        ${d.open.map((o) => `<tr><td><div class="who"><b>${esc(o.name)}</b><span>${esc(o.staffId)} · ${esc(o.shift)}</span></div></td><td>${esc(o.deptCode)}</td><td class="n">${esc(OSC.fmtDateTime(o.inAt).slice(12))}</td>
          <td class="n"><span class="pill ${o.flag === 'red' ? 'bad' : o.flag === 'amber' ? 'warn' : 'ok'}" data-since="${esc(o.inAt)}">${esc(hm(o.hours))}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nobody is on duty right now.</div>'}</div>
      <div class="card"><h3>${icon('history')}Live punches today<span class="sp"></span><a href="#/punches" style="font-size:12px">All punches</a></h3>${d.feed.length ? `<div class="tablebox" style="max-height:340px;border:0"><table class="t"><tbody>
        ${d.feed.map((p) => `<tr><td class="tnum nw">${esc(OSC.fmtDateTime(p.at).slice(12))}</td><td><b>${esc(p.name)}</b> <span style="color:var(--muted)">${esc(p.deptCode || '')}</span></td><td>${p.type === 'IN' ? '<span class="pill ok">IN</span>' : '<span class="pill out">OUT</span>'}${p.status !== 'Accepted' ? ` <span class="pill warn">${esc(p.status)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No punches yet today.</div>'}</div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))">
      <div class="card"><h3>${icon('file-text')}${esc(OSC.fmtMonth(state.boot.today.slice(0, 7)))} so far</h3>
        <dl class="kv">${d.depts.map((x) => `<dt>${esc(x.name)} duties</dt><dd class="tnum">${esc((d.month.duties[x.code] || 0).toFixed(3))}</dd>`).join('')}
        <dt>Double duty hours</dt><dd class="tnum">${esc(d.month.doubleHours.toFixed(2))}${d.month.pendingHours ? ` <span class="pill warn">${esc(d.month.pendingHours.toFixed(2))} waiting approval</span>` : ''}</dd>
        <dt>Deduction hours</dt><dd class="tnum">${esc(d.month.deductionHours.toFixed(2))}</dd><dt>Penalties</dt><dd class="tnum">${esc(OSC.fmtINR(d.month.penalties))}</dd>
        <dt>Estimated bill</dt><dd class="tnum"><b>${esc(OSC.fmtINR(d.month.estimateNet))}</b> <span style="color:var(--muted);font-size:12px">incl. GST, after penalties</span></dd></dl></div>
      <div class="card"><h3>${icon('list-checks')}People on duty per day · last 30 days</h3>${trendSvg(d.trend, maxTrend, reqTotal)}</div>
      <div class="card"><h3>${icon('building-2')}Active staff</h3><div class="tablebox" style="border:0"><table class="t"><tbody>${d.staffBy.map((s) => `<tr><td>${esc(s.deptCode)} · ${esc(s.company)}</td><td class="n">${s.count}</td></tr>`).join('')}</tbody></table></div>
        <div class="row" style="margin-top:10px"><span class="pill ok">${d.joiners} joined this month</span><span class="pill neu">${d.exits} exited this month</span></div></div>
    </div>
    <div style="font-size:12px;color:var(--muted)">Updated ${esc(OSC.fmtDateTime(d.now))} · refreshes every minute${d.lastRun ? ' · punches processed ' + esc(OSC.fmtDateTime(d.lastRun).slice(12)) : ''}</div></div>`;
  clearInterval(ticker);
  ticker = setInterval(() => {
    document.querySelectorAll('[data-since]').forEach((el) => { el.textContent = hm((Date.now() - Date.parse(el.dataset.since)) / 3600000); });
  }, 30000);
}

function trendSvg(trend, max, req) {
  const W = 420, H = 150, l = 28, r = 8, t = 10, b = 22, n = trend.length, bw = (W - l - r) / n - 2;
  const x = (i) => l + i * (W - l - r) / n, y = (v) => t + (H - t - b) * (1 - v / max);
  const grid = [0, Math.round(max / 2), max].map((v) => `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${l - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${v}</text>`).join('');
  const bars = trend.map((d, i) => `<rect x="${x(i)}" y="${y(d.people)}" width="${bw}" height="${y(0) - y(d.people)}" rx="2" fill="var(--primary)" opacity="${i === n - 1 ? 1 : 0.75}"><title>${OSC.fmtDate(d.date)}: ${d.people}</title></rect>`).join('');
  const reqLine = req ? `<line x1="${l}" x2="${W - r}" y1="${y(Math.min(req, max))}" y2="${y(Math.min(req, max))}" stroke="var(--ink)" stroke-dasharray="4 4"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="People on duty per day for 30 days">${grid}${bars}${reqLine}
    <text x="${x(0)}" y="${H - 6}" font-size="10" fill="var(--muted)">${OSC.fmtDate(trend[0].date).slice(0, 6)}</text><text x="${W - r}" y="${H - 6}" font-size="10" text-anchor="end" fill="var(--muted)">${OSC.fmtDate(trend[n - 1].date).slice(0, 6)}</text></svg>
    <div style="font-size:12px;color:var(--muted)">Dashed line: required per day (Day + Night, all departments)</div>`;
}
