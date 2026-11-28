/* Phase 2 console pages: face enrollment, tablets, punches, unrecognised faces. */
import { api, apiFast } from './api.js';
import { esc, icon, toast, dialog, field, formData, skeleton, emptyState, setTitle, toCSV, download, $, $$ } from './ui.js';
import { state, isAdmin, today } from './state.js';

const OSC = window.OSC;
const timeOf = (iso) => OSC.fmtDateTime(iso).slice(12);

// ---------- enrollment (opened from the staff page) ----------
const STEP_TEXT = {
  Requested: 'Waiting for the tablet to pick it up (up to 15 seconds)…',
  InProgress: 'The tablet is taking 5 photos. Ask the person to look straight at the camera.',
  Captured: 'Photos taken. Test punch: the person looks at the camera once more.',
  Done: 'Face enrolled. The test punch was not counted as attendance.',
  Failed: 'Enrollment stopped.', Cancelled: 'Cancelled.'
};
export async function startEnroll(staff, mode, onDone) {
  let req;
  try { req = await api('face.requestEnroll', { staffId: staff.staffId, mode }); }
  catch (e) { toast(e.message, 'bad'); return; }
  let timer = null, finished = false;
  const render = (r) => {
    const box = document.getElementById('enrSt'); if (!box) return;
    const end = ['Done', 'Failed', 'Cancelled'].includes(r.status);
    box.innerHTML = `<div class="note ${r.status === 'Done' ? '' : r.status === 'Failed' || r.status === 'Cancelled' ? 'bad' : 'warn'}">${icon(r.status === 'Done' ? 'circle-check' : r.status === 'Failed' ? 'circle-x' : 'scan-face')}
      <span><b>${esc(r.status)}</b> · ${esc(STEP_TEXT[r.status] || '')}${r.message && r.status !== 'InProgress' ? '<br>' + esc(r.message) : ''}</span></div>`;
    const cancel = document.getElementById('enrCancel'); if (cancel) cancel.hidden = end;
    if (end) { finished = true; clearInterval(timer); }
  };
  dialog({
    title: (mode === 'sample' ? 'Add another sample · ' : 'Enroll face · ') + staff.displayName, submitLabel: 'Close', noCancel: true,
    body: `<p>The tablet now shows <b>"Enrolling: ${esc(staff.displayName)}, ${esc(staff.staffId)}"</b>. The person stands in front of it, without cap or mask, and looks straight at the camera.</p>
      <div id="enrSt" style="margin-top:12px"></div><button type="button" class="btn ghost" id="enrCancel" style="margin-top:10px">${icon('circle-x')}Cancel enrollment</button>`,
    onOpen: (form) => {
      render(req);
      $('#enrCancel', form).onclick = async () => { try { await api('face.cancelEnroll', { reqId: req.reqId }); } catch (e) { toast(e.message, 'bad'); } };
      timer = setInterval(async () => { try { render(await api('face.enrollStatus', { reqId: req.reqId })); } catch (e) { /* keep trying */ } }, 3000);
    }
  }).then(() => { clearInterval(timer); if (onDone) onDone(finished); });
}

// ---------- tablets ----------
const ago = (m) => m == null ? 'never' : m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago';
export async function tabletView(c) {
  setTitle('Tablet');
  c.innerHTML = skeleton(4);
  const list = await apiFast('devices.list');
  const active = list.filter((d) => d.active);
  c.innerHTML = `<div class="row"><span style="color:var(--muted)">Status is sent by the tablet every 3 minutes.</span><span class="sp"></span>
      <button class="btn ghost" id="rf">${icon('history')}Refresh</button>${isAdmin() ? `<button class="btn primary" id="add">${icon('plus')}Add tablet</button>` : ''}</div>
    ${active.length ? `<div class="grid g2">${active.map((d) => `<div class="card"><div class="row"><b style="font-size:16px">${esc(d.name)}</b><span class="pill neu">${esc(d.deviceId)}</span><span class="sp"></span>
        ${d.online ? '<span class="pill ok">Online</span>' : `<span class="pill bad">${icon('triangle-alert')}Silent</span>`}</div>
        <dl class="kv" style="margin-top:12px"><dt>Last seen</dt><dd>${esc(ago(d.minutesSinceSeen))}</dd>
        <dt>Battery</dt><dd>${d.battery == null || d.battery === '' ? '—' : esc(d.battery) + '%'} ${d.charging ? '<span class="pill ok">Charging</span>' : d.battery !== '' && d.battery < 20 ? '<span class="pill bad">Low, not charging</span>' : ''}</dd>
        <dt>Waiting to sync</dt><dd>${esc(d.queueSize === '' || d.queueSize == null ? '—' : d.queueSize)}</dd>
        <dt>Camera</dt><dd>${d.cameraOk ? 'Working' : '<span class="pill bad">Problem</span>'}</dd>
        <dt>Last punch</dt><dd class="tnum">${esc(d.lastPunchAt ? OSC.fmtDateTime(d.lastPunchAt) : '—')}</dd>
        <dt>App version</dt><dd>${esc(d.appVersion || '—')} ${d.backend ? '· ' + esc(d.backend) : ''}</dd></dl>
        ${d.diag ? `<div class="diag"><b>Health of the face app</b> (since it last started)<br>Running ${esc(d.diag.uptimeMin != null ? Math.round(d.diag.uptimeMin) + ' min' : '—')} · recognition ${esc(d.diag.recogMs != null ? Math.round(d.diag.recogMs) + ' ms' : '—')} · detection ${esc(d.diag.detectMs != null ? Math.round(d.diag.detectMs) + ' ms' : '—')} · camera ${esc(d.diag.camRes || '—')}<br>
          Self-repairs: ${esc(d.diag.loopStalls || 0)} stuck loop, ${esc(d.diag.camRestarts || 0)} camera restart${d.diag.reloadReason ? ' · last restart: ' + esc(d.diag.reloadReason) : ''}</div>` : ''}
        ${isAdmin() ? `<div class="formbar"><button class="btn ghost sm" data-revoke="${esc(d.deviceId)}">${icon('ban')}Remove tablet</button></div>` : ''}</div>`).join('')}</div>`
      : `<div class="card">${emptyState('tablet-smartphone', 'No tablet is set up yet.' + (isAdmin() ? ' Click "Add tablet" to get a setup code.' : ' Ask the Admin to add one.'))}</div>`}
    ${list.some((d) => !d.active) ? `<div class="card"><h3>Removed tablets</h3>${list.filter((d) => !d.active).map((d) => `<div>${esc(d.deviceId)} · ${esc(d.name)}</div>`).join('')}</div>` : ''}`;
  $('#rf').onclick = () => tabletView(c);
  const add = $('#add');
  if (add) add.onclick = async () => {
    const r = await dialog({ title: 'Add tablet', submitLabel: 'Create setup code', body: `<div class="form">${field('name', 'Tablet name', { value: 'Lobby tablet', required: true })}</div>`,
      onSubmit: (form) => api('devices.create', formData(form)) });
    if (!r) return;
    await dialog({ title: 'Setup code for ' + r.name, submitLabel: 'I have entered it', noCancel: true,
      body: `<p>On the tablet, open the kiosk address. Type this code on the setup screen. It is shown <b>only once</b>. If it is lost, remove this tablet and add it again.</p>
        <div class="secret" style="margin-top:12px;font-size:18px;word-break:break-all">${esc(r.setupCode)}</div>` });
    tabletView(c);
  };
  $$('[data-revoke]', c).forEach((b) => {
    b.onclick = async () => {
      const ok = await dialog({ title: 'Remove tablet ' + b.dataset.revoke + '?', submitLabel: 'Remove', danger: true,
        body: `<p>The tablet stops working at once. Punches already saved on it but not yet sent will be lost. Check "Waiting to sync" is 0 first.</p><div class="form" style="margin-top:12px">${field('reason', 'Reason', { type: 'textarea', required: true, wide: true })}</div>`,
        onSubmit: (form) => api('devices.revoke', { deviceId: b.dataset.revoke, reason: formData(form).reason }) });
      if (ok) { toast('Tablet removed'); tabletView(c); }
    };
  });
}

// ---------- photos ----------
async function showPhoto(title, args) {
  dialog({ title, submitLabel: 'Close', noCancel: true, body: '<div id="ph" style="min-height:200px;display:grid;place-items:center">Loading photo…</div>',
    onOpen: async (form) => {
      try { const r = await api('punches.photo', args); $('#ph', form).innerHTML = `<img src="${esc(r.dataUrl)}" alt="Photo" style="max-width:100%;border-radius:10px">`; }
      catch (e) { $('#ph', form).textContent = e.message; }
    } });
}

// ---------- date presets (Punches, Unrecognised faces) ----------
function presetRange(k) {
  const t = today(), first = t.slice(0, 8) + '01';
  const lastMonthEnd = OSC.addDays(first, -1);
  return { today: [t, t], yesterday: [OSC.addDays(t, -1), OSC.addDays(t, -1)], last7: [OSC.addDays(t, -6), t], thisMonth: [first, t],
    lastMonth: [lastMonthEnd.slice(0, 8) + '01', lastMonthEnd] }[k] || null;
}
const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['thisMonth', 'This month'], ['lastMonth', 'Last month']];
function presetBar(cur, from, to, extra) {
  return `<div class="card" style="padding:12px 16px"><div class="row" style="align-items:flex-end;gap:12px">
    <div class="presets">${PRESETS.map(([k, l]) => `<button class="chip${cur === k ? ' on' : ''}" data-pre="${k}">${l}</button>`).join('')}</div>
    <div class="field" style="max-width:160px"><label for="rf1">From</label><input type="date" id="rf1" value="${esc(from)}" max="${esc(today())}"></div>
    <div class="field" style="max-width:160px"><label for="rf2">To</label><input type="date" id="rf2" value="${esc(to)}" max="${esc(today())}"></div>
    ${extra || ''}</div></div>`;
}

// ---------- punches ----------
const P = { pre: 'today', from: null, to: null, type: '', dept: '', q: '' };
export async function punchesView(c) {
  setTitle('Punches');
  if (!P.from) { [P.from, P.to] = presetRange('today'); }
  const depts = (state.boot.departments || []).filter((d) => d.active);
  c.innerHTML = presetBar(P.pre, P.from, P.to, `
      <div class="field" style="max-width:120px"><label for="pt">Type</label><select id="pt"><option value="">All</option><option${P.type === 'IN' ? ' selected' : ''}>IN</option><option${P.type === 'OUT' ? ' selected' : ''}>OUT</option></select></div>
      <div class="field" style="max-width:170px"><label for="pdp">Department</label><select id="pdp"><option value="">All</option>${depts.map((d) => `<option value="${esc(d.code)}"${P.dept === d.code ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field" style="max-width:220px"><label for="pq">Name or ID</label><input id="pq" value="${esc(P.q)}" placeholder="Search" autocomplete="off"></div>`) +
    `<p style="color:var(--muted);font-size:12px;margin:0 0 10px">Punches exactly as received from the tablet (manual corrections show device MANUAL). They are never edited or deleted. Up to 62 days at a time.</p><div id="pl">${skeleton(6)}</div>`;
  let data = null;
  const draw = () => {
    const q = P.q.trim().toLowerCase();
    const list = data.rows.filter((p) => !q || (p.name || '').toLowerCase().includes(q) || p.staffId.toLowerCase().includes(q));
    const acc = list.filter((p) => p.status === 'Accepted'), ins = acc.filter((p) => p.type === 'IN').length, outs = acc.filter((p) => p.type === 'OUT').length;
    const multiDay = P.from !== P.to;
    $('#pl').innerHTML = list.length ? `<div class="chips" style="margin-bottom:12px"><span class="chip">IN <span class="ct">${ins}</span></span><span class="chip">OUT <span class="ct">${outs}</span></span><span class="chip">Shown <span class="ct">${list.length}</span></span>
        ${data.truncated ? `<span class="pill warn">Showing the newest 5,000 of ${data.total}. Choose fewer days.</span>` : ''}<span class="sp"></span><button class="btn ghost sm" id="pcsv">${icon('download')}CSV</button></div>
      <div class="tablebox"><table class="t"><thead><tr><th>${multiDay ? 'Date and time' : 'Time'}</th><th>Employee</th><th>Type</th><th>Status</th><th class="n">Match</th><th>Liveness</th><th>Received</th><th>Note</th><th></th></tr></thead><tbody>
      ${list.slice(0, 1500).map((p) => `<tr><td class="tnum nw"><b>${esc(multiDay ? OSC.fmtDateTime(p.at) : timeOf(p.at))}</b></td><td><div class="who"><b>${esc(p.name)}</b><span>${esc(p.staffId)} · ${esc(p.deptCode || '')}</span></div></td>
        <td>${p.type === 'IN' ? `<span class="pill ok">${icon('circle-check')}IN</span>` : `<span class="pill out">${icon('log-out')}OUT</span>`}</td>
        <td>${p.status === 'Accepted' ? (p.deviceId === 'MANUAL' ? '<span class="pill neu">Manual</span>' : 'Accepted') : `<span class="pill warn">${esc(p.status)}</span>`}</td><td class="n">${p.distance === '' || p.distance == null ? '—' : esc(Number(p.distance).toFixed(2))}</td>
        <td>${esc(p.liveness || '—')}</td><td class="tnum nw">${esc(timeOf(p.receivedAt))}${p.offline ? ' <span class="pill neu">offline</span>' : ''}</td><td>${esc(p.note || '')}</td>
        <td>${p.hasPhoto ? `<button class="btn link sm" data-ph="${esc(p.punchId)}" data-d="${esc(String(p.at).slice(0, 10))}">Photo</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${list.length > 1500 ? '<p style="color:var(--muted);font-size:12px">The table shows 1,500 rows; the CSV has all of them.</p>' : ''}`
      : `<div class="card">${emptyState('clock', 'No punches for this choice.')}</div>`;
    $$('[data-ph]', c).forEach((b) => { b.onclick = () => showPhoto('Punch photo', { punchId: b.dataset.ph, date: b.dataset.d }); });
    const csv = $('#pcsv');
    if (csv) csv.onclick = () => download('punches_' + P.from + '_' + P.to + '.csv', toCSV(list, [{ label: 'Date time', key: 'at' }, { label: 'Employee ID', key: 'staffId' }, { label: 'Name', key: 'name' },
      { label: 'Department', key: 'deptCode' }, { label: 'Type', key: 'type' }, { label: 'Status', key: 'status' }, { label: 'Device', key: 'deviceId' }, { label: 'Match distance', key: 'distance' }, { label: 'Received', key: 'receivedAt' }, { label: 'Note', key: 'note' }]));
  };
  const load = async () => {
    $('#pl').innerHTML = skeleton(6);
    try { data = await apiFast('punches.range', { from: P.from, to: P.to, type: P.type, deptCode: P.dept }); draw(); }
    catch (er) { $('#pl').innerHTML = `<div class="note bad">${esc(er.message)}</div>`; }
  };
  $$('[data-pre]', c).forEach((b) => { b.onclick = () => { P.pre = b.dataset.pre; [P.from, P.to] = presetRange(P.pre); punchesView(c); }; });
  const range = () => { P.pre = ''; P.from = $('#rf1').value || today(); P.to = $('#rf2').value || P.from; if (P.to < P.from) P.to = P.from; $$('[data-pre]', c).forEach((x) => x.classList.remove('on')); load(); };
  $('#rf1').onchange = range; $('#rf2').onchange = range;
  $('#pt').onchange = (e) => { P.type = e.target.value; load(); };
  $('#pdp').onchange = (e) => { P.dept = e.target.value; load(); };
  $('#pq').oninput = (e) => { P.q = e.target.value; if (data) draw(); };
  await load();
}

// ---------- unrecognised ----------
const U = { status: 'Open', pre: '', from: '', to: '' };
const DISMISS_REASONS = ['Visitor, not staff', 'Staff punched again successfully', 'Photo unclear', 'Test or practice', 'Other'];
export async function unrecognisedView(c) {
  setTitle('Unrecognised faces');
  c.innerHTML = skeleton(5);
  const list = await apiFast('unrecognised.list', { status: U.status, from: U.from, to: U.to });
  const sel = new Set();
  c.innerHTML = presetBar(U.pre, U.from, U.to, `<div class="field" style="max-width:150px"><label for="us">Status</label><select id="us">${['Open', 'Dismissed', 'Assigned', 'All'].map((x) => `<option${U.status === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
      <button class="btn link sm" id="uclr">All dates</button>`) +
    `<div class="note">${icon('scan-face')}<span>When the tablet cannot recognise a face it saves a photo here (at most one a minute). Assign a photo to a person on the Exceptions page. If the same person appears often, use "Add another sample" on their staff page.</span></div>
    ${list.length ? `${U.status === 'Open' || U.status === 'All' ? `<div class="row selbar"><label class="nw" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="uAll"> Select all shown</label><span id="uN" style="color:var(--muted)">0 selected</span><span class="sp"></span>
        <button class="btn ghost sm" id="uDisSel" disabled>${icon('ban')}Dismiss selected</button><button class="btn ghost sm" id="uDisAll">${icon('ban')}Dismiss all ${list.filter((u) => u.status === 'Open').length} shown</button></div>` : ''}
      <div class="tablebox"><table class="t"><thead><tr><th></th><th>When</th><th>Closest match</th><th class="n">Distance</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>
    ${list.map((u) => `<tr><td>${u.status === 'Open' ? `<input type="checkbox" class="usel" data-u="${esc(u.unrecId)}" aria-label="Select">` : ''}</td><td class="tnum nw">${esc(OSC.fmtDateTime(u.at))}</td><td>${esc(u.bestStaffId || '—')}</td><td class="n">${u.bestDistance === '' || u.bestDistance == null ? '—' : esc(Number(u.bestDistance).toFixed(2))}</td>
      <td>${u.status === 'Open' ? '<span class="pill warn">Open</span>' : `<span class="pill neu">${esc(u.status)}</span>`}</td><td>${esc(u.note || '')}</td>
      <td class="nw">${u.photoFileId ? `<button class="btn link sm" data-ph="${esc(u.unrecId)}">Photo</button>` : ''}${u.status === 'Open' ? `<button class="btn link sm" data-dis="${esc(u.unrecId)}">Dismiss</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card">${emptyState('scan-face', 'No photos for this choice.')}</div>`}`;
  setTitle('Unrecognised faces', list.filter((u) => u.status === 'Open').length + ' open');
  $$('[data-pre]', c).forEach((b) => { b.onclick = () => { U.pre = b.dataset.pre; [U.from, U.to] = presetRange(U.pre); unrecognisedView(c); }; });
  const range = () => { U.pre = ''; U.from = $('#rf1').value; U.to = $('#rf2').value || U.from; unrecognisedView(c); };
  $('#rf1').onchange = range; $('#rf2').onchange = range;
  $('#uclr').onclick = () => { U.pre = ''; U.from = ''; U.to = ''; unrecognisedView(c); };
  $('#us').onchange = (e) => { U.status = e.target.value; unrecognisedView(c); };
  $$('[data-ph]', c).forEach((b) => { b.onclick = () => showPhoto('Unrecognised face', { unrecId: b.dataset.ph }); });
  const syncU = () => { const n = sel.size; $('#uN') && ($('#uN').textContent = n + ' selected'); const b = $('#uDisSel'); if (b) { b.disabled = !n; b.lastChild.textContent = n ? 'Dismiss ' + n + ' selected' : 'Dismiss selected'; } };
  $$('.usel', c).forEach((cb) => { cb.onchange = () => { if (cb.checked) sel.add(cb.dataset.u); else sel.delete(cb.dataset.u); syncU(); }; });
  const all = $('#uAll');
  if (all) all.onchange = () => { $$('.usel', c).forEach((cb) => { cb.checked = all.checked; if (all.checked) sel.add(cb.dataset.u); else sel.delete(cb.dataset.u); }); syncU(); };
  const dismiss = async (ids, label) => {
    const r = await dialog({ title: label, submitLabel: 'Dismiss', body: `<div class="form">${field('reason', 'Reason', { type: 'select', options: DISMISS_REASONS, required: true })}</div>
        <p style="font-size:12px;color:var(--muted);margin-top:8px">The photos stay in the records (marked Dismissed) until the photo retention period ends.</p>`,
      onSubmit: (form) => api('unrecognised.dismissMany', { ids, reason: formData(form).reason }) });
    if (r) { toast(r.dismissed + ' dismissed'); unrecognisedView(c); }
  };
  $$('[data-dis]', c).forEach((b) => { b.onclick = () => dismiss([b.dataset.dis], 'Dismiss this photo?'); });
  const ds = $('#uDisSel'); if (ds) ds.onclick = () => sel.size && dismiss([...sel], 'Dismiss ' + sel.size + ' photos?');
  const da = $('#uDisAll'); if (da) da.onclick = () => { const ids = list.filter((u) => u.status === 'Open').map((u) => u.unrecId); if (ids.length) dismiss(ids, 'Dismiss all ' + ids.length + ' open photos shown?'); };
}
