/* Staff master: list, add, detail (edit, transfer, exit, re-join), bulk import. */
import { api } from './api.js';
import { esc, icon, toast, dialog, field, formData, showErrors, clearErrors, setBusy, skeleton, emptyState, initials, toCSV, download, parseCSV, setTitle, debounce, $, $$ } from './ui.js';
import { state, go, deptName, today } from './state.js';

const OSC = window.OSC;
const filt = { q: '', dept: '', status: 'Active', face: '' };

const facePill = (f) => ({
  'Active': `<span class="pill pri">${icon('scan-face')}Active</span>`,
  'Pending': `<span class="pill warn">Pending test</span>`,
  'Disabled': `<span class="pill neu">Disabled</span>`
}[f] || `<span class="pill neu">Not enrolled</span>`);
const statusPill = (s) => s === 'Active' ? '<span class="pill ok">Active</span>' : `<span class="pill neu">${esc(s)}</span>`;
const activeDepts = () => state.boot.departments.filter((d) => d.active);
const companiesFor = (dept) => state.boot.companies.filter((c) => c.status === 'Active' && (!dept || c.deptCodes.indexOf(dept) >= 0));

// ---------- list ----------
export async function staffList(c) {
  setTitle('Staff');
  c.innerHTML = skeleton(8);
  const all = await api('staff.list', { status: 'All' });
  const counts = {}; all.filter((s) => s.status === 'Active').forEach((s) => { counts[s.deptCode] = (counts[s.deptCode] || 0) + 1; });
  setTitle('Staff', all.filter((s) => s.status === 'Active').length + ' active');
  c.innerHTML = `
    <div class="row">
      <label class="search">${icon('search')}<input id="q" type="search" placeholder="Name, Employee ID or mobile" value="${esc(filt.q)}" aria-label="Search staff"></label>
      <span class="sp"></span>
      <button class="btn ghost" id="exp" type="button">${icon('download')}Export CSV</button>
      <a class="btn ghost" href="#/staff/import">${icon('upload')}Import Excel / CSV</a>
      <a class="btn primary" href="#/staff/new">${icon('user-plus')}Add staff</a>
    </div>
    <div class="chips" id="deptChips">
      <button type="button" class="chip${filt.dept ? '' : ' on'}" data-dept="">All departments</button>
      ${state.boot.departments.map((d) => `<button type="button" class="chip${filt.dept === d.code ? ' on' : ''}" data-dept="${esc(d.code)}">${esc(d.name)} <span class="ct">${counts[d.code] || 0}</span></button>`).join('')}
      <select class="chip" id="st" aria-label="Status">${['Active', 'Exited', 'All'].map((s) => `<option${filt.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
      <select class="chip" id="fc" aria-label="Face status"><option value="">Face: any</option>${['Not enrolled', 'Pending', 'Active', 'Disabled'].map((s) => `<option${filt.face === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
    </div>
    <div id="tbl"></div>
    <div class="row" style="color:var(--muted);font-size:12px"><span id="cnt"></span><span class="sp"></span><span>Date of birth and mobile are shown to Admin and Ops manager only.</span></div>`;
  const draw = () => {
    if (!document.getElementById('cnt')) return; // page was left before a delayed search ran
    const q = filt.q.toLowerCase();
    const rows = all.filter((s) => (!filt.dept || s.deptCode === filt.dept) && (filt.status === 'All' || s.status === filt.status) && (!filt.face || s.faceStatus === filt.face) &&
      (!q || s.fullName.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q) || s.mobile.includes(q) || (s.vendorCode || '').toLowerCase().includes(q)))
      .sort((a, b) => a.staffId < b.staffId ? -1 : 1);
    $('#cnt').textContent = `Showing ${rows.length} of ${all.length}`;
    $('#tbl').innerHTML = rows.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Employee ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Company</th><th class="n">Age</th><th>Mobile</th><th>Joined</th><th>Status</th><th>Face</th></tr></thead><tbody>
      ${rows.map((s) => `<tr class="click" data-id="${esc(s.staffId)}" tabindex="0"><td class="tnum nw"><b>${esc(s.staffId)}</b></td><td class="nw">${esc(s.displayName)}</td><td>${esc(s.deptName)}</td><td>${esc(s.designation)}</td><td title="${esc(s.companyName)}">${esc(s.companyCode || s.companyName)}</td><td class="n">${esc(s.age)}</td><td class="tnum nw">${esc(s.mobile)}</td><td class="tnum nw">${esc(OSC.fmtDate(s.joinDate))}</td><td>${statusPill(s.status)}</td><td>${facePill(s.faceStatus)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="card">${emptyState('users', all.length ? 'No staff match these filters.' : 'No staff yet. Add the first person or import your list.', '<a class="btn primary" href="#/staff/new">' + icon('user-plus') + 'Add staff</a>')}</div>`;
  };
  draw();
  $('#q').oninput = debounce((e) => { filt.q = e.target.value.trim(); draw(); }, 150);
  $$('#deptChips [data-dept]').forEach((b) => { b.onclick = () => { filt.dept = b.dataset.dept; $$('#deptChips [data-dept]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }; });
  $('#st').onchange = (e) => { filt.status = e.target.value; draw(); };
  $('#fc').onchange = (e) => { filt.face = e.target.value; draw(); };
  $('#tbl').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) go('#/staff/' + tr.dataset.id); };
  $('#tbl').onkeydown = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') go('#/staff/' + tr.dataset.id); };
  $('#exp').onclick = () => download('staff-' + today() + '.csv', toCSV(all, [
    { label: 'Employee ID', key: 'staffId' }, { label: 'Title', key: 'title' }, { label: 'Full Name', key: 'fullName' }, { label: 'DOB', get: (r) => OSC.fmtDate(r.dob) },
    { label: 'Age', key: 'age' }, { label: 'Mobile', key: 'mobile' }, { label: 'Department', key: 'deptName' }, { label: 'Designation', key: 'designation' },
    { label: 'Company', key: 'companyName' }, { label: 'Joining Date', get: (r) => OSC.fmtDate(r.joinDate) }, { label: 'Exit Date', get: (r) => OSC.fmtDate(r.exitDate) },
    { label: 'Status', key: 'status' }, { label: 'Face', key: 'faceStatus' }, { label: 'Vendor Code', key: 'vendorCode' }]));
}

// ---------- add ----------
function staffFormHtml(v, isNew) {
  v = v || {};
  return `
    ${field('title', 'Title', { type: 'select', options: state.boot.titles, value: v.title, placeholder: 'Choose', required: true })}
    ${field('fullName', 'Full name', { value: v.fullName, required: true, attrs: 'autocomplete="off" maxlength="60"', hint: 'As on ID proof, in English' })}
    ${field('dob', 'Date of birth', { type: 'date', value: v.dob, required: true, hint: v.dob ? 'Age ' + OSC.ageOn(v.dob, today()) : 'Must be 18 or older' })}
    ${field('mobile', 'Mobile', { type: 'tel', value: v.mobile, required: true, attrs: 'inputmode="numeric" maxlength="14"', hint: '10 digits' })}
    ${isNew ? field('deptCode', 'Department', { type: 'select', options: activeDepts().map((d) => ({ value: d.code, label: d.name + ' (' + d.code + ')' })), value: v.deptCode, placeholder: 'Choose', required: true }) : ''}
    ${field('designation', 'Designation', { type: 'select', options: state.boot.designations, value: v.designation || 'Staff', required: true })}
    ${isNew ? field('companyId', 'Outsourced company', { type: 'select', options: [], placeholder: 'Choose department first', required: true }) : ''}
    ${field('joinDate', 'Joining date', { type: 'date', value: v.joinDate || today(), required: true })}
    ${field('vendorCode', 'Vendor code (optional)', { value: v.vendorCode, attrs: 'maxlength="30"', hint: "The company's own employee code" })}`;
}
function wireStaffForm(form) {
  const dob = $('[name=dob]', form), hint = $('[data-field=dob] .hint', form);
  dob.oninput = () => { const a = OSC.ageOn(dob.value, today()); hint.textContent = a == null ? 'Must be 18 or older' : 'Age ' + a; };
  const dept = $('[name=deptCode]', form), co = $('[name=companyId]', form);
  if (dept && co) {
    const fill = () => {
      const list = companiesFor(dept.value);
      co.innerHTML = `<option value="">${dept.value ? (list.length ? 'Choose' : 'No active company serves this department') : 'Choose department first'}</option>` + list.map((c) => `<option value="${esc(c.companyId)}">${esc(c.name)}</option>`).join('');
      if (list.length === 1) co.value = list[0].companyId;
    };
    dept.onchange = fill; fill();
  }
}
function clientCtx(selfId, isNew) {
  return { today: today(), titles: state.boot.titles, designations: state.boot.designations, departments: state.boot.departments, companies: state.boot.companies, activeMobiles: {}, selfId, isNew };
}

export async function staffNew(c) {
  setTitle('Add staff');
  if (!state.boot.companies.some((x) => x.status === 'Active')) {
    c.innerHTML = `<div class="note warn">${icon('triangle-alert')}<span>Add an outsourced company first, then add staff. <a href="#/companies/new">Add company</a></span></div>`; return;
  }
  c.innerHTML = `<form class="card" novalidate id="sf"><h2>${icon('user-plus')}New staff member</h2><div class="form">${staffFormHtml({}, true)}
    <div class="field wide"><span class="hint">The Employee ID is given automatically from the department code, for example HK001. It never changes and is never reused.</span></div>
    <div class="note bad wide" hidden data-err style="grid-column:1/-1"></div>
    <div class="formbar"><a class="btn ghost" href="#/staff">Cancel</a><button class="btn primary" type="submit">Save staff</button></div></div></form>`;
  const form = $('#sf');
  wireStaffForm(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(form), err = $('[data-err]', form), btn = $('button[type=submit]', form);
    clearErrors(form); err.hidden = true;
    const r = OSC.validateStaff(d, clientCtx(null, true));
    if (!r.ok) { showErrors(form, r.errors); return; }
    setBusy(btn, true);
    try {
      const s = await api('staff.create', d);
      toast(`${s.displayName} added as ${s.staffId}`);
      go('#/staff/' + s.staffId);
    } catch (ex) { setBusy(btn, false); if (ex.fields) showErrors(form, ex.fields); err.textContent = ex.message; err.hidden = false; }
  };
}

// ---------- detail ----------
export async function staffDetail(c, id) {
  setTitle(id);
  c.innerHTML = skeleton(8);
  const [s, audit] = await Promise.all([api('staff.get', { staffId: id }), api('audit.recent', { entity: 'Staff', entityId: id, limit: 500 })]);
  setTitle(s.displayName, s.staffId);
  const rate = s.currentRate;
  const histLabel = { department: 'Department', company: 'Company', designation: 'Designation' };
  const histVal = (h) => h.field === 'department' ? deptName(h.value) : h.field === 'company' ? ((state.boot.companies.find((x) => x.companyId === h.value) || {}).name || h.value) : h.value;
  c.innerHTML = `
    <div class="row"><a class="btn link" href="#/staff">${icon('chevron-left')}All staff</a></div>
    <div class="card"><div class="row" style="gap:16px">
      <span class="av" style="width:56px;height:56px;font-size:18px">${esc(initials(s.fullName))}</span>
      <div><h2 style="font-size:22px">${esc(s.displayName)}</h2><div class="tnum" style="color:var(--muted)">${esc(s.staffId)} · ${esc(s.deptName)} · ${esc(s.designation)}</div></div>
      <span class="sp"></span>${statusPill(s.status)} ${facePill(s.faceStatus)}
    </div>
    <div class="row" style="margin-top:16px">
      ${s.status === 'Active' ? `<button class="btn ghost" id="bEdit">${icon('pencil')}Edit</button><button class="btn ghost" id="bMove">${icon('arrow-left-right')}Transfer</button><button class="btn ghost" id="bExit">${icon('user-x')}Mark exit</button>
        <button class="btn ghost" disabled title="Face enrollment arrives in Phase 2">${icon('scan-face')}Enroll face</button>`
        : `<button class="btn ghost" id="bEdit">${icon('pencil')}Edit</button><button class="btn primary" id="bRejoin">${icon('user-check')}Re-join</button>`}
    </div></div>
    <div class="grid g2">
      <div class="card"><h3>Details</h3><dl class="kv">
        <dt>Employee ID</dt><dd class="tnum">${esc(s.staffId)}</dd>
        <dt>Date of birth</dt><dd class="tnum">${esc(OSC.fmtDate(s.dob))} <span style="color:var(--muted)">(age ${esc(s.age)})</span></dd>
        <dt>Mobile</dt><dd class="tnum">${esc(s.mobile)}</dd>
        <dt>Company</dt><dd>${esc(s.companyName)}</dd>
        <dt>Joining date</dt><dd class="tnum">${esc(OSC.fmtDate(s.joinDate))}</dd>
        ${s.exitDate ? `<dt>Exit date</dt><dd class="tnum">${esc(OSC.fmtDate(s.exitDate))} · ${esc(s.exitReason)}</dd>` : ''}
        <dt>Vendor code</dt><dd>${esc(s.vendorCode || '—')}</dd>
        <dt>Rate today</dt><dd class="tnum">${rate ? esc(OSC.fmtINR(rate.ratePerDuty)) + ' per duty + GST ' + esc(rate.gstPct) + '%' : '<span class="pill warn">No rate card for today</span>'}</dd>
      </dl></div>
      <div class="card"><h3>History</h3>${s.history.length ? `<div class="tablebox" style="max-height:300px"><table class="t"><thead><tr><th>What</th><th>Value</th><th>From</th><th>To</th></tr></thead><tbody>
        ${s.history.map((h) => `<tr><td>${esc(histLabel[h.field] || h.field)}</td><td>${esc(histVal(h))}</td><td class="tnum nw">${esc(OSC.fmtDate(h.effectiveFrom))}</td><td class="tnum nw">${esc(h.effectiveTo ? OSC.fmtDate(h.effectiveTo) : 'now')}</td></tr>`).join('')}
        </tbody></table></div>` : emptyState('history', 'No history')}</div>
    </div>
    <div class="card"><h3>Change log</h3>${audit.length ? `<div class="tablebox" style="max-height:320px"><table class="t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Reason</th></tr></thead><tbody>
      ${audit.map((a) => `<tr><td class="tnum nw">${esc(OSC.fmtDateTime(a.at))}</td><td>${esc(a.username)}</td><td>${esc(a.action)}</td><td>${esc(a.reason)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('history', 'No changes yet')}</div>`;

  const reload = () => staffDetail(c, id);
  const be = $('#bEdit');
  if (be) be.onclick = async () => {
    const r = await dialog({
      title: 'Edit ' + s.staffId, submitLabel: 'Save changes',
      body: `<div class="form">${staffFormHtml(s, false)}
        ${field('designationFrom', 'If designation changed: from date', { type: 'date', value: today(), hint: 'Used only when designation changes' })}
        ${field('reason', 'Reason for change', { type: 'textarea', required: true, wide: true })}</div>`,
      onOpen: wireStaffForm,
      onSubmit: async (form) => {
        const d = formData(form);
        const v = OSC.validateStaff(Object.assign({}, d), clientCtx(id, false));
        const f = Object.assign({}, v.errors); if ((d.reason || '').length < 3) f.reason = 'Enter a reason';
        if (Object.keys(f).length) { showErrors(form, f); throw new Error('Please correct the highlighted fields'); }
        d.staffId = id; return api('staff.update', d);
      }
    });
    if (r) { toast('Saved'); reload(); }
  };
  const bm = $('#bMove');
  if (bm) bm.onclick = async () => {
    const r = await dialog({
      title: 'Transfer ' + s.staffId, submitLabel: 'Transfer',
      body: `<p>The Employee ID stays ${esc(s.staffId)}. Duties before the date stay with the old department and company.</p><div class="form" style="margin-top:12px">
        ${field('deptCode', 'Department', { type: 'select', options: activeDepts().map((d) => ({ value: d.code, label: d.name })), value: s.deptCode, required: true })}
        ${field('companyId', 'Company', { type: 'select', options: [], required: true })}
        ${field('effectiveFrom', 'From date', { type: 'date', value: today(), required: true })}
        ${field('reason', 'Reason', { type: 'textarea', required: true, wide: true })}</div>`,
      onOpen: (form) => {
        const dept = $('[name=deptCode]', form), co = $('[name=companyId]', form);
        const fill = () => { const list = companiesFor(dept.value); co.innerHTML = list.length ? list.map((x) => `<option value="${esc(x.companyId)}"${x.companyId === s.companyId ? ' selected' : ''}>${esc(x.name)}</option>`).join('') : '<option value="">No active company serves this department</option>'; };
        dept.onchange = fill; fill();
      },
      onSubmit: (form) => { const d = formData(form); d.staffId = id; return api('staff.transfer', d); }
    });
    if (r) { toast('Transferred'); reload(); }
  };
  const bx = $('#bExit');
  if (bx) bx.onclick = async () => {
    const r = await dialog({
      title: 'Mark exit · ' + s.displayName, submitLabel: 'Mark exit', danger: true,
      body: `<p>Face data is switched off now and deleted after the retention period. History is kept.</p><div class="form" style="margin-top:12px">
        ${field('exitDate', 'Last working date', { type: 'date', value: today(), required: true })}
        ${field('exitReason', 'Reason', { type: 'select', options: ['Resigned', 'Absconding', 'Terminated by company', 'Contract ended', 'Moved to other site', 'Other'], required: true })}</div>`,
      onSubmit: (form) => { const d = formData(form); d.staffId = id; return api('staff.exit', d); }
    });
    if (r) { toast('Exit recorded'); reload(); }
  };
  const br = $('#bRejoin');
  if (br) br.onclick = async () => {
    const r = await dialog({
      title: 'Re-join · ' + s.displayName, submitLabel: 'Re-join',
      body: `<p>Same Employee ID ${esc(s.staffId)}. The face must be enrolled again.</p><div class="form" style="margin-top:12px">
        ${field('rejoinDate', 'Re-joining date', { type: 'date', value: today(), required: true })}
        ${field('reason', 'Reason', { type: 'textarea', required: true, wide: true })}</div>`,
      onSubmit: (form) => { const d = formData(form); d.staffId = id; return api('staff.reactivate', d); }
    });
    if (r) { toast('Re-joined'); reload(); }
  };
}

// ---------- import ----------
const ALIASES = {
  title: ['title'], fullName: ['full name', 'name', 'fullname', 'staff name', 'employee name'],
  dob: ['dob', 'date of birth', 'birth date', 'birthdate'], mobile: ['mobile', 'mobile no', 'mobile number', 'phone', 'contact'],
  deptCode: ['department code', 'dept code', 'department', 'dept'], designation: ['designation', 'role'],
  companyCode: ['company code', 'company', 'vendor company'], joinDate: ['joining date', 'join date', 'doj', 'date of joining'],
  vendorCode: ['vendor code', 'vendor id', 'vendor employee code', 'company employee code']
};
function mapRows(table) {
  const head = table[0].map((h) => String(h || '').trim().toLowerCase().replace(/\s+/g, ' '));
  const idx = {}, missing = [];
  Object.keys(ALIASES).forEach((k) => { const i = head.findIndex((h) => ALIASES[k].indexOf(h) >= 0); if (i >= 0) idx[k] = i; else if (k !== 'vendorCode') missing.push(k); });
  if (missing.length) throw new Error('Missing column(s): ' + missing.map((k) => ALIASES[k][0]).join(', ') + '. Use the template.');
  return table.slice(1).map((r) => {
    const o = {};
    Object.keys(idx).forEach((k) => {
      let v = r[idx[k]];
      if (v instanceof Date) v = OSC.parseDate(v);
      else if (typeof v === 'number' && (k === 'dob' || k === 'joinDate')) v = OSC.parseDate(v);
      o[k] = v == null ? '' : String(v).trim();
    });
    return o;
  });
}
export function staffImport(c) {
  setTitle('Import staff');
  c.innerHTML = `
    <div class="row"><a class="btn link" href="#/staff">${icon('chevron-left')}All staff</a></div>
    <div class="card" style="display:grid;gap:14px"><h2>${icon('upload')}Import staff from Excel or CSV</h2>
      <ol style="margin:0;padding-left:20px;display:grid;gap:4px">
        <li>Download the template: <a href="templates/staff_import_template.xlsx" download>Excel</a> or <a href="templates/staff_import_template.csv" download>CSV</a>.</li>
        <li>Fill one row per person. Department codes: ${state.boot.departments.map((d) => `<b>${esc(d.code)}</b> = ${esc(d.name)}`).join(', ')}. Company codes: ${state.boot.companies.map((x) => `<b>${esc(x.code)}</b> = ${esc(x.name)}`).join(', ') || '<i>add companies first</i>'}.</li>
        <li>Choose the file. Nothing is saved until every row is correct and you press Import.</li></ol>
      <div class="field"><label for="file">File (.xlsx or .csv, up to 300 rows)</label><input id="file" type="file" accept=".xlsx,.csv,text/csv"></div>
    </div><div id="rep"></div>`;
  $('#file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rep = $('#rep');
    rep.innerHTML = skeleton(4);
    try {
      let table;
      if (/\.xlsx$/i.test(f.name)) {
        if (!window.readXlsxFile) throw new Error('Excel reader did not load. Save the file as CSV and try again.');
        table = await window.readXlsxFile(f);
      } else table = parseCSV(await f.text());
      if (!table.length || table.length < 2) throw new Error('The file has no data rows');
      const rows = mapRows(table);
      const res = await api('staff.import', { rows, commit: false });
      showReport(rep, rows, res, f.name);
    } catch (ex) { rep.innerHTML = `<div class="note bad">${icon('circle-x')}<span>${esc(ex.message)}</span></div>`; }
  };
}
function showReport(rep, rows, res, fileName) {
  const label = { title: 'Title', fullName: 'Name', dob: 'DOB', mobile: 'Mobile', deptCode: 'Department', designation: 'Designation', companyId: 'Company', joinDate: 'Joining date' };
  rep.innerHTML = `<div class="card" style="display:grid;gap:12px">
    <div class="row"><h2>${esc(fileName)}</h2><span class="sp"></span><span class="pill ok">${res.valid} ready</span>${res.invalid ? `<span class="pill bad">${res.invalid} with problems</span>` : ''}</div>
    ${res.invalid ? `<div class="note warn">${icon('triangle-alert')}<span>Fix the rows below in your file and choose it again. Nothing has been saved.</span></div>` : `<div class="note">${icon('circle-check')}<span>All ${res.total} rows are correct. Employee IDs are given when you press Import.</span></div>`}
    <div class="tablebox"><table class="t"><thead><tr><th>Row</th><th>Name</th><th>Department</th><th>Mobile</th><th>Result</th></tr></thead><tbody>
      ${res.report.map((r) => `<tr><td class="tnum">${r.row}</td><td>${esc(rows[r.row - 2].title)} ${esc(rows[r.row - 2].fullName)}</td><td>${esc(rows[r.row - 2].deptCode)}</td><td class="tnum">${esc(rows[r.row - 2].mobile)}</td>
        <td>${r.ok ? '<span class="pill ok">OK</span>' : Object.keys(r.errors).map((k) => `<div style="color:var(--bad)">${esc(label[k] || k)}: ${esc(r.errors[k])}</div>`).join('')}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="formbar">${res.invalid ? '<button class="btn ghost" id="errCsv">' + icon('download') + 'Download problem list</button>' : ''}
      <button class="btn primary" id="go" ${res.invalid ? 'disabled' : ''}>Import ${res.total} staff</button></div></div>`;
  const ec = $('#errCsv');
  if (ec) ec.onclick = () => download('import-problems.csv', toCSV(res.report.filter((r) => !r.ok), [{ label: 'Row', key: 'row' }, { label: 'Name', get: (r) => rows[r.row - 2].fullName }, { label: 'Problems', get: (r) => Object.keys(r.errors).map((k) => (label[k] || k) + ': ' + r.errors[k]).join('; ') }]));
  const g = $('#go');
  if (g) g.onclick = async () => {
    setBusy(g, true);
    try {
      const out = await api('staff.import', { rows, commit: true });
      if (!out.committed) { showReport(rep, rows, out, fileName); return; }
      rep.innerHTML = `<div class="card"><div class="note">${icon('circle-check')}<span>${out.created.length} staff imported: ${esc(out.created[0])} to ${esc(out.created[out.created.length - 1])}. Next, enroll their faces one by one (Phase 2).</span></div><div class="formbar"><a class="btn primary" href="#/staff">Open staff list</a></div></div>`;
      toast(out.created.length + ' staff imported');
    } catch (ex) { setBusy(g, false); toast(ex.message, 'bad'); }
  };
}
