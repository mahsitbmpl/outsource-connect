/* Phase 2 console pages: face enrollment, tablets, punches, unrecognised faces. */
import { api } from './api.js';
import { esc, icon, toast, dialog, field, formData, skeleton, emptyState, setTitle, $, $$ } from './ui.js';
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
  const list = await api('devices.list');
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

// ---------- punches ----------
let punchDate = null;
export async function punchesView(c) {
  setTitle('Punches');
  punchDate = punchDate || today();
  c.innerHTML = `<div class="row"><div class="field" style="max-width:220px"><label for="pd">Date</label><input type="date" id="pd" value="${esc(punchDate)}" max="${esc(today())}"></div><span class="sp"></span>
    <span style="color:var(--muted);max-width:520px">Raw punches from the tablet, exactly as received. Duty hours are calculated from these in Phase 3. Punches are never edited or deleted.</span></div><div id="pl">${skeleton(6)}</div>`;
  const load = async () => {
    const list = (await api('punches.byDate', { date: punchDate })).sort((a, b) => (a.at < b.at ? 1 : -1));
    const ins = list.filter((p) => p.type === 'IN' && p.status === 'Accepted').length, outs = list.filter((p) => p.type === 'OUT' && p.status === 'Accepted').length;
    $('#pl').innerHTML = list.length ? `<div class="chips" style="margin-bottom:12px"><span class="chip">IN <span class="ct">${ins}</span></span><span class="chip">OUT <span class="ct">${outs}</span></span><span class="chip">Total <span class="ct">${list.length}</span></span></div>
      <div class="tablebox"><table class="t"><thead><tr><th>Time</th><th>Employee</th><th>Type</th><th>Status</th><th class="n">Match</th><th>Liveness</th><th>Received</th><th>Note</th><th></th></tr></thead><tbody>
      ${list.map((p) => `<tr><td class="tnum nw"><b>${esc(timeOf(p.at))}</b></td><td><div class="who"><b>${esc(p.name)}</b><span>${esc(p.staffId)} · ${esc(p.deptCode || '')}</span></div></td>
        <td>${p.type === 'IN' ? `<span class="pill ok">${icon('circle-check')}IN</span>` : `<span class="pill out">${icon('log-out')}OUT</span>`}</td>
        <td>${p.status === 'Accepted' ? 'Accepted' : `<span class="pill warn">${esc(p.status)}</span>`}</td><td class="n">${p.distance === '' || p.distance == null ? '—' : esc(Number(p.distance).toFixed(2))}</td>
        <td>${esc(p.liveness || '—')}</td><td class="tnum nw">${esc(timeOf(p.receivedAt))}${p.offline ? ' <span class="pill neu">offline</span>' : ''}</td><td>${esc(p.note || '')}</td>
        <td>${p.hasPhoto ? `<button class="btn link sm" data-ph="${esc(p.punchId)}">Photo</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card">${emptyState('clock', 'No punches on ' + OSC.fmtDate(punchDate) + '.')}</div>`;
    $$('[data-ph]', c).forEach((b) => { b.onclick = () => showPhoto('Punch photo', { punchId: b.dataset.ph, date: punchDate }); });
  };
  $('#pd').onchange = (e) => { punchDate = e.target.value || today(); $('#pl').innerHTML = skeleton(6); load().catch((er) => { $('#pl').innerHTML = `<div class="note bad">${esc(er.message)}</div>`; }); };
  await load();
}

// ---------- unrecognised ----------
export async function unrecognisedView(c) {
  setTitle('Unrecognised faces');
  c.innerHTML = skeleton(5);
  const list = await api('unrecognised.list', { status: 'All' });
  const open = list.filter((u) => u.status === 'Open');
  c.innerHTML = `<div class="note">${icon('scan-face')}<span>When the tablet cannot recognise a face it saves a photo here (at most one a minute). Assigning a photo to a person as a punch comes with the exceptions list in Phase 4. If the same person appears often, use "Add another sample" on their staff page.</span></div>
    ${list.length ? `<div class="tablebox"><table class="t"><thead><tr><th>When</th><th>Closest match</th><th class="n">Distance</th><th>Status</th><th>Note</th><th></th></tr></thead><tbody>
    ${list.map((u) => `<tr><td class="tnum nw">${esc(OSC.fmtDateTime(u.at))}</td><td>${esc(u.bestStaffId || '—')}</td><td class="n">${u.bestDistance === '' || u.bestDistance == null ? '—' : esc(Number(u.bestDistance).toFixed(2))}</td>
      <td>${u.status === 'Open' ? '<span class="pill warn">Open</span>' : `<span class="pill neu">${esc(u.status)}</span>`}</td><td>${esc(u.note || '')}</td>
      <td class="nw">${u.photoFileId ? `<button class="btn link sm" data-ph="${esc(u.unrecId)}">Photo</button>` : ''}${u.status === 'Open' ? `<button class="btn link sm" data-dis="${esc(u.unrecId)}">Dismiss</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card">${emptyState('scan-face', 'No unrecognised faces.')}</div>`}`;
  setTitle('Unrecognised faces', open.length + ' open');
  $$('[data-ph]', c).forEach((b) => { b.onclick = () => showPhoto('Unrecognised face', { unrecId: b.dataset.ph }); });
  $$('[data-dis]', c).forEach((b) => {
    b.onclick = async () => {
      const r = await dialog({ title: 'Dismiss this photo?', submitLabel: 'Dismiss', body: `<div class="form">${field('reason', 'Reason', { type: 'select', options: ['Visitor, not staff', 'Staff punched again successfully', 'Photo unclear', 'Other'], required: true })}</div>`,
        onSubmit: (form) => api('unrecognised.dismiss', { unrecId: b.dataset.dis, reason: formData(form).reason }) });
      if (r) { toast('Dismissed'); unrecognisedView(c); }
    };
  });
}
