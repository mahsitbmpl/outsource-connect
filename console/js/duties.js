/* Phase 3 console pages: duties, rules, rule test report. */
import { api, apiFast } from './api.js';
import { esc, icon, toast, dialog, field, formData, skeleton, emptyState, setTitle, toCSV, download, showErrors, $, $$ } from './ui.js';
import { state, isAdmin, today, deptName, go } from './state.js';
import { dutyActions } from './exceptions.js';

const OSC = window.OSC, RULES = window.OSCRules;
const clock = (iso) => (iso ? OSC.fmtDateTime(iso).slice(12) : '—');
const h2 = (x) => (x === '' || x == null ? '—' : Number(x).toFixed(2));
const STATUS = { Closed: '<span class="pill ok">Closed</span>', Open: '<span class="pill out">On duty</span>', MissingOut: '<span class="pill bad">Missing OUT</span>', MissingIn: '<span class="pill bad">Missing IN</span>' };
const TYPE = { MISSING_OUT: 'Missing OUT', MISSING_IN: 'Missing IN', LATE_GRACE: 'Late arrival: grace decision', LONG_DUTY: 'Over 12 h: approval', SHORT_DUTY: 'Short duty review' };

// ---------- duties ----------
const f = { from: null, to: null, dept: '', q: '', tab: 'duties' };
export async function dutiesView(c) {
  setTitle('Duties');
  f.to = f.to || today(); f.from = f.from || OSC.addDays(today(), -1);
  c.innerHTML = `<div class="row" style="align-items:flex-end">
      <div class="field" style="max-width:180px"><label for="df">From</label><input type="date" id="df" value="${esc(f.from)}"></div>
      <div class="field" style="max-width:180px"><label for="dt">To</label><input type="date" id="dt" value="${esc(f.to)}" max="${esc(today())}"></div>
      <div class="field" style="max-width:220px"><label for="dd">Department</label><select id="dd"><option value="">All</option>${state.boot.departments.map((d) => `<option value="${esc(d.code)}"${f.dept === d.code ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <label class="search">${icon('search')}<input id="dq" type="search" placeholder="Name or Employee ID" value="${esc(f.q)}"></label>
      <span class="sp"></span><button class="btn ghost" id="dn">${icon('history')}Process new punches now</button><button class="btn ghost" id="dx">${icon('download')}Export CSV</button></div>
    <div class="chips"><button class="chip${f.tab === 'duties' ? ' on' : ''}" data-tab="duties">Duties</button><button class="chip${f.tab === 'days' ? ' on' : ''}" data-tab="days">Per person per date (8 / 4 / Double)</button><button class="chip${f.tab === 'exc' ? ' on' : ''}" data-tab="exc">Needs attention <span class="ct" id="exn">…</span></button></div>
    <div id="dl">${skeleton(8)}</div><div class="row" style="color:var(--muted);font-size:12px"><span id="lr"></span></div>`;
  let data = null, exc = [];
  const draw = () => {
    if (!data) return;
    const q = f.q.toLowerCase(), match = (x) => !q || (x.name || '').toLowerCase().includes(q) || x.staffId.toLowerCase().includes(q);
    $('#lr').textContent = data.lastRun ? 'Punches last processed ' + OSC.fmtDateTime(data.lastRun) + '. New punches are processed every 5 minutes.' : 'Automatic processing has not run yet. Click "Process new punches now", and turn it on from the Sheet menu.';
    $('#exn').textContent = exc.length;
    if (f.tab === 'duties') {
      const rows = data.duties.filter(match).sort((a, b) => (a.dutyDate + a.staffId + a.inAt < b.dutyDate + b.staffId + b.inAt ? 1 : -1));
      $('#dl').innerHTML = rows.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Date</th><th>Employee</th><th>Shift</th><th class="n">IN</th><th class="n">OUT</th><th class="n">Counted from</th><th class="n">Hours</th><th class="n">Final</th><th>Status</th><th>Rate</th><th></th></tr></thead><tbody>
        ${rows.map((d) => `<tr><td class="tnum nw">${esc(OSC.fmtDate(d.dutyDate))}</td><td><div class="who"><b>${esc(d.name)}</b><span>${esc(d.staffId)} · ${esc(d.deptCode)}</span></div></td><td>${esc(d.shift || '—')}</td>
          <td class="n">${esc(clock(d.inAt))}</td><td class="n">${esc(clock(d.outAt))}</td><td class="n">${esc(clock(d.startAt))}</td><td class="n">${esc(h2(d.systemHours))}${d.lateGrace ? `<div style="font-size:12px;color:var(--warn)">grace: ${esc(h2(d.graceHours))}</div>` : ''}</td>
          <td class="n"><b>${esc(h2(d.finalHours))}</b>${d.finalSource && d.finalSource !== 'system' ? `<div style="font-size:12px;color:var(--muted)">${esc(d.finalSource)}</div>` : ''}</td><td>${STATUS[d.status] || esc(d.status)}</td>
          <td class="nw">${d.ratePerDuty ? esc(OSC.fmtINR(d.ratePerDuty)) : '<span class="pill warn">No rate</span>'}</td><td><button class="btn link sm" data-why="${esc(d.dutyId)}">How?</button></td></tr>`).join('')}
        </tbody></table></div>` : `<div class="card">${emptyState('clock', 'No duties in these dates.')}</div>`;
      $$('[data-why]', c).forEach((b) => { b.onclick = () => explain(data.duties.find((d) => d.dutyId === b.dataset.why)); });
    } else if (f.tab === 'days') {
      const rows = data.days.filter(match).sort((a, b) => (a.dutyDate + a.staffId < b.dutyDate + b.staffId ? 1 : -1));
      $('#dl').innerHTML = rows.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Date</th><th>Employee</th><th class="n">Total</th><th class="n">8 Hrs</th><th class="n">4 Hrs</th><th class="n">Double duty</th><th class="n">Waiting approval</th><th class="n">Billable now</th><th class="n">Duties</th></tr></thead><tbody>
        ${rows.map((d) => `<tr><td class="tnum nw">${esc(OSC.fmtDate(d.dutyDate))}</td><td><div class="who"><b>${esc(d.name)}</b><span>${esc(d.staffId)}</span></div></td><td class="n"><b>${esc(h2(d.total))}</b>${d.open ? ' <span class="pill out">open</span>' : ''}</td>
          <td class="n">${esc(h2(d.h8))}</td><td class="n">${esc(h2(d.h4))}</td><td class="n">${esc(h2(d.dd))}</td><td class="n">${d.pending ? `<span class="pill warn">${esc(h2(d.pending))}</span>` : '—'}</td><td class="n"><b>${esc(h2(d.billable))}</b></td><td class="n">${esc((d.billable / 12).toFixed(3))}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="card">${emptyState('clock', 'No duties in these dates.')}</div>`;
    } else {
      const rows = exc.filter(match);
      $('#dl').innerHTML = `<div class="note">${icon('triangle-alert')}<span>These items are kept up to date automatically from the punches. The buttons to fix them (set OUT, add IN, approve, give grace, override) come with the Exceptions page in Phase 4.</span></div>` +
        (rows.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Date</th><th>Employee</th><th>Type</th><th>Details</th><th>Suggestion</th><th>Since</th></tr></thead><tbody>
        ${rows.map((x) => `<tr><td class="tnum nw">${esc(OSC.fmtDate(x.dutyDate))}</td><td><div class="who"><b>${esc(x.name)}</b><span>${esc(x.staffId)}</span></div></td>
          <td><span class="pill ${x.severity === 'red' ? 'bad' : x.severity === 'amber' ? 'warn' : 'neu'}">${esc(TYPE[x.type] || x.type)}</span></td><td>${esc(x.summary)}</td>
          <td class="nw">${x.suggestion && x.suggestion.outAt ? 'OUT ' + esc(OSC.fmtDateTime(x.suggestion.outAt)) : x.suggestion && x.suggestion.inAt ? 'IN ' + esc(OSC.fmtDateTime(x.suggestion.inAt)) : ''}</td><td class="tnum nw">${esc(OSC.fmtDateTime(x.createdAt))}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="card">${emptyState('circle-check', 'Nothing needs attention.')}</div>`);
    }
  };
  const load = async () => {
    [data, exc] = await Promise.all([apiFast('duties.list', { from: f.from, to: f.to, deptCode: f.dept }), apiFast('exceptions.list', { status: 'Open' })]);
    draw();
  };
  const reload = () => { $('#dl').innerHTML = skeleton(6); load().catch((e) => { $('#dl').innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }); };
  $('#df').onchange = (e) => { f.from = e.target.value; reload(); };
  $('#dt').onchange = (e) => { f.to = e.target.value; reload(); };
  $('#dd').onchange = (e) => { f.dept = e.target.value; reload(); };
  $('#dq').oninput = (e) => { f.q = e.target.value.trim(); draw(); };
  $$('[data-tab]', c).forEach((b) => { b.onclick = () => { f.tab = b.dataset.tab; $$('[data-tab]', c).forEach((x) => x.classList.toggle('on', x === b)); draw(); }; });
  $('#dn').onclick = async () => { try { const r = await api('duties.processNow'); toast(r.skipped ? 'Processing is already running' : 'Processed ' + (r.staff || 0) + ' people'); reload(); } catch (e) { toast(e.message, 'bad'); } };
  $('#dx').onclick = () => { if (data) download('duties-' + f.from + '-to-' + f.to + '.csv', toCSV(data.duties, [{ label: 'Date', get: (r) => OSC.fmtDate(r.dutyDate) }, { label: 'Employee ID', key: 'staffId' }, { label: 'Name', key: 'name' }, { label: 'Department', key: 'deptCode' }, { label: 'Shift', key: 'shift' }, { label: 'IN', get: (r) => OSC.fmtDateTime(r.inAt) }, { label: 'OUT', get: (r) => OSC.fmtDateTime(r.outAt) }, { label: 'Counted from', get: (r) => OSC.fmtDateTime(r.startAt) }, { label: 'System hours', key: 'systemHours' }, { label: 'Final hours', key: 'finalHours' }, { label: 'Status', key: 'status' }, { label: 'Rate', key: 'ratePerDuty' }, { label: 'How calculated', key: 'explain' }])); };
  await load();
}
function explain(d) {
  dialog({ title: 'How ' + d.staffId + ' on ' + OSC.fmtDate(d.dutyDate) + ' was calculated', submitLabel: 'Close', noCancel: true,
    body: `<dl class="kv"><dt>IN</dt><dd>${esc(OSC.fmtDateTime(d.inAt) || 'missing')}</dd><dt>OUT</dt><dd>${esc(OSC.fmtDateTime(d.outAt) || 'missing')}</dd>
      <dt>Counted from</dt><dd>${esc(OSC.fmtDateTime(d.startAt) || '—')}</dd><dt>Steps</dt><dd>${esc(d.explain)}</dd><dt>System hours</dt><dd>${esc(h2(d.systemHours))}</dd>
      ${d.lateGrace ? `<dt>With grace</dt><dd>${esc(h2(d.graceHours))} (Ops manager decides)</dd>` : ''}<dt>Final hours</dt><dd><b>${esc(h2(d.finalHours))}</b> ${esc(d.finalSource || '')}</dd>
      <dt>Shift</dt><dd>${esc(d.shift)}</dd><dt>Company and rate</dt><dd>${esc(d.companyId)} · ${d.ratePerDuty ? esc(OSC.fmtINR(d.ratePerDuty)) + ' + GST ' + esc(d.gstPct) + '%' : 'no rate card for this date'}</dd>
      <dt>Rule version</dt><dd>${esc(d.ruleId)}</dd></dl>
      <div class="row" style="margin-top:14px">${d.inAt && d.outAt ? '<button type="button" class="btn ghost sm" data-da="override">Override hours</button><button type="button" class="btn ghost sm" data-da="shift">Change shift tag</button>' : ''}
        ${d.status === 'Closed' && d.systemHours > 24 ? '<button type="button" class="btn ghost sm" data-da="split">Split duty</button>' : ''}
        ${d.inAt && !d.outAt ? '<button type="button" class="btn primary sm" data-da="setOut">Set OUT</button>' : ''}${!d.inAt && d.outAt ? '<button type="button" class="btn primary sm" data-da="addIn">Add IN</button>' : ''}</div>`,
    onOpen: (form) => {
      form.querySelectorAll('[data-da]').forEach((b) => {
        b.onclick = async () => {
          form.closest('.scrim').remove();
          const a = b.dataset.da, R0 = window.OSCRules.normalise({}).rules;
          const sugg = a === 'setOut' ? OSC.nowISTString(window.OSCRules.suggestOut(Date.parse(d.inAt), R0)) : a === 'addIn' ? OSC.nowISTString(window.OSCRules.suggestIn(Date.parse(d.outAt), R0)) : null;
          const r = await dutyActions[a](d, sugg);
          if (r) go(location.hash);
        };
      });
    } });
}

// ---------- rules ----------
const FIELDS = [
  ['boundaries', 'Duty boundaries (24-hour, comma separated)', 'text'], ['graceMin', 'Grace on arrival (minutes)', 'number'], ['earlySnapMin', 'Early arrival not counted within (minutes before)', 'number'],
  ['lateRoundUp', 'Late arrival counts from the next full hour', 'bool'], ['lateGraceReview', 'Ask Ops manager about grace on later hours', 'bool'],
  ['extraHalfFromMin', 'Extra minutes counted as 0.5 h from', 'number'], ['extraFullFromMin', 'Extra minutes counted as 1 h from', 'number'],
  ['split8', '"8 Hrs" column', 'number'], ['split4', '"4 Hrs" column', 'number'], ['dutyHours', 'One duty (hours)', 'number'],
  ['dayFrom', 'Day shift if IN from', 'time'], ['dayTo', 'Day shift if IN until', 'time'], ['dupWindowMin', 'Ignore repeat punches within (minutes)', 'number'],
  ['openAmberH', 'Open duty amber after (hours)', 'number'], ['openRedH', 'Open duty red / missing OUT after (hours)', 'number'],
  ['over12NeedsApproval', 'Hours beyond one duty need approval', 'bool'], ['shortDutyBelowH', 'Short-duty review below (hours)', 'number']
];
const show = (v) => (Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v === false ? 'No' : String(v));
export async function rulesView(c) {
  setTitle('Attendance rules');
  c.innerHTML = skeleton(8);
  const r = await apiFast('rules.list');
  const cur = r.current.rules;
  c.innerHTML = `<div class="row"><span style="color:var(--muted)">Rules in force today: <b>${esc(r.current.ruleId)}</b>. Every change is a new version from the 1st of a month; past and locked months keep their rules.</span><span class="sp"></span>
      <a class="btn ghost" href="#/rule-tests">${icon('list-checks')}Rule test report</a>${isAdmin() ? `<button class="btn ghost" id="rb">${icon('history')}Recalculate duties…</button><button class="btn primary" id="nv">${icon('plus')}New rule version</button>` : ''}</div>
    <div class="card"><h3>Current values</h3><div class="tablebox" style="border:0"><table class="t"><tbody>${FIELDS.map(([k, label]) => `<tr><td>${esc(label)}</td><td><b>${esc(show(cur[k]))}</b></td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h3>Versions</h3><div class="tablebox" style="border:0"><table class="t"><thead><tr><th>Version</th><th>From</th><th>Department</th><th>Note</th><th>Added by</th></tr></thead><tbody>
      ${r.versions.map((v) => `<tr><td><b>${esc(v.ruleId)}</b></td><td class="tnum">${esc(OSC.fmtDate(v.effectiveFrom))}</td><td>${esc(v.deptCode === 'ALL' ? 'All departments' : deptName(v.deptCode))}</td><td>${esc(v.note)}</td><td>${esc(v.createdBy)} · ${esc(OSC.fmtDateTime(v.createdAt))}</td></tr>`).join('')}</tbody></table></div></div>`;
  const nv = $('#nv');
  if (nv) nv.onclick = async () => {
    const first = OSC.addDays(today().slice(0, 8) + '01', 32).slice(0, 8) + '01';
    const res = await dialog({ title: 'New rule version', submitLabel: 'Save new version',
      body: `<div class="note warn">${icon('triangle-alert')}<span>Use "Preview impact" first. New rules apply from the start date; then use "Recalculate duties" for open months.</span></div><div class="form" style="margin-top:12px">
        ${field('effectiveFrom', 'Starts on (1st of a month)', { type: 'date', value: first, required: true })}
        ${FIELDS.map(([k, label, t]) => t === 'bool' ? field(k, label, { type: 'select', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], value: String(cur[k]) }) : field(k, label, { type: t === 'time' ? 'text' : t, value: show(cur[k]), attrs: t === 'number' ? 'step="1" min="0"' : '' })).join('')}
        ${field('note', 'What changed', { wide: true })}${field('reason', 'Reason / approval reference', { type: 'textarea', required: true, wide: true })}</div>
        <div class="formbar" style="justify-content:flex-start"><button type="button" class="btn ghost" id="pv">Preview impact on the last 30 days</button></div><div id="pvr"></div>`,
      onOpen: (form) => {
        $('#pv', form).onclick = async () => {
          const d = formData(form), params = {}; FIELDS.forEach(([k]) => { params[k] = d[k]; });
          const n = RULES.normalise(params);
          if (!n.ok) { showErrors(form, n.errors); return; }
          $('#pvr', form).innerHTML = '<div class="skel"></div>';
          try {
            const p = await api('rules.preview', { params });
            $('#pvr', form).innerHTML = `<div class="note">${icon('list-checks')}<span>${p.changed} of ${p.duties} duties would change: ${h2(p.hoursBefore)} h → ${h2(p.hoursAfter)} h.</span></div>` + (p.sample.length ? `<div class="tablebox" style="max-height:220px"><table class="t"><thead><tr><th>Date</th><th>Employee</th><th class="n">Now</th><th class="n">New</th></tr></thead><tbody>${p.sample.map((x) => `<tr><td>${esc(OSC.fmtDate(x.dutyDate))}</td><td>${esc(x.name)}</td><td class="n">${esc(h2(x.before))}</td><td class="n">${esc(h2(x.after))}</td></tr>`).join('')}</tbody></table></div>` : '');
          } catch (e) { $('#pvr', form).innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }
        };
      },
      onSubmit: async (form) => {
        const d = formData(form), params = {}; FIELDS.forEach(([k]) => { params[k] = d[k]; });
        const n = RULES.normalise(params);
        if (!n.ok) { showErrors(form, n.errors); throw new Error('Please correct the highlighted fields'); }
        return api('rules.add', { params, effectiveFrom: d.effectiveFrom, note: d.note, reason: d.reason });
      } });
    if (res) { toast('Rule version ' + res.ruleId + ' saved from ' + OSC.fmtDate(res.effectiveFrom)); rulesView(c); }
  };
  const rb = $('#rb');
  if (rb) rb.onclick = async () => {
    const res = await dialog({ title: 'Recalculate duties', submitLabel: 'Recalculate', body: `<p>Recalculates all duties from this date with the rules in force on each date. Locked months never change. Ops manager decisions are kept.</p><div class="form" style="margin-top:12px">
      ${field('from', 'From date (up to 62 days back)', { type: 'date', value: today().slice(0, 8) + '01', required: true })}${field('reason', 'Reason', { type: 'textarea', required: true, wide: true })}</div>`,
      onSubmit: (form) => api('duties.rebuild', formData(form)) });
    if (res) toast(`Recalculated ${res.duties} duties for ${res.staff} staff`);
  };
}

// ---------- rule test report ----------
export async function ruleTestsView(c) {
  setTitle('Rule test report');
  const cases = window.OSC_RULE_CASES, R = RULES.normalise({}).rules;
  const ms = (s) => Date.parse(s.replace(' ', 'T') + ':00+05:30');
  let pass = 0;
  const rows = cases.map((k) => {
    const d = RULES.computeDuty(ms(k.in), ms(k.out), R), sp = RULES.split(d.hours, R);
    const ok = d.hours === k.h && (k.g == null || d.graceHours === k.g) && d.dutyDate === (k.date || k.in.slice(0, 10)) && (!k.shift || d.shift === k.shift);
    if (ok) pass++;
    return { k, d, sp, ok };
  });
  const fmt = (s) => { const [dt, tm] = s.split(' '); return OSC.fmtDate(dt) + ' ' + OSC.fmtTime12(+tm.slice(0, 2), +tm.slice(3)); };
  c.innerHTML = `<div class="row"><div class="note${pass === cases.length ? '' : ' bad'}">${icon(pass === cases.length ? 'circle-check' : 'circle-x')}<span><b>${pass} of ${cases.length}</b> cases give the expected hours with the default rules (RV1). Check each line against your manual sheet.</span></div><span class="sp"></span><button class="btn ghost" id="prt">${icon('file-text')}Print</button></div>
    <div class="tablebox" style="max-height:none"><table class="t"><thead><tr><th>Case</th><th>IN</th><th>OUT</th><th>Counted from</th><th class="n">Expected</th><th class="n">Calculated</th><th class="n">8 / 4 / Double</th><th>Shift</th><th></th><th>Why</th></tr></thead><tbody>
    ${rows.map(({ k, d, sp, ok }) => `<tr><td class="nw"><b>${esc(k.id)}</b><div style="font-size:12px;color:var(--muted)">${esc(k.group)}</div></td><td class="tnum nw">${esc(fmt(k.in))}</td><td class="tnum nw">${esc(fmt(k.out))}</td><td class="tnum nw">${esc(d.startClock)}</td>
      <td class="n">${esc(h2(k.h))}${k.g != null ? `<div style="font-size:12px">grace ${esc(h2(k.g))}</div>` : ''}</td><td class="n"><b>${esc(h2(d.hours))}</b>${d.lateGrace ? `<div style="font-size:12px">grace ${esc(h2(d.graceHours))}</div>` : ''}</td>
      <td class="n nw">${esc(h2(sp.h8))} / ${esc(h2(sp.h4))} / ${esc(h2(sp.dd))}</td><td>${esc(d.shift)}</td><td>${ok ? '<span class="pill ok">OK</span>' : '<span class="pill bad">Different</span>'}</td>
      <td style="font-size:12px;min-width:320px;max-width:420px">${esc(d.startHow)}; ${esc(d.endHow)}${k.note ? `<div style="color:var(--muted)">${esc(k.note)}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
  $('#prt').onclick = () => window.print();
}
