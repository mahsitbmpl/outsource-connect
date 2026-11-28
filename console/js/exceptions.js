/* Phase 4: Exceptions (fix buttons), penalties and deductions, duty actions used by the Duties page. */
import { api, apiFast } from './api.js';
import { esc, icon, toast, dialog, field, formData, skeleton, emptyState, setTitle, $, $$ } from './ui.js';
import { state, today } from './state.js';

const OSC = window.OSC;
const REASONS = ['Hospital requirement', 'Emergency', 'Transport problem', 'Tablet fault', 'Forgot to punch', 'Other'];
const TYPE = { MISSING_OUT: ['Missing OUT', 'bad'], MISSING_IN: ['Missing IN', 'bad'], LATE_GRACE: ['Late arrival: grace', 'warn'], LONG_DUTY: ['Over 12 h: approval', 'warn'], SHORT_DUTY: ['Short duty review', 'neu'] };
const h2 = (x) => (x === '' || x == null ? '—' : Number(x).toFixed(2));
const local = (iso) => (iso ? String(iso).slice(0, 16) : '');          // '2026-11-17T20:00' for datetime-local
const toIso = (v) => (v ? v + ':00+05:30' : '');                         // inputs are IST (the tablet and the hospital are in IST)
const reasonFields = (code) => field('reasonCode', 'Reason', { type: 'select', options: REASONS, value: code || '', placeholder: 'Choose', required: true }) + field('note', 'Note (who confirmed, why)', { type: 'textarea', required: true, wide: true });

/** Generic action dialog: extra fields + reason; calls the server and reports. */
export async function act(title, intro, extra, action, build, okText) {
  const r = await dialog({ title, submitLabel: 'Save', body: `${intro ? `<p>${intro}</p>` : ''}<div class="form" style="margin-top:10px">${extra || ''}${reasonFields()}</div>
    <p style="font-size:12px;color:var(--muted);margin-top:8px">Saved with your name and the reason. Raw punches are never changed; a correction is stored next to them.</p>`,
    onSubmit: (form) => api(action, build(formData(form))) });
  if (r) toast(okText || 'Saved');
  return r;
}

// actions on one duty (also used from the Duties page)
export const dutyActions = {
  setOut: (x, sugg) => act('Set OUT · ' + x.name, `IN was ${esc(OSC.fmtDateTime(x.inAt))}. The suggested OUT is the standard end of the duty.`, field('at', 'OUT date and time', { type: 'datetime-local', value: local(sugg), required: true }),
    'fix.setOut', (d) => ({ dutyId: x.dutyId, dutyDate: x.dutyDate, at: toIso(d.at), reasonCode: d.reasonCode, note: d.note }), 'OUT added, duty recalculated'),
  addIn: (x, sugg) => act('Add IN · ' + x.name, `OUT was ${esc(OSC.fmtDateTime(x.outAt))}. The suggested IN is the standard start of the duty.`, field('at', 'IN date and time', { type: 'datetime-local', value: local(sugg), required: true }),
    'fix.addIn', (d) => ({ dutyId: x.dutyId, dutyDate: x.dutyDate, at: toIso(d.at), reasonCode: d.reasonCode, note: d.note }), 'IN added, duty recalculated'),
  split: (x) => act('Split duty · ' + x.name, `${esc(OSC.fmtDateTime(x.inAt))} to ${esc(OSC.fmtDateTime(x.outAt))} (${h2(x.systemHours)} h). The second part starts at the split time.`, field('at', 'Split at', { type: 'datetime-local', value: local(x.inAt).slice(0, 11) + '20:00', required: true }),
    'fix.split', (d) => ({ dutyId: x.dutyId, dutyDate: x.dutyDate, at: toIso(d.at), reasonCode: d.reasonCode, note: d.note }), 'Duty split'),
  override: (x) => act('Override hours · ' + x.name, `System hours: <b>${h2(x.systemHours)}</b>. The Ops manager's decision is final; both figures are kept.`, field('hours', 'Final hours', { type: 'number', value: x.finalHours, required: true, attrs: 'step="0.01" min="0" max="72"' }),
    'decide.override', (d) => ({ dutyId: x.dutyId, dutyDate: x.dutyDate, hours: Number(d.hours), reasonCode: d.reasonCode, note: d.note }), 'Final hours saved'),
  shift: (x) => act('Change shift tag · ' + x.name, '', field('shift', 'Shift', { type: 'select', options: ['Day', 'Night'], value: x.shift === 'Day' ? 'Night' : 'Day' }),
    'decide.shift', (d) => ({ dutyId: x.dutyId, dutyDate: x.dutyDate, shift: d.shift, reasonCode: d.reasonCode, note: d.note }), 'Shift changed'),
  grace: (x, choice) => act((choice === 'grace' ? 'Give grace · ' : 'Keep strict · ') + x.name, choice === 'grace' ? 'The duty is counted from the earlier full hour.' : 'The duty stays counted from the next full hour.', '',
    'decide.grace', (d) => ({ dutyId: x.dutyId, dutyDate: x.dutyDate, choice, reasonCode: d.reasonCode, note: d.note }), 'Decision saved'),
  approve: (staffId, name, date, all) => act((all ? 'Approve all hours · ' : 'Approve 12 h only · ') + name, all ? 'All hours on this date become billable.' : 'Hours beyond 12 on this date are not billed.', '',
    'decide.approve', (d) => ({ staffId, date, approve: all, reasonCode: d.reasonCode, note: d.note }), 'Approval saved'),
  reviewShort: (staffId, name, date) => act('Mark short duty reviewed · ' + name, 'The hours stay as calculated; the review is recorded.', '', 'decide.reviewShort', (d) => ({ staffId, date, reasonCode: d.reasonCode, note: d.note }), 'Marked reviewed')
};

// ---------- exceptions page ----------
let filter = 'ALL', view = 'Open';
const selected = new Set();
const IGNORE_NOTE = 'The item leaves the list without changing any hours. A missing IN/OUT then counts 0 hours for that duty, and hours over 12 are not billed. It stays in the records and can be restored from "Ignored".';
export async function exceptionsView(c) {
  setTitle('Exceptions');
  c.innerHTML = skeleton(8);
  const [exc, unrec] = await Promise.all([apiFast('exceptions.list', { status: view }), apiFast('unrecognised.list', { status: 'Open' })]);
  // duty details only for the dates that have items (not 45 days of duties)
  const oldest = exc.reduce((m, x) => (!m || x.dutyDate < m ? x.dutyDate : m), '') || today();
  const dutiesRes = exc.length ? await apiFast('duties.list', { from: oldest < OSC.addDays(today(), -60) ? OSC.addDays(today(), -60) : oldest, to: today() }) : { duties: [] };
  const dutyById = {}; dutiesRes.duties.forEach((d) => { dutyById[d.dutyId] = d; });
  const counts = {}; exc.forEach((x) => { counts[x.type] = (counts[x.type] || 0) + 1; });
  const ignoredView = view === 'Ignored';
  setTitle('Exceptions', ignoredView ? exc.length + ' ignored' : (exc.length + unrec.length) + ' to resolve');
  const list = exc.filter((x) => filter === 'ALL' || x.type === filter);
  [...selected].forEach((id) => { if (!list.some((x) => x.exceptionId === id)) selected.delete(id); });
  c.innerHTML = `<div class="chips"><button class="chip${filter === 'ALL' ? ' on' : ''}" data-f="ALL">All <span class="ct">${exc.length + (ignoredView ? 0 : unrec.length)}</span></button>
      ${Object.keys(TYPE).map((k) => `<button class="chip${filter === k ? ' on' : ''}" data-f="${k}">${esc(TYPE[k][0])} <span class="ct">${counts[k] || 0}</span></button>`).join('')}
      ${ignoredView ? '' : `<button class="chip${filter === 'UNREC' ? ' on' : ''}" data-f="UNREC">Unrecognised faces <span class="ct">${unrec.length}</span></button>`}<span class="sp"></span>
      <select class="chip" id="xView" aria-label="Show"><option value="Open"${ignoredView ? '' : ' selected'}>To resolve</option><option value="Ignored"${ignoredView ? ' selected' : ''}>Ignored</option></select>
      <a class="btn ghost" href="#/penalties">${icon('indian-rupee')}Penalties & deductions</a></div>
    ${list.length && filter !== 'UNREC' ? `<div class="row selbar" id="selBar"><label class="nw" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="selAll"> Select all shown</label>
      <span id="selN" style="color:var(--muted)">${selected.size} selected</span><span class="sp"></span>
      ${ignoredView ? `<button class="btn ghost sm" id="bulkRestore" disabled>${icon('history')}Restore selected</button>` : `<button class="btn ghost sm" id="bulkIgnore" disabled>${icon('ban')}Ignore selected</button>`}</div>` : ''}
    <div id="xl" style="display:grid;gap:12px"></div>`;
  const xl = $('#xl');
  if (!ignoredView && (filter === 'UNREC' || filter === 'ALL')) xl.insertAdjacentHTML('beforeend', unrec.map((u) => `<div class="card" style="border-left:4px solid var(--out)"><div class="row"><span class="pill out">${icon('scan-face')}Unrecognised face</span><b class="tnum">${esc(OSC.fmtDateTime(u.at))}</b><span class="sp"></span><span style="color:var(--muted)">closest match ${esc(u.bestStaffId || '—')}</span></div>
      <div class="row" style="margin-top:10px"><button class="btn primary sm" data-assign="${esc(u.unrecId)}">Assign to a person</button><button class="btn ghost sm" data-photo="${esc(u.unrecId)}">View photo</button><a class="btn link sm" href="#/unrecognised">Dismiss on the Unrecognised faces page</a></div></div>`).join(''));
  if (filter !== 'UNREC') xl.insertAdjacentHTML('beforeend', list.map((x) => {
    const d = dutyById[x.dutyId] || {}, sug = x.suggestion || {}, id = esc(x.exceptionId);
    let buttons = '';
    if (ignoredView) buttons = `<button class="btn ghost sm" data-restore="${id}">${icon('history')}Restore</button>`;
    else {
      if (x.type === 'MISSING_OUT') buttons = `<button class="btn primary sm" data-a="setOut" data-x="${id}">Set OUT ${esc(OSC.fmtDateTime(sug.outAt).slice(12))}</button><button class="btn ghost sm" data-a="setOut" data-x="${id}">Another time</button>`;
      if (x.type === 'MISSING_IN') buttons = `<button class="btn primary sm" data-a="addIn" data-x="${id}">Add IN ${esc(OSC.fmtDateTime(sug.inAt).slice(12))}</button><button class="btn ghost sm" data-a="addIn" data-x="${id}">Another time</button>`;
      if (x.type === 'LATE_GRACE') buttons = `<button class="btn ghost sm" data-a="strict" data-x="${id}">Keep strict · ${h2(sug.strict)} h</button><button class="btn primary sm" data-a="grace" data-x="${id}">Give grace · ${h2(sug.grace)} h</button><button class="btn ghost sm" data-a="override" data-x="${id}">Override…</button>`;
      if (x.type === 'LONG_DUTY') buttons = `<button class="btn primary sm" data-a="approveAll" data-x="${id}">Approve ${h2(sug.total)} h</button><button class="btn ghost sm" data-a="approve12" data-x="${id}">Approve 12 h only</button>${d.status === 'Closed' && d.systemHours > 24 ? `<button class="btn ghost sm" data-a="split" data-x="${id}">Split duty</button>` : ''}`;
      if (x.type === 'SHORT_DUTY') buttons = `<button class="btn primary sm" data-a="review" data-x="${id}">Mark reviewed</button><button class="btn ghost sm" data-a="override" data-x="${id}">Override hours…</button>`;
      buttons += `<span class="sp"></span><button class="btn link sm" data-ignore="${id}" title="Remove from the list without changing hours">${icon('ban')}Ignore</button>`;
    }
    const stripe = ignoredView ? 'var(--line-2)' : { bad: 'var(--bad)', warn: 'var(--warn-fill)', neu: 'var(--line-2)' }[TYPE[x.type][1]];
    return `<div class="card xc" style="border-left:4px solid ${stripe}"><div class="row"><input type="checkbox" class="xsel" data-sel="${id}"${selected.has(x.exceptionId) ? ' checked' : ''} aria-label="Select">
      <span class="pill ${ignoredView ? 'neu' : TYPE[x.type][1]}">${esc(TYPE[x.type][0])}</span><div class="who"><b>${esc(x.name)}</b><span>${esc(x.staffId)}</span></div><span class="sp"></span><span class="tnum" style="color:var(--muted)">Duty date ${esc(OSC.fmtDate(x.dutyDate))}</span></div>
      <div style="margin:10px 0">${esc(x.summary)}</div>${d.inAt || d.outAt ? `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">IN ${esc(OSC.fmtDateTime(d.inAt) || '—')} · OUT ${esc(OSC.fmtDateTime(d.outAt) || '—')} · ${esc(d.explain || '')}</div>` : ''}
      ${ignoredView ? `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">${esc(x.resolution || '')} · ${esc(x.resolvedBy || '')} · ${esc(OSC.fmtDateTime(x.resolvedAt) || '')}</div>` : ''}
      <div class="row">${buttons}</div></div>`;
  }).join(''));
  if (!xl.innerHTML.trim()) xl.innerHTML = `<div class="card">${emptyState('circle-check', ignoredView ? 'No ignored items.' : 'Nothing to resolve.')}</div>`;
  $$('[data-f]', c).forEach((b) => { b.onclick = () => { filter = b.dataset.f; exceptionsView(c); }; });
  $('#xView').onchange = (e) => { view = e.target.value; filter = 'ALL'; selected.clear(); exceptionsView(c); };
  const byId = {}; exc.forEach((x) => { byId[x.exceptionId] = x; });
  const after = (r) => { if (r) { selected.clear(); exceptionsView(c); } };
  // selection
  const syncSel = () => {
    const n = selected.size, el = $('#selN'); if (el) el.textContent = n + ' selected';
    ['#bulkIgnore', '#bulkRestore'].forEach((q) => { const b = $(q); if (b) { b.disabled = !n; b.lastChild.textContent = (q === '#bulkIgnore' ? 'Ignore' : 'Restore') + (n ? ' ' + n + ' selected' : ' selected'); } });
    const all = $('#selAll'); if (all) all.checked = !!list.length && list.every((x) => selected.has(x.exceptionId));
  };
  $$('.xsel', c).forEach((cb) => { cb.onchange = () => { if (cb.checked) selected.add(cb.dataset.sel); else selected.delete(cb.dataset.sel); syncSel(); }; });
  const allBox = $('#selAll');
  if (allBox) allBox.onchange = () => { list.forEach((x) => { if (allBox.checked) selected.add(x.exceptionId); else selected.delete(x.exceptionId); }); $$('.xsel', c).forEach((cb) => { cb.checked = allBox.checked; }); syncSel(); };
  syncSel();
  const items = (ids) => ids.map((id) => ({ id, dutyDate: byId[id].dutyDate }));
  const ignore = async (ids) => {
    const r = await act(ids.length === 1 ? 'Ignore · ' + byId[ids[0]].name : 'Ignore ' + ids.length + ' items', IGNORE_NOTE, '', 'exceptions.ignore', (d) => ({ items: items(ids), reasonCode: d.reasonCode, note: d.note }), 'Ignored');
    if (r && r.skipped && r.skipped.length) toast(r.skipped.length + ' not changed: ' + r.skipped[0], 'bad');
    after(r);
  };
  const restore = async (ids) => {
    try { const r = await api('exceptions.restore', { items: items(ids), note: 'Restored to the list' }); toast(r.changed + ' restored' + (r.skipped.length ? ' · ' + r.skipped[0] : '')); after(true); }
    catch (e) { toast(e.message, 'bad'); }
  };
  $$('[data-ignore]', c).forEach((b) => { b.onclick = () => ignore([b.dataset.ignore]); });
  $$('[data-restore]', c).forEach((b) => { b.onclick = () => restore([b.dataset.restore]); });
  const bi = $('#bulkIgnore'); if (bi) bi.onclick = () => selected.size && ignore([...selected]);
  const br = $('#bulkRestore'); if (br) br.onclick = () => selected.size && restore([...selected]);
  $$('[data-a]', c).forEach((b) => {
    b.onclick = async () => {
      const x = byId[b.dataset.x], d = Object.assign({ name: x.name }, dutyById[x.dutyId] || {}), sug = x.suggestion || {}, a = b.dataset.a;
      if (!d.dutyId) d.dutyId = x.dutyId, d.dutyDate = x.dutyDate;
      if (a === 'setOut') after(await dutyActions.setOut(d, sug.outAt));
      if (a === 'addIn') after(await dutyActions.addIn(d, sug.inAt));
      if (a === 'grace' || a === 'strict') after(await dutyActions.grace(d, a === 'grace' ? 'grace' : 'strict'));
      if (a === 'override') after(await dutyActions.override(d));
      if (a === 'split') after(await dutyActions.split(d));
      if (a === 'approveAll' || a === 'approve12') after(await dutyActions.approve(x.staffId, x.name, x.dutyDate, a === 'approveAll'));
      if (a === 'review') after(await dutyActions.reviewShort(x.staffId, x.name, x.dutyDate));
    };
  });
  $$('[data-photo]', c).forEach((b) => {
    b.onclick = () => dialog({ title: 'Unrecognised face', submitLabel: 'Close', noCancel: true, body: '<div id="ph" style="min-height:200px;display:grid;place-items:center">Loading…</div>',
      onOpen: async (f) => { try { const r = await api('punches.photo', { unrecId: b.dataset.photo }); $('#ph', f).innerHTML = `<img src="${esc(r.dataUrl)}" alt="" style="max-width:100%;border-radius:10px">`; } catch (e) { $('#ph', f).textContent = e.message; } } });
  });
  $$('[data-assign]', c).forEach((b) => {
    b.onclick = async () => {
      const u = unrec.find((x) => x.unrecId === b.dataset.assign);
      const staff = (await apiFast('staff.list', { status: 'All' })).filter((s) => s.status === 'Active');
      after(await act('Assign photo of ' + OSC.fmtDateTime(u.at), 'Check the photo first. The punch is added at the photo time.',
        field('staffId', 'Employee', { type: 'select', options: staff.map((s) => ({ value: s.staffId, label: s.staffId + ' · ' + s.displayName })), value: u.bestStaffId, required: true }) +
        field('type', 'Punch type', { type: 'select', options: ['IN', 'OUT'], required: true }),
        'fix.assignUnrecognised', (d) => ({ unrecId: u.unrecId, staffId: d.staffId, type: d.type, reasonCode: d.reasonCode, note: d.note }), 'Punch added'));
    };
  });
}

// ---------- penalties & deductions ----------
let month = null;
export async function penaltiesView(c) {
  setTitle('Penalties & deductions');
  month = month || today().slice(0, 7);
  c.innerHTML = skeleton(6);
  const [pens, deds, staffAll] = await Promise.all([apiFast('penalties.list', { month }), apiFast('deductions.list', { month }), apiFast('staff.list', { status: 'All' })]);
  const active = (l) => l.filter((x) => x.status === 'Active');
  const staff = staffAll.filter((s) => s.status === 'Active');
  const totalP = active(pens).reduce((a, x) => a + x.amount, 0), totalD = active(deds).reduce((a, x) => a + x.hours, 0);
  const tbl = (rows, cols) => rows.length ? `<div class="tablebox"><table class="t"><thead><tr>${cols.map((c2) => `<th${c2.n ? ' class="n"' : ''}>${c2.h}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((r) => `<tr${r.status !== 'Active' ? ' style="opacity:.5"' : ''}>${cols.map((c2) => `<td${c2.n ? ' class="n"' : ''}>${c2.f(r)}</td>`).join('')}<td>${r.status === 'Active' ? `<button class="btn link sm" data-void="${esc(r.penaltyId || r.deductionId)}" data-kind="${r.penaltyId ? 'penalties' : 'deductions'}">Cancel</button>` : `<span class="pill neu" title="${esc(r.voidReason)}">Cancelled</span>`}</td></tr>`).join('')}</tbody></table></div>` : emptyState('file-text', 'None this month');
  c.innerHTML = `<div class="row" style="align-items:flex-end"><div class="field" style="max-width:200px"><label for="pm">Month</label><input type="month" id="pm" value="${esc(month)}" max="${esc(today().slice(0, 7))}"></div><span class="sp"></span>
      <button class="btn ghost" id="addD">${icon('clock')}Add deduction</button><button class="btn primary" id="addP">${icon('indian-rupee')}Add penalty</button></div>
    <div class="card"><h3>${icon('indian-rupee')}Penalties · ${esc(OSC.fmtINR(totalP))}</h3><p style="margin:0 0 10px;color:var(--muted);font-size:12px">Printed as a numbered list on the bill and taken off before GST.</p>
      ${tbl(pens, [{ h: 'Date', f: (r) => esc(OSC.fmtDate(r.date)) }, { h: 'Department', f: (r) => esc(r.deptCode) }, { h: 'Employee', f: (r) => esc(r.staffId ? r.staffId + ' · ' + r.name : 'Whole department') }, { h: 'Reason', f: (r) => esc(r.reason) }, { h: 'Amount', n: 1, f: (r) => esc(OSC.fmtINR(r.amount)) }, { h: 'By', f: (r) => esc(r.createdBy) }])}</div>
    <div class="card"><h3>${icon('clock')}Deductions · ${esc(totalD.toFixed(2))} h</h3><p style="margin:0 0 10px;color:var(--muted);font-size:12px">Hours taken off the person's billable hours (shown in the bill's deduction block).</p>
      ${tbl(deds, [{ h: 'Date', f: (r) => esc(OSC.fmtDate(r.date)) }, { h: 'Employee', f: (r) => esc(r.staffId + ' · ' + r.name) }, { h: 'Hours', n: 1, f: (r) => esc(r.hours.toFixed(2)) }, { h: 'Reason', f: (r) => esc(r.reason) }, { h: 'By', f: (r) => esc(r.createdBy) }])}</div>`;
  $('#pm').onchange = (e) => { month = e.target.value || today().slice(0, 7); penaltiesView(c); };
  const staffOpts = staff.map((s) => ({ value: s.staffId, label: s.staffId + ' · ' + s.displayName }));
  $('#addP').onclick = async () => {
    const r = await dialog({ title: 'Add penalty', submitLabel: 'Add penalty', body: `<div class="form">
      ${field('date', 'Date', { type: 'date', value: today(), required: true })}${field('amount', 'Amount (₹)', { type: 'number', required: true, attrs: 'step="0.01" min="1"' })}
      ${field('deptCode', 'Department', { type: 'select', options: state.boot.departments.map((d) => ({ value: d.code, label: d.name })), required: true })}
      ${field('staffId', 'Employee (leave empty for the whole department)', { type: 'select', options: staffOpts, placeholder: 'Whole department' })}
      ${field('companyId', 'Company to charge (only if the department has more than one)', { type: 'select', options: state.boot.companies.map((x) => ({ value: x.companyId, label: x.name })), placeholder: 'Automatic' })}
      ${field('reason', 'Reason (printed on the bill)', { type: 'textarea', required: true, wide: true })}</div>`,
      onSubmit: (f) => api('penalties.add', formData(f)) });
    if (r) { toast('Penalty added'); penaltiesView(c); }
  };
  $('#addD').onclick = async () => {
    const r = await dialog({ title: 'Add deduction', submitLabel: 'Add deduction', body: `<div class="form">
      ${field('date', 'Date', { type: 'date', value: today(), required: true })}${field('hours', 'Hours to deduct', { type: 'number', required: true, attrs: 'step="0.25" min="0.25" max="72"' })}
      ${field('staffId', 'Employee', { type: 'select', options: staffOpts, placeholder: 'Choose', required: true, wide: true })}
      ${field('reason', 'Reason', { type: 'textarea', required: true, wide: true })}</div>`,
      onSubmit: (f) => api('deductions.add', formData(f)) });
    if (r) { toast('Deduction added'); penaltiesView(c); }
  };
  $$('[data-void]', c).forEach((b) => {
    b.onclick = async () => {
      const r = await dialog({ title: 'Cancel this entry?', submitLabel: 'Cancel entry', danger: true, cancelLabel: 'Keep it', body: `<div class="form">${field('reason', 'Reason', { type: 'textarea', required: true, wide: true })}</div>`,
        onSubmit: (f) => api(b.dataset.kind + '.void', Object.assign({ reason: formData(f).reason }, b.dataset.kind === 'penalties' ? { penaltyId: b.dataset.void } : { deductionId: b.dataset.void })) });
      if (r) { toast('Cancelled'); penaltiesView(c); }
    };
  });
}
