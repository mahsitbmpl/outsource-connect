/* Admin pages: departments, users, settings, audit log. */
import { api, apiFast } from './api.js';
import { esc, icon, toast, dialog, field, formData, skeleton, emptyState, setTitle, $, $$ } from './ui.js';
import { state, loadBoot } from './state.js';

const OSC = window.OSC;

// ---------- departments ----------
export async function departmentsView(c) {
  setTitle('Departments');
  c.innerHTML = skeleton(4);
  const list = await apiFast('departments.list');
  c.innerHTML = `<div class="row"><span style="color:var(--muted)">The code starts every Employee ID (HK001). Required headcount feeds the dashboard and emails.</span><span class="sp"></span><button class="btn primary" id="add">${icon('plus')}Add department</button></div>
    <div class="tablebox"><table class="t"><thead><tr><th>Code</th><th>Name</th><th class="n">Required Day</th><th class="n">Required Night</th><th>Next Employee ID</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map((d) => `<tr><td><b>${esc(d.code)}</b></td><td>${esc(d.name)}</td><td class="n">${esc(d.reqDay)}</td><td class="n">${esc(d.reqNight)}</td><td class="tnum">${esc(OSC.staffId(d.code, d.nextSeq || 1))}</td>
      <td>${d.active ? '<span class="pill ok">Active</span>' : '<span class="pill neu">Inactive</span>'}</td><td><button class="btn link sm" data-edit="${esc(d.code)}">${icon('pencil')}Edit</button></td></tr>`).join('')}
    </tbody></table></div>`;
  const open = async (d) => {
    const isNew = !d; d = d || { reqDay: 0, reqNight: 0, active: true };
    const r = await dialog({
      title: isNew ? 'Add department' : 'Edit ' + d.name, submitLabel: 'Save',
      body: `<div class="form">
        ${field('code', 'Code', { value: d.code, required: true, attrs: (isNew ? '' : 'readonly ') + 'maxlength="4" style="text-transform:uppercase"', hint: isNew ? '2 to 4 capital letters. Cannot be changed later.' : 'Code cannot be changed' })}
        ${field('name', 'Name', { value: d.name, required: true })}
        ${field('reqDay', 'Required headcount, Day', { type: 'number', value: d.reqDay, required: true, attrs: 'min="0" step="1"' })}
        ${field('reqNight', 'Required headcount, Night', { type: 'number', value: d.reqNight, required: true, attrs: 'min="0" step="1"' })}
        ${isNew ? '' : field('active', 'Status', { type: 'select', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }], value: String(d.active) })}
        ${isNew ? '' : field('reason', 'Reason for change', { type: 'textarea', required: true, wide: true })}</div>`,
      onSubmit: (form) => { const v = formData(form); v.active = v.active !== 'false'; return api('departments.save', v); }
    });
    if (r) { await loadBoot(); toast('Department saved'); departmentsView(c); }
  };
  $('#add').onclick = () => open(null);
  $$('[data-edit]', c).forEach((b) => { b.onclick = () => open(list.find((d) => d.code === b.dataset.edit)); });
}

// ---------- users ----------
function secretDialog(title, username, pw) {
  return dialog({
    title, submitLabel: 'I have noted it', noCancel: true,
    body: `<p>Give this temporary password to <b>${esc(username)}</b> in person. It is shown only once. They must change it at first sign-in.</p>
      <div class="secret" style="margin-top:12px">${esc(pw)}</div><button type="button" class="btn ghost" id="cp" style="margin-top:8px">${icon('copy')}Copy</button>`,
    onOpen: (form) => { $('#cp', form).onclick = async () => { try { await navigator.clipboard.writeText(pw); toast('Copied'); } catch (e) { toast('Select the password and copy it', 'bad'); } }; }
  });
}
export async function usersView(c) {
  setTitle('Users');
  c.innerHTML = skeleton(5);
  const [list, log] = await Promise.all([apiFast('users.list'), apiFast('users.loginLog', { limit: 100 })]);
  c.innerHTML = `<div class="row"><span style="color:var(--muted)">Ops managers and Admins who can sign in to this console. Staff never sign in.</span><span class="sp"></span><button class="btn primary" id="add">${icon('user-plus')}Add user</button></div>
    <div class="tablebox"><table class="t"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>
    ${list.map((u) => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.fullName)}</td><td>${u.role === 'ADMIN' ? 'Admin' : 'Ops manager'}</td>
      <td>${!u.active ? '<span class="pill neu">Disabled</span>' : u.locked ? `<span class="pill bad">${icon('lock')}Locked</span>` : u.mustChange ? '<span class="pill warn">Must change password</span>' : '<span class="pill ok">Active</span>'}</td>
      <td class="tnum nw">${esc(u.lastLoginAt ? OSC.fmtDateTime(u.lastLoginAt) : 'Never')}</td>
      <td class="nw"><button class="btn link sm" data-reset="${esc(u.username)}">${icon('key-round')}${u.locked ? 'Unlock / reset' : 'Reset password'}</button>
        ${u.username !== state.user.username ? `<button class="btn link sm" data-toggle="${esc(u.username)}" data-active="${u.active}">${u.active ? icon('user-x') + 'Disable' : icon('user-check') + 'Enable'}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="card"><h3>${icon('history')}Recent sign-ins</h3>${log.length ? `<div class="tablebox" style="max-height:360px"><table class="t"><thead><tr><th>When</th><th>Username</th><th>Result</th><th>Detail</th><th>Device</th></tr></thead><tbody>
      ${log.map((l) => `<tr><td class="tnum nw">${esc(OSC.fmtDateTime(l.at))}</td><td>${esc(l.username)}</td><td>${l.result === 'OK' ? '<span class="pill ok">OK</span>' : `<span class="pill ${l.result === 'LOCKED' ? 'bad' : 'warn'}">${esc(l.result)}</span>`}</td><td>${esc(l.detail)}</td><td class="muted" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.userAgent)}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState('history', 'No sign-ins yet')}</div>`;
  $('#add').onclick = async () => {
    const r = await dialog({
      title: 'Add user', submitLabel: 'Create user',
      body: `<div class="form">${field('username', 'Username', { required: true, attrs: 'autocapitalize="none" spellcheck="false"', hint: 'Small letters, e.g. rina.shah' })}
        ${field('fullName', 'Full name', { required: true })}
        ${field('role', 'Role', { type: 'select', options: [{ value: 'OPS', label: 'Ops manager' }, { value: 'ADMIN', label: 'Admin' }], value: 'OPS' })}</div>`,
      onSubmit: (form) => api('users.create', formData(form))
    });
    if (r) { await secretDialog('User created', r.username, r.tempPassword); usersView(c); }
  };
  $$('[data-reset]', c).forEach((b) => {
    b.onclick = async () => {
      const r = await dialog({
        title: 'Reset password for ' + b.dataset.reset, submitLabel: 'Reset password',
        body: `<p>This signs the user out everywhere, unlocks the account and creates a new temporary password.</p><div class="form" style="margin-top:12px">${field('reason', 'Reason', { type: 'textarea', required: true, wide: true })}</div>`,
        onSubmit: (form) => api('users.resetPassword', { username: b.dataset.reset, reason: formData(form).reason })
      });
      if (r) { await secretDialog('Password reset', r.username, r.tempPassword); usersView(c); }
    };
  });
  $$('[data-toggle]', c).forEach((b) => {
    b.onclick = async () => {
      const enable = b.dataset.active !== 'true';
      const r = await dialog({
        title: (enable ? 'Enable ' : 'Disable ') + b.dataset.toggle, submitLabel: enable ? 'Enable' : 'Disable', danger: !enable,
        body: `<div class="form">${field('reason', 'Reason', { type: 'textarea', required: true, wide: true })}</div>`,
        onSubmit: (form) => api('users.setActive', { username: b.dataset.toggle, active: enable, reason: formData(form).reason })
      });
      if (r) { toast(enable ? 'User enabled' : 'User disabled'); usersView(c); }
    };
  });
}

// ---------- settings ----------
const GROUPS = [
  ['Organisation', ['orgName', 'orgAddress', 'orgGstin', 'footerText']],
  ['Bills', ['billPrefix', 'billSignatures']],
  ['Staff lists', ['titles', 'designations']],
  ['Emails', ['emailTo', 'emailCc', 'emailBcc', 'emailAlertTo', 'emailMorningTime', 'emailEveningTime', 'emailEveningEnabled', 'emailMonthlyEnabled', 'consoleUrl']],
  ['Tablet', ['kioskLanguages', 'kioskReloadTime', 'tabletAlertsEnabled', 'tabletSilentAlertMinutes', 'tabletLowBatteryPct', 'tabletQueueAlert']],
  ['Automation', ['nightlyCloseTime', 'backupDay', 'backupTime', 'backupKeep', 'draftPackTime']],
  ['Retention', ['photoRetentionDays', 'faceDeleteDaysAfterExit', 'dataKeepYears']],
  ['Security', ['sessionHours', 'sessionIdleMinutes', 'lockoutAttempts', 'lockoutMinutes', 'passwordMinLength']]
];
export async function settingsView(c) {
  setTitle('Settings');
  c.innerHTML = skeleton(8);
  const list = await apiFast('settings.list');
  const by = {}; list.forEach((s) => { by[s.key] = s; });
  const shown = {};
  const card = (title, keys) => `<div class="card"><h3>${esc(title)}</h3><div class="tablebox" style="border:0"><table class="t"><tbody>
    ${keys.filter((k) => by[k]).map((k) => { shown[k] = 1; const s = by[k]; return `<tr><td style="width:45%"><b>${esc(s.description)}</b><div class="muted" style="font-size:12px">${esc(k)}${s.updatedBy ? ' · changed by ' + esc(s.updatedBy) + ' ' + esc(OSC.fmtDateTime(s.updatedAt)) : ''}</div></td>
      <td style="word-break:break-word">${esc(s.value) || '<span class="muted">empty</span>'}</td><td class="n"><button class="btn link sm" data-key="${esc(k)}">${icon('pencil')}Change</button></td></tr>`; }).join('')}
    </tbody></table></div></div>`;
  let html = GROUPS.map((g) => card(g[0], g[1])).join('');
  const rest = list.filter((s) => !GROUPS.some((g) => g[1].indexOf(s.key) >= 0)).map((s) => s.key);
  if (rest.length) html += card('Other', rest);
  c.innerHTML = `<div class="note">${icon('settings')}<span>Every change asks for a reason and is kept in the audit log. Attendance rules (grace, rounding, boundaries) are on their own versioned page. Emails and automatic jobs can be checked on Automation & emails.</span></div>` + html;
  $$('[data-key]', c).forEach((b) => {
    b.onclick = async () => {
      const s = by[b.dataset.key];
      const input = s.type === 'bool' ? field('value', 'New value', { type: 'select', options: ['true', 'false'], value: s.value })
        : s.type === 'time' ? field('value', 'New value (24-hour)', { type: 'time', value: s.value, required: true })
        : s.type === 'weekday' ? field('value', 'New value', { type: 'select', options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], value: s.value })
        : s.type === 'int' ? field('value', 'New value', { type: 'number', value: s.value, required: true, attrs: 'min="0" step="1"' })
        : field('value', 'New value', { type: s.type === 'list' ? 'textarea' : 'text', value: s.value, hint: s.type === 'list' ? 'Separate items with commas' : '', wide: true });
      const r = await dialog({
        title: s.description, submitLabel: 'Save',
        body: `<div class="form">${input}${field('reason', 'Reason for change', { type: 'textarea', required: true, wide: true })}</div>`,
        onSubmit: (form) => { const d = formData(form); return api('settings.update', { key: s.key, value: d.value, reason: d.reason }); }
      });
      if (r) { await loadBoot(); toast('Setting saved'); settingsView(c); }
    };
  });
}

// ---------- audit ----------
export async function auditView(c) {
  setTitle('Audit log');
  c.innerHTML = skeleton(8);
  const rows = await apiFast('audit.recent', { limit: 300 });
  const entities = Array.from(new Set(rows.map((r) => r.entity))).sort();
  c.innerHTML = `<div class="row"><span style="color:var(--muted)">Last 300 changes, newest first. Entries can never be edited or deleted.</span><span class="sp"></span>
    <select class="chip" id="ent" aria-label="Filter"><option value="">Everything</option>${entities.map((e) => `<option>${esc(e)}</option>`).join('')}</select></div><div id="al"></div>`;
  const draw = (ent) => {
    const list = rows.filter((r) => !ent || r.entity === ent);
    $('#al').innerHTML = list.length ? `<div class="tablebox"><table class="t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Reason</th><th>Change</th></tr></thead><tbody>
      ${list.map((r) => `<tr><td class="tnum nw">${esc(OSC.fmtDateTime(r.at))}</td><td>${esc(r.username)}</td><td class="nw">${esc(r.action)}</td><td class="nw">${esc(r.entity)} ${esc(r.entityId)}</td><td>${esc(r.reason)}</td>
        <td style="font-size:12px;max-width:420px">${diff(r.before, r.after)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${emptyState('history', 'Nothing yet')}</div>`;
  };
  draw('');
  $('#ent').onchange = (e) => draw(e.target.value);
}
function diff(b, a) {
  if (!a || typeof a !== 'object') return '';
  if (!b || typeof b !== 'object') return '<span class="muted">created</span>';
  const keys = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]) && !/At$|By$/.test(k));
  return keys.slice(0, 6).map((k) => `<div><b>${esc(k)}</b>: ${esc(String(b[k] == null ? '' : b[k]).slice(0, 60))} → ${esc(String(a[k] == null ? '' : a[k]).slice(0, 60))}</div>`).join('') || '<span class="muted">no field change</span>';
}
