/* UI helpers: escaping, icons (Lucide 0.460.0, ISC licence), toasts, dialogs, forms, CSV. */
export const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const ICONS = {
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  'lock-open': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  'file-spreadsheet': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  calculator: '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  'layout-dashboard': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  'building-2': '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'indian-rupee': '<path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/>',
  'tablet-smartphone': '<rect width="10" height="14" x="3" y="8" rx="2"/><path d="M5 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.4"/><path d="M8 18h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  'scan-face': '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  'key-round': '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  'arrow-left-right': '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  'user-x': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
  'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  'list-checks': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
};
export const icon = (n, cls) => `<svg class="i ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

// ---------- toasts ----------
export function toast(msg, kind) {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'bad' ? ' bad' : '');
  el.innerHTML = icon(kind === 'bad' ? 'circle-x' : 'circle-check') + `<div>${esc(msg)}</div>`;
  box.appendChild(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 7000 : 4000);
}

// ---------- dialog ----------
/**
 * Opens a dialog. body: HTML string. onSubmit(formEl) may return a promise; throw ApiError to show field errors.
 * Resolves with onSubmit's result, or null if cancelled.
 */
export function dialog({ title, body, submitLabel, danger, cancelLabel, onSubmit, onOpen, noCancel }) {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `<form class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlgT" novalidate>
      <h2 id="dlgT">${esc(title)}</h2><div class="dlgbody">${body || ''}</div><div class="note bad" hidden data-err></div>
      <div class="formbar">${noCancel ? '' : `<button type="button" class="btn ghost" data-cancel>${esc(cancelLabel || 'Cancel')}</button>`}
      ${submitLabel ? `<button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(submitLabel)}</button>` : ''}</div></form>`;
    document.body.appendChild(scrim);
    const form = $('form', scrim);
    const close = (v) => { scrim.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape' && !noCancel) close(null); };
    document.addEventListener('keydown', onKey);
    const c = $('[data-cancel]', scrim); if (c) c.onclick = () => close(null);
    if (onOpen) onOpen(form);
    const first = $('input,select,textarea,button[type=submit]', form); if (first) first.focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!onSubmit) return close(true);
      const btn = $('button[type=submit]', form);
      clearErrors(form); $('[data-err]', form).hidden = true;
      try { setBusy(btn, true); const r = await onSubmit(form); close(r === undefined ? true : r); }
      catch (err) {
        setBusy(btn, false);
        if (err && err.fields) showErrors(form, err.fields);
        const box = $('[data-err]', form); box.textContent = err.message || String(err); box.hidden = false;
      }
    };
  });
}
export const confirmBox = (title, text, label, danger) => dialog({ title, body: `<p>${esc(text)}</p>`, submitLabel: label || 'OK', danger });

// ---------- forms ----------
export function field(name, label, opts) {
  opts = opts || {};
  const id = 'f_' + name + '_' + Math.random().toString(36).slice(2, 7);
  const req = opts.required ? '<span class="req" aria-hidden="true">*</span>' : '';
  const attrs = (opts.attrs || '') + (opts.required ? ' required' : '');
  let control;
  if (opts.type === 'select') {
    control = `<select id="${id}" name="${name}" ${attrs}>${opts.placeholder ? `<option value="">${esc(opts.placeholder)}</option>` : ''}${(opts.options || []).map((o) => {
      const v = typeof o === 'object' ? o.value : o, t = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(v)}"${String(v) === String(opts.value == null ? '' : opts.value) ? ' selected' : ''}>${esc(t)}</option>`;
    }).join('')}</select>`;
  } else if (opts.type === 'textarea') {
    control = `<textarea id="${id}" name="${name}" ${attrs}>${esc(opts.value)}</textarea>`;
  } else if (opts.type === 'checks') {
    const vals = opts.value || [];
    control = `<div class="checks" id="${id}">${opts.options.map((o) => `<label><input type="checkbox" name="${name}" value="${esc(o.value)}"${vals.indexOf(o.value) >= 0 ? ' checked' : ''}>${esc(o.label)}</label>`).join('')}</div>`;
  } else {
    control = `<input id="${id}" name="${name}" type="${opts.type || 'text'}" value="${esc(opts.value)}" ${attrs}>`;
  }
  return `<div class="field${opts.wide ? ' wide' : ''}" data-field="${name}"><label for="${id}">${esc(label)}${req}</label>${control}${opts.hint ? `<span class="hint">${esc(opts.hint)}</span>` : ''}<span class="msg" hidden></span></div>`;
}
export function formData(form) {
  const out = {};
  $$('input,select,textarea', form).forEach((el) => {
    if (!el.name) return;
    if (el.type === 'checkbox') { out[el.name] = out[el.name] || []; if (el.checked) out[el.name].push(el.value); }
    else out[el.name] = el.value.trim();
  });
  return out;
}
export function clearErrors(form) {
  $$('.field.err', form).forEach((f) => { f.classList.remove('err'); const m = $('.msg', f); m.hidden = true; m.textContent = ''; });
}
export function showErrors(form, fields) {
  clearErrors(form);
  let first = null;
  Object.keys(fields || {}).forEach((k) => {
    const f = $(`[data-field="${k}"]`, form);
    if (!f) return;
    f.classList.add('err');
    const m = $('.msg', f); m.textContent = fields[k]; m.hidden = false;
    if (!first) first = f;
  });
  if (first) { const c = $('input,select,textarea', first); if (c) c.focus(); }
  return Object.keys(fields || {}).length;
}
export function setBusy(btn, on) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + 'Please wait'; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

// ---------- misc ----------
export function skeleton(lines) { return '<div class="card">' + Array.from({ length: lines || 5 }, (_, i) => `<div class="skel" style="width:${90 - (i % 3) * 15}%"></div>`).join('') + '</div>'; }
export function emptyState(iconName, text, actionHtml) { return `<div class="empty">${icon(iconName)}<div>${esc(text)}</div>${actionHtml || ''}</div>`; }
export function initials(name) { return String(name || '').replace(/^(Mr\.|Mrs\.|Ms\.|Miss|Dr\.)\s*/, '').split(/\s+/).map((x) => x[0] || '').join('').slice(0, 2).toUpperCase(); }
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function toCSV(rows, headers) {
  const q = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [headers.map((h) => q(h.label)).join(',')].concat(rows.map((r) => headers.map((h) => q(typeof h.get === 'function' ? h.get(r) : r[h.key])).join(','))).join('\r\n');
}
export function download(filename, text, mime) {
  const blob = new Blob(['﻿' + text], { type: (mime || 'text/csv') + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
/** RFC 4180 CSV parser -> array of arrays. */
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

export function setTitle(t, sub) {
  const a = document.getElementById('pageTitle'), b = document.getElementById('pageSub');
  if (a) a.textContent = t;
  if (b) b.textContent = sub || '';
  document.title = t + ' · OutSource Connect';
}
