/* Company master and rate cards. */
import { api } from './api.js';
import { esc, icon, toast, dialog, field, formData, showErrors, clearErrors, setBusy, skeleton, emptyState, setTitle, $, $$ } from './ui.js';
import { state, go, loadBoot, deptName, today } from './state.js';

const OSC = window.OSC;
const deptOpts = () => state.boot.departments.filter((d) => d.active).map((d) => ({ value: d.code, label: d.name }));

function companyFormHtml(v) {
  v = v || {};
  return `
    ${field('name', 'Company name', { value: v.name, required: true, attrs: 'maxlength="100"' })}
    ${field('code', 'Short code', { value: v.code, required: true, attrs: 'maxlength="10" style="text-transform:uppercase"', hint: 'Used in imports and bills, e.g. ABCFS' })}
    ${field('deptCodes', 'Departments served', { type: 'checks', options: deptOpts(), value: v.deptCodes || [], required: true, wide: true })}
    ${field('contractStart', 'Contract start', { type: 'date', value: v.contractStart, required: true })}
    ${field('contractEnd', 'Contract end (optional)', { type: 'date', value: v.contractEnd })}
    ${field('status', 'Status', { type: 'select', options: ['Active', 'Inactive'], value: v.status || 'Active' })}
    ${field('gstin', 'GSTIN (optional)', { value: v.gstin, attrs: 'maxlength="15" style="text-transform:uppercase"' })}
    ${field('pan', 'PAN (optional)', { value: v.pan, attrs: 'maxlength="10" style="text-transform:uppercase"' })}
    ${field('contactName', 'Contact person', { value: v.contactName })}
    ${field('contactMobile', 'Contact mobile', { type: 'tel', value: v.contactMobile, attrs: 'inputmode="numeric"' })}
    ${field('contactEmail', 'Contact email', { type: 'email', value: v.contactEmail })}
    ${field('address', 'Address', { type: 'textarea', value: v.address, wide: true })}
    ${field('notes', 'Notes', { type: 'textarea', value: v.notes, wide: true })}`;
}
function companyCtx(selfId) {
  const codes = {}; state.boot.companies.forEach((c) => { codes[c.code] = c.companyId; });
  return { today: today(), departments: state.boot.departments, existingCodes: codes, selfId };
}
function prepare(d) { d.deptCodes = (d.deptCodes || []).join(','); return d; }

export async function companiesList(c) {
  setTitle('Companies & rates');
  c.innerHTML = skeleton(5);
  const list = await api('companies.list');
  c.innerHTML = `<div class="row"><span style="color:var(--muted)">Outsourced service providers, their contracts and rate cards.</span><span class="sp"></span><a class="btn primary" href="#/companies/new">${icon('plus')}Add company</a></div>
    ${list.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Code</th><th>Company</th><th>Departments</th><th>Contract</th><th>GSTIN</th><th>Status</th></tr></thead><tbody>
      ${list.map((x) => `<tr class="click" data-id="${esc(x.companyId)}" tabindex="0"><td><b>${esc(x.code)}</b></td><td>${esc(x.name)}</td><td>${x.deptCodes.map((d) => esc(deptName(d))).join(', ')}</td>
        <td class="tnum nw">${esc(OSC.fmtDate(x.contractStart))} to ${esc(x.contractEnd ? OSC.fmtDate(x.contractEnd) : 'open')}</td><td class="tnum">${esc(x.gstin || '—')}</td>
        <td>${x.status === 'Active' ? '<span class="pill ok">Active</span>' : '<span class="pill neu">Inactive</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="card">${emptyState('building-2', 'No companies yet. Add each outsourced service provider, then its rates.', `<a class="btn primary" href="#/companies/new">${icon('plus')}Add company</a>`)}</div>`}`;
  const tb = $('.tablebox', c);
  if (tb) { tb.onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) go('#/companies/' + tr.dataset.id); }; tb.onkeydown = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') go('#/companies/' + tr.dataset.id); }; }
}

export function companyNew(c) {
  setTitle('Add company');
  c.innerHTML = `<div class="row"><a class="btn link" href="#/companies">${icon('chevron-left')}All companies</a></div>
    <form class="card" novalidate id="cf"><h2>${icon('building-2')}New company</h2><div class="form">${companyFormHtml()}
    <div class="note bad" hidden data-err style="grid-column:1/-1"></div>
    <div class="formbar"><a class="btn ghost" href="#/companies">Cancel</a><button class="btn primary" type="submit">Save company</button></div></div></form>`;
  const form = $('#cf');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = prepare(formData(form)), err = $('[data-err]', form), btn = $('button[type=submit]', form);
    clearErrors(form); err.hidden = true;
    const r = OSC.validateCompany(d, companyCtx(null));
    if (!r.ok) { showErrors(form, r.errors); return; }
    setBusy(btn, true);
    try {
      const co = await api('companies.save', d);
      await loadBoot();
      toast(co.name + ' added. Now add its rates.');
      go('#/companies/' + co.companyId);
    } catch (ex) { setBusy(btn, false); if (ex.fields) showErrors(form, ex.fields); err.textContent = ex.message; err.hidden = false; }
  };
}

export async function companyDetail(c, id) {
  setTitle('Company');
  c.innerHTML = skeleton(8);
  const co = await api('companies.get', { companyId: id });
  setTitle(co.name, co.code);
  const groups = {};
  co.rates.forEach((r) => { const k = r.deptCode + '|' + r.designation; (groups[k] = groups[k] || []).push(r); });
  const t = today();
  const current = (list) => list.find((r) => r.status === 'Active' && r.effectiveFrom <= t && (!r.effectiveTo || r.effectiveTo >= t));
  c.innerHTML = `
    <div class="row"><a class="btn link" href="#/companies">${icon('chevron-left')}All companies</a><span class="sp"></span>
      <button class="btn ghost" id="bEdit">${icon('pencil')}Edit company</button><button class="btn primary" id="bRate">${icon('plus')}Add rate</button></div>
    <div class="grid g2">
      <div class="card"><h3>Company</h3><dl class="kv">
        <dt>Name</dt><dd>${esc(co.name)}</dd><dt>Code</dt><dd>${esc(co.code)}</dd>
        <dt>Departments</dt><dd>${co.deptCodes.map((d) => esc(deptName(d))).join(', ')}</dd>
        <dt>Contract</dt><dd class="tnum">${esc(OSC.fmtDate(co.contractStart))} to ${esc(co.contractEnd ? OSC.fmtDate(co.contractEnd) : 'open')}</dd>
        <dt>Status</dt><dd>${co.status === 'Active' ? '<span class="pill ok">Active</span>' : '<span class="pill neu">Inactive</span>'}</dd>
        <dt>GSTIN</dt><dd class="tnum">${esc(co.gstin || '—')}</dd><dt>PAN</dt><dd class="tnum">${esc(co.pan || '—')}</dd>
        <dt>Contact</dt><dd>${esc([co.contactName, co.contactMobile, co.contactEmail].filter(Boolean).join(' · ') || '—')}</dd>
        <dt>Address</dt><dd>${esc(co.address || '—')}</dd>${co.notes ? `<dt>Notes</dt><dd>${esc(co.notes)}</dd>` : ''}
      </dl></div>
      <div class="card"><h3>Rates in force today (${esc(OSC.fmtDate(t))})</h3>
        ${co.deptCodes.map((d) => state.boot.designations.map((g) => {
          const cur = current(groups[d + '|' + g] || []);
          return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>${esc(deptName(d))} · ${esc(g)}</span><span class="sp"></span>${cur ? `<b class="tnum">${esc(OSC.fmtINR(cur.ratePerDuty))}</b><span class="pill neu">GST ${esc(cur.gstPct)}%</span>` : '<span class="pill warn">No rate</span>'}</div>`;
        }).join('')).join('')}
        <p class="hint" style="color:var(--muted);font-size:12px;margin:10px 0 0">Rate per 12-hour duty. A new rate closes the previous one the day before it starts. Past bills keep the rate that was in force.</p>
      </div>
    </div>
    <div class="card"><h3>All rate cards</h3>${co.rates.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Department</th><th>Designation</th><th class="n">Rate per duty</th><th class="n">GST</th><th>From</th><th>To</th><th>Status</th><th>Added by</th><th></th></tr></thead><tbody>
      ${co.rates.slice().sort((a, b) => (a.deptCode + a.designation).localeCompare(b.deptCode + b.designation) || (a.effectiveFrom < b.effectiveFrom ? 1 : -1)).map((r) => `<tr${r.status !== 'Active' ? ' style="opacity:.55"' : ''}><td>${esc(deptName(r.deptCode))}</td><td>${esc(r.designation)}</td><td class="n">${esc(OSC.fmtINR(r.ratePerDuty))}</td><td class="n">${esc(r.gstPct)}%</td>
        <td class="tnum nw">${esc(OSC.fmtDate(r.effectiveFrom))}</td><td class="tnum nw">${esc(r.effectiveTo ? OSC.fmtDate(r.effectiveTo) : 'open')}</td>
        <td>${r.status === 'Active' ? '<span class="pill ok">Active</span>' : `<span class="pill neu" title="${esc(r.voidReason)}">Cancelled</span>`}</td><td>${esc(r.createdBy)}<div style="font-size:12px;color:var(--muted)">${esc(OSC.fmtDateTime(r.createdAt))}</div></td>
        <td>${r.status === 'Active' ? `<button class="btn link sm" data-void="${esc(r.rateId)}">${icon('ban')}Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : emptyState('indian-rupee', 'No rates yet. Add the staff and supervisor rate for each department.')}</div>`;

  $('#bEdit').onclick = async () => {
    const r = await dialog({
      title: 'Edit ' + co.name, submitLabel: 'Save',
      body: `<div class="form">${companyFormHtml(co)}${field('reason', 'Reason for change', { type: 'textarea', required: true, wide: true })}</div>`,
      onSubmit: async (form) => {
        const d = prepare(formData(form)); d.companyId = id;
        const v = OSC.validateCompany(d, companyCtx(id));
        const f = Object.assign({}, v.errors); if ((d.reason || '').length < 3) f.reason = 'Enter a reason';
        if (Object.keys(f).length) { showErrors(form, f); throw new Error('Please correct the highlighted fields'); }
        return api('companies.save', d);
      }
    });
    if (r) { await loadBoot(); toast('Company saved'); companyDetail(c, id); }
  };
  $('#bRate').onclick = async () => {
    const r = await dialog({
      title: 'Add rate · ' + co.name, submitLabel: 'Add rate',
      body: `<div class="form">
        ${field('deptCode', 'Department', { type: 'select', options: co.deptCodes.map((d) => ({ value: d, label: deptName(d) })), required: true })}
        ${field('designation', 'Designation', { type: 'select', options: state.boot.designations, required: true })}
        ${field('ratePerDuty', 'Rate per 12-hour duty (₹)', { type: 'number', required: true, attrs: 'step="0.01" min="0" inputmode="decimal"' })}
        ${field('gstPct', 'GST %', { type: 'number', value: '18', required: true, attrs: 'step="0.01" min="0" max="28"' })}
        ${field('effectiveFrom', 'Effective from', { type: 'date', value: today(), required: true })}
        ${field('effectiveTo', 'Effective to (optional)', { type: 'date', hint: 'Leave empty for open-ended' })}
        ${field('note', 'Note (e.g. agreement reference)', { wide: true })}</div>`,
      onSubmit: (form) => { const d = formData(form); d.companyId = id; const v = OSC.validateRate(d, { company: co, designations: state.boot.designations }); if (!v.ok) { showErrors(form, v.errors); throw new Error('Please correct the highlighted fields'); } return api('rates.add', d); }
    });
    if (r) { toast('Rate added'); companyDetail(c, id); }
  };
  $$('[data-void]', c).forEach((b) => {
    b.onclick = async () => {
      const r = await dialog({
        title: 'Cancel this rate card?', submitLabel: 'Cancel rate', danger: true, cancelLabel: 'Keep it',
        body: `<p>Use this only for a rate entered by mistake. To change a rate, add a new one with a later start date.</p><div class="form" style="margin-top:12px">${field('reason', 'Reason', { type: 'textarea', required: true, wide: true })}</div>`,
        onSubmit: (form) => api('rates.void', { rateId: b.dataset.void, reason: formData(form).reason })
      });
      if (r) { toast('Rate cancelled'); companyDetail(c, id); }
    };
  });
}
