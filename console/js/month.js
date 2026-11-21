/* Phase 5: Month-end pack (bills, Excel pack, PDF, lock/unlock), Compare & what-if, Automation & emails (Admin). */
import { api, apiFast } from './api.js';
import { esc, icon, toast, dialog, field, formData, skeleton, emptyState, setTitle, setBusy, $, $$ } from './ui.js';
import { state, isAdmin, today } from './state.js';

const OSC = window.OSC, BILL = window.OSCBill;
const rs = (n) => '₹ ' + BILL.inr(n);
const months = () => { const out = [], t = today().slice(0, 7); let y = +t.slice(0, 4), m = +t.slice(5, 7); for (let i = 0; i < 14; i++) { out.push(y + '-' + String(m).padStart(2, '0')); m--; if (!m) { m = 12; y--; } } return out; };
let curMonth = null, curDept = null;
const monthPicker = (val) => `<select class="chip" id="mSel" aria-label="Month">${months().map((m) => `<option value="${m}"${m === val ? ' selected' : ''}>${esc(OSC.fmtMonth(m))}</option>`).join('')}</select>`;
const deptPicker = (val) => `<select class="chip" id="dSel" aria-label="Department">${state.boot.departments.filter((d) => d.active).map((d) => `<option value="${esc(d.code)}"${d.code === val ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`;

/** base64 file from the server -> browser download */
function saveFile(f) {
  const bin = atob(f.base64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([arr], { type: f.mime }));
  a.download = f.name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// =============================== Month-end pack ===============================
export async function monthView(c) {
  curMonth = curMonth || BILL.prevMonth(today().slice(0, 7));
  setTitle('Month-end pack', OSC.fmtMonth(curMonth));
  c.innerHTML = skeleton(8);
  const [st, bills] = await Promise.all([api('month.status', { month: curMonth }), apiFast('month.bills', { month: curMonth })]);
  c.innerHTML = `<div class="row">${monthPicker(curMonth)}<span class="sp"></span><a class="btn ghost" href="#/compare">${icon('scale')}Compare & what-if</a>
      <button class="btn ghost" id="mRefresh">${icon('refresh-cw')}Refresh</button></div>
    ${st.monthOver ? '' : `<div class="note warn">${icon('clock')}<span>${esc(st.label)} is not over yet. You can check the draft bill now; locking opens on the 1st of next month.</span></div>`}
    <div id="mDepts" style="display:grid;gap:16px"></div>
    <div class="card"><h2>${icon('file-text')}Final bills for ${esc(st.label)}</h2><div id="mBills"></div></div>`;
  $('#mSel').onchange = (e) => { curMonth = e.target.value; monthView(c); };
  $('#mRefresh').onclick = () => monthView(c);
  $('#mDepts').innerHTML = st.departments.map((d) => deptCard(d, st)).join('');
  $('#mBills').innerHTML = bills.length ? `<div class="tablebox" style="border:0"><table class="t"><thead><tr><th>Bill No</th><th>Department</th><th>Company</th><th class="n">Duties</th><th class="n">Penalties</th><th class="n">Net payable</th><th>Status</th><th>Locked</th></tr></thead><tbody>
      ${bills.map((b) => `<tr><td class="nw"><b>${esc(b.billNo)}</b></td><td>${esc(b.deptCode)}</td><td>${esc(b.companyName)}</td><td class="n tnum">${BILL.r3(b.duties).toFixed(3)}</td><td class="n tnum">${rs(b.penalties)}</td><td class="n tnum"><b>${rs(b.payable)}</b></td>
        <td><span class="pill ${b.status === 'Final' ? 'ok' : b.status === 'Unlocked' ? 'warn' : 'neu'}">${esc(b.status)}</span>${b.forced ? ` <span class="pill warn" title="${esc(b.forced)}">locked with open items</span>` : ''}</td><td class="nw tnum" style="font-size:12px">${esc(OSC.fmtDateTime(b.lockedAt))} · ${esc(b.lockedBy)}</td></tr>`).join('')}</tbody></table></div>`
    : emptyState('file-text', 'No final bills yet for this month. Bills become final when the department is locked.');
  bind(c, st);
}

function deptCard(d, st) {
  const lockPill = d.locked ? `<span class="pill ok">${icon('lock')}Locked ${esc(OSC.fmtDateTime(d.lockedAt))} · ${esc(d.lockedBy)}</span>` : `<span class="pill neu">${icon('lock-open')}Open</span>`;
  const anyBlock = d.companies.some((x) => !x.ready);
  const cos = d.companies.length ? d.companies.map((x) => `<div class="mco">
      <div class="row"><div><b>${esc(x.companyName)}</b><div style="font-size:12px;color:var(--muted)">${x.billNo ? esc(x.billNo) : 'Draft (not final)'}</div></div><span class="sp"></span>
        <div style="text-align:right"><div class="tnum" style="font-size:20px;font-weight:700">${rs(x.payable)}</div><div style="font-size:12px;color:var(--muted)">${BILL.r3(x.duties).toFixed(3)} duties · ${x.status === 'FINAL' ? 'final' : 'draft'}</div></div></div>
      ${x.blockers.length ? `<div class="note warn" style="margin-top:10px">${icon('triangle-alert')}<span><b>Clear before locking:</b><br>${x.blockers.map((b) => esc(b.text)).join('<br>')}<br><a href="#/exceptions">Open Exceptions</a></span></div>` : ''}
      ${x.warnings && x.warnings.length ? `<div class="note" style="margin-top:8px">${icon('circle-check')}<span>${x.warnings.map(esc).join('<br>')}</span></div>` : ''}
      <div class="row" style="margin-top:10px">
        <button class="btn ghost sm" data-prev="${esc(d.deptCode)}|${esc(x.companyId)}">${icon('search')}View bill</button>
        <button class="btn ghost sm" data-file="xlsx" data-k="${esc(d.deptCode)}|${esc(x.companyId)}">${icon('file-spreadsheet')}Excel pack</button>
        <button class="btn ghost sm" data-file="pdf" data-k="${esc(d.deptCode)}|${esc(x.companyId)}">${icon('download')}Bill PDF</button></div></div>`).join('')
    : `<div style="color:var(--muted)">No duties for ${esc(d.deptName)} in ${esc(st.label)}.</div>`;
  let action = '';
  if (d.locked) action = isAdmin() ? `<button class="btn ghost sm" data-unlock="${esc(d.deptCode)}">${icon('lock-open')}Unlock (Admin)</button>` : '<span style="font-size:12px;color:var(--muted)">Only the Admin can unlock</span>';
  else if (st.monthOver) action = anyBlock ? (isAdmin() ? `<button class="btn ghost sm" data-lock="${esc(d.deptCode)}" data-force="1">${icon('lock')}Lock anyway…</button>` : '') : `<button class="btn primary sm" data-lock="${esc(d.deptCode)}">${icon('lock')}Lock ${esc(st.label)}</button>`;
  return `<div class="card"><div class="row" style="margin-bottom:12px"><h2 style="margin:0">${esc(d.deptName)} <span class="pill neu">${esc(d.deptCode)}</span></h2>${lockPill}<span class="sp"></span>${action}</div>
    <div style="display:grid;gap:12px">${cos}</div></div>`;
}

function bind(c, st) {
  $$('[data-file]', c).forEach((b) => {
    b.onclick = async () => {
      const [dept, co] = b.dataset.k.split('|');
      setBusy(b, true);
      try { const f = await api('month.file', { month: curMonth, deptCode: dept, companyId: co, kind: b.dataset.file }); saveFile(f); toast((f.final ? 'Final ' : 'Draft ') + (b.dataset.file === 'pdf' ? 'bill PDF' : 'Excel pack') + ' downloaded'); }
      catch (e) { toast(e.message, 'bad'); }
      setBusy(b, false);
    };
  });
  $$('[data-prev]', c).forEach((b) => { b.onclick = () => { const [dept, co] = b.dataset.prev.split('|'); billDialog(dept, co); }; });
  $$('[data-lock]', c).forEach((b) => {
    b.onclick = async () => {
      const dept = b.dataset.lock, force = !!b.dataset.force, name = (state.boot.departments.find((x) => x.code === dept) || {}).name;
      const r = await dialog({
        title: (force ? 'Lock with open items · ' : 'Lock ') + name + ' · ' + st.label, submitLabel: force ? 'Lock anyway' : 'Lock month', danger: force,
        body: `<p>Locking makes the bill <b>final</b>: the Excel pack and PDF are saved to Google Drive, and nobody can change punches, decisions, penalties or deductions of ${esc(name)} for ${esc(st.label)} until the Admin unlocks it.</p>
          ${force ? `<div class="form" style="margin-top:10px">${field('reason', 'Why lock with open items?', { type: 'textarea', required: true, wide: true })}</div>` : ''}
          <p style="font-size:12px;color:var(--muted);margin-top:8px">When every department is locked, the monthly summary email goes out with the bills attached.</p>`,
        onSubmit: (form) => api('month.lock', { month: curMonth, deptCode: dept, force, reason: force ? formData(form).reason : '' })
      });
      if (r) { toast('Locked · ' + r.bills.map((x) => x.billNo).join(', ') + (r.summaryEmail && r.summaryEmail.status === 'SENT' ? ' · summary email sent' : '')); monthView(c); }
    };
  });
  $$('[data-unlock]', c).forEach((b) => {
    b.onclick = async () => {
      const dept = b.dataset.unlock;
      const r = await dialog({ title: 'Unlock ' + dept + ' · ' + st.label, submitLabel: 'Unlock', danger: true,
        body: `<p>The final bill stays in the history. After corrections, lock again to make a new revision (for example ...-R1).</p><div class="form" style="margin-top:10px">${field('reason', 'Reason for unlocking', { type: 'textarea', required: true, wide: true })}</div>`,
        onSubmit: (form) => api('month.unlock', { month: curMonth, deptCode: dept, reason: formData(form).reason }) });
      if (r) { toast('Unlocked'); monthView(c); }
    };
  });
}

async function billDialog(dept, companyId) {
  const m = await api('month.preview', { month: curMonth, deptCode: dept, companyId });
  const lines = m.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.label)}</td><td class="n tnum">${BILL.inr(l.netH)}</td><td class="n tnum">${BILL.r3(l.duties).toFixed(3)}</td><td class="n tnum">${l.rate == null ? '<span class="pill bad">No rate</span>' : BILL.inr(l.rate)}</td><td class="n tnum">${BILL.inr(l.amount)}</td></tr>`).join('');
  const sum = (label, v, b) => `<tr><td colspan="5" class="n" style="${b ? 'font-weight:700' : ''}">${esc(label)}</td><td class="n tnum" style="${b ? 'font-weight:700' : ''}">${v}</td></tr>`;
  await dialog({
    title: (m.status === 'FINAL' ? 'Final bill ' + m.billNo : 'Draft bill') + ' · ' + m.monthLabel, submitLabel: '', cancelLabel: 'Close',
    body: `<div class="billpv" style="font-size:13px;color:var(--muted);margin-bottom:8px">${esc(m.company.name || '')} · ${esc(m.dept.name)} · ${esc(OSC.fmtDate(m.from))} to ${esc(OSC.fmtDate(m.to))} · ${m.people} people</div>
      <div class="tablebox"><table class="t"><thead><tr><th>#</th><th>Particulars</th><th class="n">Net hours</th><th class="n">Duties</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${lines}
      ${sum('Sub total', BILL.inr(m.gross))}${sum('Less penalties (' + m.penaltyRows.length + ')', '- ' + BILL.inr(m.penaltyTotal))}${sum('Taxable amount', BILL.inr(m.taxable), true)}
      ${m.gstLines.map((g) => sum('GST @ ' + g.pct + '%', BILL.inr(g.amount))).join('')}${sum('Net amount', BILL.inr(m.net))}${sum('Round off', BILL.inr(m.roundOff))}${sum('Net payable', rs(m.payable), true)}</tbody></table></div>
      <p style="margin-top:8px;font-style:italic">${esc(m.words)}</p>
      <h3 style="margin-top:14px">Hours</h3><div class="tablebox"><table class="t"><thead><tr><th>Particulars</th><th class="n">8 Hrs</th><th class="n">4 Hrs</th><th class="n">Double</th><th class="n">Total</th><th class="n">Deduction</th><th class="n">Net</th></tr></thead><tbody>
      ${m.lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="n tnum">${BILL.inr(l.h8)}</td><td class="n tnum">${BILL.inr(l.h4)}</td><td class="n tnum">${BILL.inr(l.dd)}</td><td class="n tnum">${BILL.inr(l.total)}</td><td class="n tnum">${BILL.inr(l.dedH)}</td><td class="n tnum"><b>${BILL.inr(l.netH)}</b></td></tr>`).join('')}</tbody></table></div>
      ${m.penaltyRows.length ? `<h3 style="margin-top:14px">Penalty remarks</h3><ol style="padding-left:20px;font-size:13px">${m.penaltyRows.map((p) => `<li>${esc(OSC.fmtDate(p.date))} · ${esc(p.reason)}${p.name ? ' (' + esc(p.name) + ')' : ''}: <b>${BILL.inr(p.amount)}</b></li>`).join('')}</ol>` : ''}
      ${m.blockers.length ? `<div class="note warn" style="margin-top:10px">${icon('triangle-alert')}<span>${m.blockers.map((b) => esc(b.text)).join('<br>')}</span></div>` : ''}`
  });
}

// =============================== Compare & what-if ===============================
export async function compareView(c) {
  curMonth = curMonth || BILL.prevMonth(today().slice(0, 7));
  curDept = curDept || (state.boot.departments.find((d) => d.active) || {}).code;
  setTitle('Compare & what-if', OSC.fmtMonth(curMonth));
  c.innerHTML = skeleton(8);
  const cmp = await api('month.compare', { month: curMonth, deptCode: curDept });
  const st = await apiFast('month.status', { month: curMonth });
  const dep = st.departments.find((d) => d.deptCode === curDept) || { companies: [] };
  const best = cmp.companies.filter((x) => !x.missingRates.length).reduce((a, x) => (!a || x.payable < a.payable ? x : a), null);
  const cur = cmp.companies.find((x) => x.current);
  c.innerHTML = `<div class="row">${monthPicker(curMonth)}${deptPicker(curDept)}<span class="sp"></span><a class="btn ghost" href="#/month">${icon('file-text')}Month-end pack</a></div>
    <div class="card"><h2>${icon('scale')}Company comparison · ${esc(cmp.deptName)} · ${esc(OSC.fmtMonth(curMonth))}</h2>
      <p style="color:var(--muted);font-size:13px;margin-bottom:10px">The same ${BILL.inr(cmp.hours.netH)} net hours (${BILL.r3(cmp.hours.duties).toFixed(3)} duties) priced with each company's rate cards for ${esc(cmp.deptName)}. Penalties are left out here (this month's actual penalties: ${rs(cmp.actual.penalties)}).</p>
      ${cmp.companies.length ? `<div class="tablebox" style="border:0"><table class="t"><thead><tr><th>Company</th><th>Rates used</th><th class="n">Before GST</th><th class="n">GST</th><th class="n">Net payable</th><th class="n">vs current</th></tr></thead><tbody>
        ${cmp.companies.map((x) => `<tr${best && x.companyId === best.companyId ? ' style="background:var(--ok-soft)"' : ''}><td><b>${esc(x.companyName)}</b> ${x.current ? '<span class="pill pri">current</span>' : ''} ${x.status !== 'Active' ? `<span class="pill neu">${esc(x.status)}</span>` : ''}
          ${x.missingRates.length ? `<div class="pill bad" style="margin-top:4px">No rate for ${esc(x.missingRates.join(', '))}</div>` : ''}</td>
          <td style="font-size:12px">${x.lines.map((l) => esc(l.label) + ': ' + (l.rate == null ? '—' : BILL.inr(l.rate))).join('<br>')}</td><td class="n tnum">${BILL.inr(x.gross)}</td><td class="n tnum">${BILL.inr(x.gst)}</td><td class="n tnum"><b>${rs(x.payable)}</b></td>
          <td class="n tnum">${cur && !x.current ? `<span style="color:${x.payable <= cur.payable ? 'var(--ok)' : 'var(--bad)'}">${x.payable <= cur.payable ? '' : '+'}${BILL.inr(x.payable - cur.payable)}</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>`
        : emptyState('building-2', 'No company has rate cards for this department. Add them in Companies & rates.')}
    </div>
    <div class="card" id="wiRates"><h2>${icon('calculator')}What-if: rates, GST and penalties</h2><div id="wiR"></div></div>
    <div class="card"><h2>${icon('scale')}What-if: attendance rules</h2>
      <p style="color:var(--muted);font-size:13px;margin-bottom:10px">Recalculates every duty of ${esc(OSC.fmtMonth(curMonth))} from the same punches and Ops decisions with these settings. Nothing is saved; rule changes are made on Attendance rules (Admin).</p>
      <form id="wiRules" class="form" novalidate>${field('graceMin', 'Grace after boundary (min)', { type: 'number', value: 10 })}${field('earlySnapMin', 'Early arrival counted from boundary (min)', { type: 'number', value: 120 })}
        ${field('extraHalfFromMin', 'Extra time: ½ hour from (min)', { type: 'number', value: 30 })}${field('extraFullFromMin', 'Extra time: 1 hour from (min)', { type: 'number', value: 45 })}
        ${field('over12NeedsApproval', 'Over 12 h needs approval', { type: 'select', options: ['true', 'false'], value: 'true' })}
        <div class="field wide"><button class="btn primary" type="submit">${icon('play')}Calculate</button></div></form><div id="wiRulesOut"></div></div>`;
  $('#mSel').onchange = (e) => { curMonth = e.target.value; compareView(c); };
  $('#dSel').onchange = (e) => { curDept = e.target.value; compareView(c); };
  ratesWhatIf(dep);
  const form = $('#wiRules');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(form), btn = $('button[type=submit]', form);
    const params = { graceMin: +d.graceMin, earlySnapMin: +d.earlySnapMin, extraHalfFromMin: +d.extraHalfFromMin, extraFullFromMin: +d.extraFullFromMin, over12NeedsApproval: d.over12NeedsApproval === 'true' };
    setBusy(btn, true);
    try {
      const r = await api('month.whatIfRules', { month: curMonth, deptCode: curDept, params });
      $('#wiRulesOut').innerHTML = `<div class="tablebox" style="margin-top:12px"><table class="t"><thead><tr><th>Company</th><th class="n">Hours now</th><th class="n">Hours with these rules</th><th class="n">Net payable now</th><th class="n">With these rules</th><th class="n">Difference</th></tr></thead><tbody>
        ${r.companies.map((x) => `<tr><td>${esc(x.companyName)}</td><td class="n tnum">${BILL.inr(x.current.hours)}</td><td class="n tnum">${BILL.inr(x.proposed.hours)}</td><td class="n tnum">${rs(x.current.payable)}</td><td class="n tnum"><b>${rs(x.proposed.payable)}</b></td>
          <td class="n tnum" style="color:${x.difference > 0 ? 'var(--bad)' : x.difference < 0 ? 'var(--ok)' : 'inherit'}">${x.difference > 0 ? '+' : ''}${BILL.inr(x.difference)}</td></tr>`).join('') || '<tr><td colspan="6">No duties this month</td></tr>'}</tbody></table></div>
        <p style="margin-top:8px;font-size:13px">${r.changedDuties} duties would change.</p>
        ${r.sample.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Date</th><th>Staff</th><th>IN</th><th>OUT</th><th class="n">Now</th><th class="n">Would be</th></tr></thead><tbody>${r.sample.map((s) => `<tr><td class="nw">${esc(OSC.fmtDate(s.dutyDate))}</td><td>${esc(s.name)}</td><td class="nw tnum">${esc(OSC.fmtDateTime(s.inAt))}</td><td class="nw tnum">${esc(OSC.fmtDateTime(s.outAt))}</td><td class="n tnum">${BILL.inr(s.before)}</td><td class="n tnum"><b>${BILL.inr(s.after)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}`;
    } catch (ex) { $('#wiRulesOut').innerHTML = `<div class="note bad" style="margin-top:10px">${esc(ex.message)}${ex.fields ? '<br>' + Object.keys(ex.fields).map((k) => esc(k + ': ' + ex.fields[k])).join('<br>') : ''}</div>`; }
    setBusy(btn, false);
  };
}

async function ratesWhatIf(dep) {
  const box = $('#wiR');
  if (!dep.companies.length) { box.innerHTML = emptyState('calculator', 'No bill for this department and month.'); return; }
  const co = dep.companies[0].companyId;
  box.innerHTML = skeleton(3);
  const m = await apiFast('month.preview', { month: curMonth, deptCode: curDept, companyId: co });
  box.innerHTML = `<p style="color:var(--muted);font-size:13px;margin-bottom:10px">Bill of <b>${esc(m.company.name || '')}</b>. Change a rate, GST or penalties to see the effect; nothing is saved.</p>
    <div class="tablebox" style="border:0"><table class="t"><thead><tr><th>Particulars</th><th class="n">Duties</th><th class="n">Rate now</th><th class="n">What-if rate</th><th class="n">Amount</th></tr></thead><tbody>
    ${m.lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="n tnum">${BILL.r3(l.duties).toFixed(3)}</td><td class="n tnum">${l.rate == null ? '—' : BILL.inr(l.rate)}</td>
      <td class="n"><input class="wi" data-key="${esc(l.key)}" type="number" step="0.01" min="0" value="${l.rate == null ? '' : l.rate}" style="width:110px;text-align:right" aria-label="What-if rate for ${esc(l.label)}"></td><td class="n tnum" data-amt="${esc(l.key)}">${BILL.inr(l.amount)}</td></tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:12px"><label>GST % <input id="wiGst" type="number" step="0.01" min="0" value="${m.gstLines[0] ? m.gstLines[0].pct : 18}" style="width:80px"></label>
      <label>Penalties ₹ <input id="wiPen" type="number" step="1" min="0" value="${m.penaltyTotal}" style="width:120px"></label><span class="sp"></span></div>
    <div class="grid g3" style="margin-top:12px"><div class="kpi"><div class="l">Net payable now</div><div class="v tnum" style="font-size:22px">${rs(m.payable)}</div></div>
      <div class="kpi"><div class="l">What-if net payable</div><div class="v tnum" style="font-size:22px" id="wiPay">${rs(m.payable)}</div></div>
      <div class="kpi"><div class="l">Difference</div><div class="v tnum" style="font-size:22px" id="wiDiff">0.00</div></div></div>`;
  const recalc = () => {
    const rates = {}; $$('.wi', box).forEach((i) => { rates[i.dataset.key] = i.value; });
    const w = BILL.whatIf(m, { rates, gstPct: $('#wiGst').value, penaltyTotal: $('#wiPen').value });
    w.lines.forEach((l) => { const td = box.querySelector(`[data-amt="${CSS.escape(l.key)}"]`); if (td) td.textContent = BILL.inr(l.amount); });
    $('#wiPay').textContent = rs(w.payable);
    const d = $('#wiDiff'); d.textContent = (w.difference > 0 ? '+' : '') + BILL.inr(w.difference); d.style.color = w.difference > 0 ? 'var(--bad)' : w.difference < 0 ? 'var(--ok)' : '';
  };
  $$('input', box).forEach((i) => { i.oninput = recalc; });
}

// =============================== Automation & emails (Admin) ===============================
export async function automationView(c) {
  setTitle('Automation & emails');
  c.innerHTML = skeleton(8);
  const [js, log] = await Promise.all([api('jobs.status'), api('email.log', { limit: 50 })]);
  const pill = (s) => s === 'OK' || s === 'SENT' ? 'ok' : s === 'FAILED' ? 'bad' : s ? 'warn' : 'neu';
  c.innerHTML = `${js.trigger ? `<div class="note">${icon('circle-check')}<span>Automatic processing is on (every 5 minutes). Last punch processing: ${esc(js.lastProcessing ? OSC.fmtDateTime(js.lastProcessing) : 'not yet')}. Emails left today: ${js.mailQuota == null ? '—' : js.mailQuota}.</span></div>`
      : `<div class="note bad">${icon('triangle-alert')}<span>Automatic processing is <b>off</b>. In the Google Sheet choose OutSource Connect → 4. Start automatic processing.</span></div>`}
    <div class="card"><h2>${icon('clock')}Scheduled jobs</h2><div class="tablebox" style="border:0"><table class="t"><thead><tr><th>Job</th><th>When</th><th>Last run</th><th>Result</th><th></th></tr></thead><tbody>
      ${js.jobs.map((j) => `<tr><td><b>${esc(j.label)}</b>${j.enabled ? '' : ' <span class="pill neu">off in Settings</span>'}</td><td class="nw">${esc(j.when)}</td><td class="nw tnum">${esc(j.lastAt ? OSC.fmtDateTime(j.lastAt) : '—')}</td>
        <td><span class="pill ${pill(j.lastStatus)}">${esc(j.lastStatus || 'not run')}</span><div style="font-size:11px;color:var(--muted);max-width:420px;word-break:break-word">${esc(j.lastDetail)}</div></td>
        <td class="n"><button class="btn ghost sm" data-run="${esc(j.id)}">${icon('play')}Run now</button></td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h2>${icon('mail')}Emails</h2>
      <div class="row" style="margin-bottom:12px"><button class="btn primary sm" id="eTest">${icon('mail')}Send test email</button>
        <button class="btn ghost sm" data-pv="morning">Preview morning</button><button class="btn ghost sm" data-pv="evening">Preview evening</button>
        <button class="btn ghost sm" data-pv="monthly">Preview monthly summary</button><button class="btn ghost sm" data-pv="tablet">Preview tablet alert</button><span class="sp"></span><a class="btn link sm" href="#/settings">${icon('settings')}Email settings</a></div>
      <div class="tablebox" style="border:0"><table class="t"><thead><tr><th>When</th><th>Type</th><th>To</th><th>Subject</th><th>Result</th></tr></thead><tbody>
      ${log.map((r) => `<tr><td class="nw tnum">${esc(OSC.fmtDateTime(r.at))}</td><td>${esc(r.kind)}</td><td style="font-size:12px">${esc(r.to)}</td><td>${esc(r.subject)}</td><td><span class="pill ${pill(r.status)}">${esc(r.status)}</span> <span style="font-size:12px;color:var(--muted)">${esc(r.detail)}</span></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No emails yet</td></tr>'}</tbody></table></div></div>
    <div class="card"><h2>${icon('history')}Job history</h2><div class="tablebox" style="border:0"><table class="t"><thead><tr><th>When</th><th>Job</th><th>Result</th><th class="n">Time</th><th>Details</th></tr></thead><tbody>
      ${js.log.map((r) => `<tr><td class="nw tnum">${esc(OSC.fmtDateTime(r.at))}</td><td>${esc(r.job)}</td><td><span class="pill ${pill(r.status)}">${esc(r.status)}</span></td><td class="n tnum">${(r.ms / 1000).toFixed(1)} s</td><td style="font-size:12px;word-break:break-word">${esc(r.detail)}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">Nothing yet</td></tr>'}</tbody></table></div></div>`;
  $$('[data-run]', c).forEach((b) => {
    b.onclick = async () => {
      setBusy(b, true);
      try { const r = await api('jobs.run', { job: b.dataset.run }); toast(r.status === 'OK' ? 'Done in ' + (r.ms / 1000).toFixed(1) + ' s' : 'Failed: ' + r.result, r.status === 'OK' ? '' : 'bad'); automationView(c); }
      catch (e) { toast(e.message, 'bad'); setBusy(b, false); }
    };
  });
  $('#eTest').onclick = async (e) => {
    const b = e.currentTarget; setBusy(b, true);
    try { const r = await api('email.test'); toast(r.status === 'SENT' ? 'Test email sent to ' + r.to : r.status + ': ' + r.detail, r.status === 'SENT' ? '' : 'bad'); automationView(c); }
    catch (ex) { toast(ex.message, 'bad'); setBusy(b, false); }
  };
  $$('[data-pv]', c).forEach((b) => {
    b.onclick = async () => {
      setBusy(b, true);
      try {
        const p = await api('email.preview', { kind: b.dataset.pv });
        await dialog({ title: p.subject, submitLabel: '', cancelLabel: 'Close', body: `${p.attachments ? `<p style="font-size:12px;color:var(--muted)">${p.attachments} PDF attachment(s)</p>` : ''}<iframe class="mailpv" sandbox="" title="Email preview"></iframe>`,
          onOpen: (form) => { $('iframe', form).srcdoc = p.html; } });
      } catch (ex) { toast(ex.message, 'bad'); }
      setBusy(b, false);
    };
  });
}
