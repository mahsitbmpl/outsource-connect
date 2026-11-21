/* Phase 6: System health (Admin) and the parallel-run checker (register vs system). */
import { api, apiFast } from './api.js';
import { esc, icon, toast, skeleton, emptyState, setTitle, setBusy, toCSV, download, parseCSV, $, $$ } from './ui.js';
import { state, today } from './state.js';

const OSC = window.OSC;
const PILL = { ok: 'ok', warn: 'warn', bad: 'bad' };
const WORD = { ok: 'Good', warn: 'Check', bad: 'Act now' };

// =============================== System health ===============================
export async function healthView(c) {
  setTitle('System health');
  c.innerHTML = skeleton(8);
  const h = await api('system.health');
  const maxCells = Math.max(...h.tabs.map((t) => t.cells), 1);
  const maxRun = Math.max(h.runtimeLimit * 0.25, ...h.runtime.map((r) => r.minutes));
  c.innerHTML = `<div class="note">${icon('shield-check')}<span>Version ${esc(h.version)} · checked ${esc(OSC.fmtDateTime(h.now))}. Items marked <b>Act now</b> need attention; see the Admin guide for what to do.</span></div>
    <div class="card"><h2>${icon('shield-check')}Checks</h2><div class="tablebox" style="border:0"><table class="t"><tbody>
      ${h.items.map((i) => `<tr><td style="width:32%"><b>${esc(i.label)}</b></td><td><span class="pill ${PILL[i.status] || 'neu'}">${WORD[i.status] || i.status}</span></td><td>${esc(i.text)}</td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:12px"><button class="btn primary sm" id="hInt">${icon('shield-check')}Run tamper check now</button><button class="btn ghost sm" id="hSpeed">${icon('clock')}Speed check</button><span class="sp"></span><span style="font-size:12px;color:var(--muted)">The tamper check reads every punch; with a lot of data it can take a minute.</span></div>
      <div id="hOut"></div></div>
    <div class="grid g2">
      <div class="card"><h2>${icon('layers')}Sheet size</h2><p style="font-size:13px;color:var(--muted);margin-bottom:8px">${OSC.groupIN(h.totalCells, 0)} of ${OSC.groupIN(h.cellLimit, 0)} cells (${(h.totalCells / h.cellLimit * 100).toFixed(1)} %)${h.growth ? ` · about ${OSC.groupIN(h.growth.punchesPerDay, 0)} punches a day, ${OSC.groupIN(h.growth.cellsPerYear, 0)} new cells a year` : ''}. Old years move to archive files every January.</p>
        <div class="bar" style="margin-bottom:12px"><i style="width:${Math.min(100, h.totalCells / h.cellLimit * 100).toFixed(1)}%"></i></div>
        <div class="tablebox" style="border:0;max-height:360px"><table class="t"><thead><tr><th>Tab</th><th class="n">Data rows</th><th class="n">Cells</th><th style="width:30%"></th></tr></thead><tbody>
        ${h.tabs.slice(0, 16).map((t) => `<tr><td>${esc(t.name)}</td><td class="n tnum">${OSC.groupIN(t.dataRows, 0)}</td><td class="n tnum">${OSC.groupIN(t.cells, 0)}</td><td><div class="bar"><i style="width:${(t.cells / maxCells * 100).toFixed(1)}%"></i></div></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h2>${icon('zap')}Automatic run time (last 7 days)</h2><p style="font-size:13px;color:var(--muted);margin-bottom:8px">Google allows ${h.runtimeLimit} minutes a day for automatic jobs on a free account.</p>
        <div style="display:grid;gap:6px">${h.runtime.map((r) => `<div class="row" style="gap:8px"><span class="tnum" style="width:92px;font-size:12px">${esc(OSC.fmtDate(r.date))}</span><div class="bar" style="flex:1"><i style="width:${Math.min(100, r.minutes / maxRun * 100).toFixed(1)}%"></i></div><span class="tnum" style="width:70px;text-align:right;font-size:12px">${r.minutes} min</span></div>`).join('')}</div></div>
    </div>`;
  $('#hInt').onclick = async (e) => {
    const b = e.currentTarget; setBusy(b, true);
    try {
      const r = await api('system.integrity');
      $('#hOut').innerHTML = `<div class="note ${r.ok ? '' : 'bad'}" style="margin-top:12px">${icon(r.ok ? 'circle-check' : 'triangle-alert')}<span>${r.ok ? 'No changes found.' : '<b>Check codes do not match.</b> ' + r.problems.map(esc).join('<br>') + '<br>Someone may have edited the Google Sheet by hand. Compare the row with the latest backup (Admin guide, section "Tamper check").'}
        <br><span style="font-size:12px">${r.tables.map((t) => esc(t.table) + ': ' + OSC.groupIN(t.checked, 0) + ' rows checked' + (t.notCovered ? ', ' + OSC.groupIN(t.notCovered, 0) + ' older rows without check codes' : '')).join(' · ')}</span></span></div>`;
    } catch (ex) { toast(ex.message, 'bad'); }
    setBusy(b, false);
  };
  $('#hSpeed').onclick = async (e) => {
    const b = e.currentTarget; setBusy(b, true);
    try {
      const r = await api('system.speed');
      $('#hOut').innerHTML = `<div class="tablebox" style="margin-top:12px"><table class="t"><thead><tr><th>Screen (measured on Google, read only)</th><th class="n">Time</th></tr></thead><tbody>
        ${r.results.map((x) => `<tr><td>${esc(x.label)}${x.error ? ` <span class="pill bad">${esc(x.error)}</span>` : ''}</td><td class="n tnum">${(x.ms / 1000).toFixed(2)} s</td></tr>`).join('')}</tbody></table></div>
        <p style="font-size:12px;color:var(--muted);margin-top:6px">Time inside Google's server only; the network adds about a second.</p>`;
    } catch (ex) { toast(ex.message, 'bad'); }
    setBusy(b, false);
  };
}

// =============================== Parallel run: register vs system ===============================
let last = null;
export async function parallelView(c) {
  setTitle('Parallel run check');
  c.innerHTML = `<div class="card"><h2>${icon('scale')}Compare the paper register with the system</h2>
      <p style="margin-bottom:10px">During the parallel month, type the register into the template (one row per person per date: Employee ID, Date, Hours) and upload it here. Each row is compared with the system's <b>billable hours</b> for that person and date. Up to 62 days per file.</p>
      <div class="row"><a class="btn ghost sm" href="templates/parallel_run_template.xlsx" download>${icon('file-spreadsheet')}Excel template</a><a class="btn ghost sm" href="templates/parallel_run_template.csv" download>${icon('download')}CSV template</a><span class="sp"></span>
        <label style="font-size:13px">Allowed difference <select id="pTol" class="chip"><option value="0.01">none</option><option value="0.5">up to 0.5 h</option><option value="1">up to 1 h</option></select></label>
        <label class="btn primary sm" style="cursor:pointer">${icon('upload')}Choose file<input id="pFile" type="file" accept=".xlsx,.csv,text/csv" hidden></label></div></div>
    <div id="pOut"></div>`;
  $('#pFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $('#pOut').innerHTML = skeleton(5);
    try {
      let table;
      if (/\.xlsx$/i.test(f.name)) { if (!window.readXlsxFile) throw new Error('Excel reader did not load. Save the file as CSV and try again.'); table = await window.readXlsxFile(f); }
      else table = parseCSV(await f.text());
      last = await compareRegister(table, f.name);
      drawParallel();
    } catch (ex) { $('#pOut').innerHTML = `<div class="note bad">${icon('circle-x')}<span>${esc(ex.message)}</span></div>`; }
    e.target.value = '';
  };
  $('#pTol').onchange = () => { if (last) drawParallel(); };
  if (last) drawParallel();
}

function cellDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10); // Excel date cells arrive as midnight UTC
  if (typeof v === 'number' && v > 30000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  return OSC.parseDate(String(v || '').trim());
}
async function compareRegister(table, fileName) {
  if (!table.length) throw new Error('The file is empty');
  const head = table[0].map((x) => String(x || '').trim().toLowerCase());
  const ci = (names) => head.findIndex((x) => names.includes(x));
  const iId = ci(['employee id', 'staff id', 'id', 'emp id']), iDate = ci(['date', 'duty date']), iH = ci(['hours', 'total hours', 'hrs', 'register hours']);
  if (iId < 0 || iDate < 0 || iH < 0) throw new Error('Columns needed: Employee ID, Date, Hours (first row). Use the template.');
  const reg = {}, bad = [];
  table.slice(1).forEach((r, k) => {
    const id = String(r[iId] || '').trim().toUpperCase(), date = cellDate(r[iDate]), hrs = Number(String(r[iH] == null ? '' : r[iH]).replace(',', '.'));
    if (!id && !r[iDate]) return;
    if (!id || !date || !isFinite(hrs)) { bad.push(k + 2); return; }
    const key = id + ':' + date; reg[key] = (reg[key] || 0) + hrs;
  });
  const dates = Object.keys(reg).map((k) => k.split(':')[1]).sort();
  if (!dates.length) throw new Error('No valid rows found' + (bad.length ? ' (problem rows: ' + bad.slice(0, 10).join(', ') + ')' : ''));
  const from = dates[0], to = dates[dates.length - 1];
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 62) throw new Error('The file covers more than 62 days. Split it by month.');
  const res = await apiFast('duties.list', { from, to });
  const sys = {}, names = {};
  res.days.forEach((d) => { sys[d.key] = d; names[d.staffId] = d.name; });
  const staff = await apiFast('staff.list', {});
  (staff.rows || staff).forEach((s) => { if (!names[s.staffId]) names[s.staffId] = (s.title ? s.title + ' ' : '') + s.fullName; });
  // people of the departments in the register who punched but are missing from it count as "only in system"
  const deptOf = {}; (staff.rows || staff).forEach((s) => { deptOf[s.staffId] = s.deptCode; });
  const regDepts = {}; Object.keys(reg).forEach((k) => { const id = k.split(':')[0]; regDepts[deptOf[id] || id.replace(/\d+$/, '')] = 1; });
  const keys = Array.from(new Set(Object.keys(reg).concat(Object.keys(sys).filter((k) => regDepts[sys[k].deptCode])))).sort();
  const rows = keys.map((k) => {
    const [id, date] = k.split(':'), s = sys[k];
    return { staffId: id, name: names[id] || id, date, dept: s ? s.deptCode : id.replace(/\d+$/, ''), reg: reg[k], sys: s ? s.billable : null, total: s ? s.total : null, pending: s ? s.pending : 0, open: s ? s.open : false };
  });
  return { fileName, from, to, rows, bad };
}
function drawParallel() {
  const tol = Number($('#pTol').value), L = last;
  const kind = (r) => r.reg == null ? 'Only in system' : r.sys == null ? 'Only in register' : Math.abs(r.reg - r.sys) <= tol ? 'Match' : 'Different';
  L.rows.forEach((r) => { r.kind = kind(r); r.diff = r.reg != null && r.sys != null ? Math.round((r.sys - r.reg) * 100) / 100 : null; });
  const cnt = (k) => L.rows.filter((r) => r.kind === k).length, n = L.rows.length, match = cnt('Match');
  const sum = (f) => Math.round(L.rows.reduce((a, r) => a + (Number(r[f]) || 0), 0) * 100) / 100;
  const depts = Array.from(new Set(L.rows.map((r) => r.dept))).sort();
  const issues = L.rows.filter((r) => r.kind !== 'Match').sort((a, b) => Math.abs(b.diff || 99) - Math.abs(a.diff || 99));
  $('#pOut').innerHTML = `<div class="grid g4">
      <div class="card kpi"><div class="l">Rows compared</div><div class="v">${n}</div><div class="d">${esc(L.fileName)} · ${esc(OSC.fmtDate(L.from))} to ${esc(OSC.fmtDate(L.to))}</div></div>
      <div class="card kpi"><div class="l">Match</div><div class="v" style="color:var(--ok)">${n ? Math.round(match / n * 1000) / 10 : 0}%</div><div class="d">${match} of ${n}</div></div>
      <div class="card kpi"><div class="l">Hours: register · system</div><div class="v" style="font-size:22px">${OSC.groupIN(sum('reg'), 2)} · ${OSC.groupIN(sum('sys'), 2)}</div><div class="d">difference ${OSC.groupIN(Math.round((sum('sys') - sum('reg')) * 100) / 100, 2)} h</div></div>
      <div class="card kpi"><div class="l">To look at</div><div class="v" style="color:${issues.length ? 'var(--bad)' : 'var(--ok)'}">${issues.length}</div><div class="d">${cnt('Different')} different · ${cnt('Only in register')} only in register · ${cnt('Only in system')} only in system</div></div></div>
    ${L.bad.length ? `<div class="note warn">${icon('triangle-alert')}<span>Rows skipped (missing ID, date or hours): ${L.bad.slice(0, 20).join(', ')}${L.bad.length > 20 ? '…' : ''}</span></div>` : ''}
    <div class="card"><h2>By department</h2><div class="tablebox" style="border:0"><table class="t"><thead><tr><th>Department</th><th class="n">Rows</th><th class="n">Match</th><th class="n">Register hours</th><th class="n">System hours</th><th class="n">Difference</th></tr></thead><tbody>
      ${depts.map((d) => { const rs = L.rows.filter((r) => r.dept === d), m = rs.filter((r) => r.kind === 'Match').length, a = rs.reduce((x, r) => x + (r.reg || 0), 0), b = rs.reduce((x, r) => x + (r.sys || 0), 0);
        return `<tr><td>${esc(d)}</td><td class="n tnum">${rs.length}</td><td class="n tnum">${rs.length ? Math.round(m / rs.length * 100) : 0}%</td><td class="n tnum">${OSC.groupIN(a, 2)}</td><td class="n tnum">${OSC.groupIN(b, 2)}</td><td class="n tnum">${OSC.groupIN(Math.round((b - a) * 100) / 100, 2)}</td></tr>`; }).join('')}</tbody></table></div></div>
    <div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">Differences (${issues.length})</h2><span class="sp"></span><button class="btn ghost sm" id="pCsv">${icon('download')}Download CSV</button></div>
      ${issues.length ? `<div class="tablebox" style="border:0"><table class="t"><thead><tr><th>Date</th><th>Employee</th><th>Result</th><th class="n">Register</th><th class="n">System</th><th class="n">System − register</th><th>Hint</th></tr></thead><tbody>
      ${issues.slice(0, 400).map((r) => `<tr><td class="nw">${esc(OSC.fmtDate(r.date))}</td><td><b>${esc(r.name)}</b><div style="font-size:12px;color:var(--muted)">${esc(r.staffId)}</div></td>
        <td><span class="pill ${r.kind === 'Different' ? 'warn' : 'bad'}">${esc(r.kind)}</span></td><td class="n tnum">${r.reg == null ? '—' : OSC.groupIN(r.reg, 2)}</td><td class="n tnum">${r.sys == null ? '—' : OSC.groupIN(r.sys, 2)}</td><td class="n tnum">${r.diff == null ? '—' : (r.diff > 0 ? '+' : '') + OSC.groupIN(r.diff, 2)}</td>
        <td style="font-size:12px">${esc(hint(r))}</td></tr>`).join('')}</tbody></table></div>` : emptyState('circle-check', 'Register and system agree for every row.')}</div>`;
  $('#pCsv').onclick = () => download('parallel_run_differences_' + L.from + '_' + L.to + '.csv', toCSV(issues, [
    { label: 'Date', key: 'date' }, { label: 'Employee ID', key: 'staffId' }, { label: 'Name', key: 'name' }, { label: 'Result', key: 'kind' },
    { label: 'Register hours', key: 'reg' }, { label: 'System hours', key: 'sys' }, { label: 'System minus register', key: 'diff' }, { label: 'Hint', get: hint }]));
}
function hint(r) {
  if (r.kind === 'Only in register') return 'No punch on the tablet that day: forgot to punch, face not recognised, or wrong ID in the register';
  if (r.kind === 'Only in system') return 'Punched on the tablet but not in the register';
  if (r.open) return 'Duty still has a missing IN/OUT: fix it on the Exceptions page';
  if (r.pending) return r.pending + ' h beyond 12 waiting for approval (not counted yet)';
  if (r.diff < 0 && r.diff >= -1) return 'Late arrival rounding or extra-time rounding: check the duty under Duties → How?';
  if (r.diff > 0) return 'System counted more: check the register and the punch times';
  return 'Check the punch times under Duties';
}
