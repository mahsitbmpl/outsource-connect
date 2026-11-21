/* Console entry: sign-in, shell, router, home. */
import { api, apiFast, session, setAuthLostHandler, ApiError, timing, setStaleHandler, clearRemembered, prefetch } from './api.js';
import { esc, icon, toast, field, formData, showErrors, clearErrors, setBusy, skeleton, initials, setTitle, $ } from './ui.js';
import { state, loadBoot, isAdmin, go, cachedBoot, useCachedBoot } from './state.js';
import { staffList, staffNew, staffDetail, staffImport } from './staff.js';
import { companiesList, companyNew, companyDetail } from './companies.js';
import { departmentsView, usersView, settingsView, auditView } from './admin.js';
import { tabletView, punchesView, unrecognisedView } from './kiosk-admin.js';
import { dutiesView, rulesView, ruleTestsView } from './duties.js';
import { dashboardView } from './dashboard.js';
import { exceptionsView, penaltiesView } from './exceptions.js';
import { monthView, compareView, automationView } from './month.js';

const OSC = window.OSC;
const FOOTER = 'Designed and developed by IT Department, Marengo Asia Hospital, Surat';
const app = document.getElementById('app');

const NAV = [
  { href: '#/home', icon: 'layout-dashboard', label: 'Dashboard' },
  { href: '#/staff', icon: 'users', label: 'Staff' },
  { href: '#/companies', icon: 'building-2', label: 'Companies & rates' },
  { href: '#/exceptions', icon: 'triangle-alert', label: 'Exceptions' },
  { href: '#/penalties', icon: 'indian-rupee', label: 'Penalties & deductions' },
  { href: '#/duties', icon: 'list-checks', label: 'Duties' },
  { href: '#/punches', icon: 'clock', label: 'Punches' },
  { href: '#/unrecognised', icon: 'scan-face', label: 'Unrecognised faces' },
  { href: '#/tablet', icon: 'tablet-smartphone', label: 'Tablet' },
  { href: '#/month', icon: 'file-text', label: 'Month-end pack' },
  { href: '#/compare', icon: 'scale', label: 'Compare & what-if' }
];
const ADMIN_NAV = [
  { href: '#/rules', icon: 'scale', label: 'Attendance rules' },
  { href: '#/departments', icon: 'layers', label: 'Departments' },
  { href: '#/users', icon: 'shield-check', label: 'Users' },
  { href: '#/settings', icon: 'settings', label: 'Settings' },
  { href: '#/automation', icon: 'zap', label: 'Automation & emails' },
  { href: '#/audit', icon: 'history', label: 'Audit log' }
];

// ---------- sign-in ----------
function loginView(message) {
  document.title = 'Sign in · OutSource Connect';
  app.innerHTML = `<div class="login"><div class="box">
    <div class="logo"><img src="img/logo.png" alt="Marengo Asia Hospitals"></div>
    <h1>OutSource Connect</h1><p class="sub">Attendance and billing for outsourced staff</p>
    <form class="card" style="display:grid;gap:14px" novalidate id="loginForm">
      ${message ? `<div class="note warn">${icon('triangle-alert')}<span>${esc(message)}</span></div>` : ''}
      ${field('username', 'Username', { required: true, attrs: 'autocomplete="username" autocapitalize="none" spellcheck="false"' })}
      ${field('password', 'Password', { type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
      <div class="note bad" hidden data-err></div>
      <button class="btn primary" type="submit">Sign in</button>
    </form>
    <div class="foot">${esc(FOOTER)}</div></div></div>`;
  const form = $('#loginForm');
  $('input', form).focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(form), btn = $('button[type=submit]', form), err = $('[data-err]', form);
    clearErrors(form); err.hidden = true;
    const f = {}; if (!d.username) f.username = 'Enter your username'; if (!d.password) f.password = 'Enter your password';
    if (showErrors(form, f)) return;
    setBusy(btn, true);
    try {
      const r = await api('auth.login', { username: d.username, password: d.password, userAgent: navigator.userAgent.slice(0, 180) });
      session.set({ token: r.token, user: r.user, expiresAt: r.expiresAt });
      if (r.user.mustChange) changePasswordView(true); else start();
    } catch (ex) { setBusy(btn, false); err.textContent = ex.message; err.hidden = false; }
  };
}

function pwRules(pw, username) {
  const rules = [
    [pw.length >= 10, 'At least 10 characters'],
    [/[A-Za-z]/.test(pw) && /\d/.test(pw), 'Letters and numbers'],
    [!!pw && !pw.toLowerCase().includes(String(username || '').toLowerCase()), 'Does not contain your username']
  ];
  return rules.map((r) => `<li class="${r[0] ? 'y' : ''}">${icon(r[0] ? 'circle-check' : 'circle-x')}${r[1]}</li>`).join('');
}
function changePasswordView(forced) {
  const s = session.get(), username = s && s.user ? s.user.username : '';
  const body = `
    ${forced ? `<div class="note">${icon('key-round')}<span>Welcome, ${esc(s.user.fullName)}. Set your own password before you continue.</span></div>` : ''}
    ${field('oldPassword', forced ? 'Temporary password' : 'Current password', { type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
    ${field('newPassword', 'New password', { type: 'password', required: true, attrs: 'autocomplete="new-password"' })}
    <ul class="pwrules" id="pwr">${pwRules('', username)}</ul>
    ${field('confirm', 'Type the new password again', { type: 'password', required: true, attrs: 'autocomplete="new-password"' })}
    <div class="note bad" hidden data-err></div>
    <div class="formbar">${forced ? '<button type="button" class="btn ghost" id="cpOut">Sign out</button>' : '<a class="btn ghost" href="#/home">Cancel</a>'}<button class="btn primary" type="submit">Save password</button></div>`;
  const html = `<form class="card" style="display:grid;gap:14px;max-width:460px" novalidate id="cpForm"><h2>Change password</h2>${body}</form>`;
  if (forced) app.innerHTML = `<div class="login"><div class="box">${html}<div class="foot">${esc(FOOTER)}</div></div></div>`;
  else { $('#content').innerHTML = html; setTitle('Change password'); }
  const form = $('#cpForm');
  $('[name=newPassword]', form).oninput = (e) => { $('#pwr').innerHTML = pwRules(e.target.value, username); };
  if (forced) $('#cpOut').onclick = () => logout();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(form), btn = $('button[type=submit]', form), err = $('[data-err]', form);
    clearErrors(form); err.hidden = true;
    const probs = OSC.validatePassword(d.newPassword, username, 10), f = {};
    if (!d.oldPassword) f.oldPassword = 'Enter the current password';
    if (probs.length) f.newPassword = 'Password needs ' + probs.join(', ');
    else if (d.confirm !== d.newPassword) f.confirm = 'The two new passwords do not match';
    if (showErrors(form, f)) return;
    setBusy(btn, true);
    try {
      await api('auth.changePassword', { oldPassword: d.oldPassword, newPassword: d.newPassword });
      const cur = session.get(); cur.user.mustChange = false; session.set(cur);
      toast('Password changed');
      if (forced) start(); else go('#/home');
    } catch (ex) { setBusy(btn, false); if (ex.fields) showErrors(form, ex.fields); err.textContent = ex.message; err.hidden = false; }
  };
}

async function logout() {
  try { await api('auth.logout'); } catch (e) { /* already signed out */ }
  session.clear(); clearRemembered(); state.boot = null; loginView();
}

// ---------- shell ----------
function navLink(n, hash) {
  if (n.soon) return `<a class="soon" aria-disabled="true">${icon(n.icon)}${esc(n.label)}</a>`;
  const on = hash === n.href || hash.indexOf(n.href + '/') === 0;
  return `<a href="${n.href}" class="${on ? 'on' : ''}"${on ? ' aria-current="page"' : ''}>${icon(n.icon)}${esc(n.label)}</a>`;
}
function renderShell() {
  const u = state.user;
  app.innerHTML = `<div class="shell">
    <nav class="side" aria-label="Main"><div class="brand"><img src="img/mark.png" alt=""><div>OutSource Connect<small>Marengo Asia Hospitals</small></div></div><div id="sideLinks"></div></nav>
    <div class="main">
      <header class="top"><img class="mlogo" src="img/mark.png" alt=""><h1 id="pageTitle">Home</h1><span class="sub tnum" id="pageSub"></span><span class="sp"></span>
        <div class="usermenu"><button type="button" id="umBtn" aria-haspopup="true" aria-expanded="false"><span class="av">${esc(initials(u.fullName))}</span><span>${esc(u.fullName.split(' ')[0])}</span></button>
          <div class="menu" id="umMenu" hidden><div class="who"><b>${esc(u.fullName)}</b><small>${esc(u.username)} · ${u.role === 'ADMIN' ? 'Admin' : 'Ops manager'}</small></div>
          <div class="who" id="umTiming" style="font-size:12px;color:var(--muted)"></div><a href="#/password">${icon('key-round')}Change password</a><button type="button" id="umOut">${icon('log-out')}Sign out</button></div></div>
      </header>
      <main class="content" id="content"></main>
      <footer class="foot"><span>${esc(FOOTER)}</span><span>OutSource Connect · v${esc(state.boot.app.version)}</span></footer>
    </div>
    <nav class="tabs" aria-label="Main (mobile)" id="tabs"></nav></div>`;
  const btn = $('#umBtn'), menu = $('#umMenu');
  btn.onclick = (e) => {
    e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden));
    const t = timing.last;
    $('#umTiming').textContent = t ? `Last server reply ${(t.totalMs / 1000).toFixed(1)} s (our code ${(t.serverMs / 1000).toFixed(2)} s, rest is Google start-up and network)` : '';
  };
  document.addEventListener('click', () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
  $('#umOut').onclick = logout;
}
function updateNav(hash) {
  $('#sideLinks').innerHTML = NAV.map((n) => navLink(n, hash)).join('') + (isAdmin() ? '<div class="sec">Admin</div>' + ADMIN_NAV.map((n) => navLink(n, hash)).join('') : '');
  const tabs = [NAV[0], NAV[1], { href: '#/companies', icon: 'building-2', label: 'Companies' }, { href: '#/more', icon: 'menu', label: 'More' }];
  $('#tabs').innerHTML = tabs.map((t) => { const on = hash === t.href || hash.indexOf(t.href + '/') === 0; return `<a href="${t.href}" class="${on ? 'on' : ''}">${icon(t.icon)}${esc(t.label)}</a>`; }).join('');
}

// ---------- home ----------
async function homeView(c) {
  setTitle('Home', OSC.fmtDate(state.boot.today));
  const draw = (s) => {
    const faceNone = s.staff.face['Not enrolled'] || 0, facePending = s.staff.face.Pending || 0;
    c.innerHTML = `
      <div class="grid g4">
        <div class="card kpi"><div class="l">${icon('users')}Active staff</div><div class="v">${s.staff.active}</div><div class="d">${s.staff.exited} exited</div></div>
        <div class="card kpi"><div class="l">${icon('scan-face')}Face not enrolled</div><div class="v">${faceNone}</div><div class="d">${facePending} pending test punch</div></div>
        <div class="card kpi"><div class="l">${icon('building-2')}Companies</div><div class="v">${s.companies}</div><div class="d"><a href="#/companies">Companies & rates</a></div></div>
        <div class="card kpi"><div class="l">${icon('layers')}Departments</div><div class="v">${s.departments.filter((d) => d.active).length}</div><div class="d">${s.departments.map((d) => esc(d.code)).join(' · ')}</div></div>
      </div>
      <div class="grid g3">${s.departments.filter((d) => d.active).map((d) => {
        const n = s.staff.byDept[d.code] || 0, req = (d.reqDay || 0) + (d.reqNight || 0);
        return `<div class="card"><div class="row"><b style="font-size:16px">${esc(d.name)}</b><span class="sp"></span><span class="pill neu">${esc(d.code)}</span></div>
          <div class="kpi"><div class="v">${n} <small>active staff</small></div></div>
          <div class="bar"><i style="width:${Math.min(100, req ? Math.round(n / req * 100) : 0)}%"></i></div>
          <div class="row" style="color:var(--muted);font-size:12px"><span>Required per day: ${d.reqDay} Day + ${d.reqNight} Night</span><span class="sp"></span><span>Next ID ${esc(OSC.staffId(d.code, d.nextSeq || 1))}</span></div></div>`;
      }).join('')}</div>
      <div class="note">${icon('clock')}<span>Live attendance, the tablet and billing are added in the next phases. This build (Phase 3) turns punches into duties with your rules every 5 minutes. See Duties, and Attendance rules for the test report.</span></div>`;
  };
  // Draw at once from start-up data; refresh only if that data is older than a minute.
  if (state.boot.summary) draw(state.boot.summary); else c.innerHTML = skeleton(6);
  if (!state.boot.summary || !state.bootAt || Date.now() - state.bootAt > 60000) {
    const fresh = await apiFast('home.summary');
    state.boot.summary = fresh;
    if ((location.hash || '#/home') === '#/home') draw(fresh);
  }
}

function moreView(c) {
  setTitle('More');
  const items = NAV.filter((n) => !n.soon && ['#/home', '#/staff', '#/companies'].indexOf(n.href) < 0).concat(isAdmin() ? ADMIN_NAV : []);
  c.innerHTML = `<div class="card" style="display:grid;gap:4px">${items.concat([{ href: '#/password', icon: 'key-round', label: 'Change password' }]).map((n) => `<a class="btn ghost" style="justify-content:flex-start" href="${n.href}">${icon(n.icon)}${esc(n.label)}</a>`).join('')}</div>`;
}

// ---------- router ----------
const ROUTES = [
  [/^#\/home$/, dashboardView],
  [/^#\/exceptions$/, exceptionsView],
  [/^#\/penalties$/, penaltiesView],
  [/^#\/month$/, monthView],
  [/^#\/compare$/, compareView],
  [/^#\/automation$/, automationView, true],
  [/^#\/staff$/, staffList],
  [/^#\/staff\/new$/, staffNew],
  [/^#\/staff\/import$/, staffImport],
  [/^#\/staff\/([A-Z]{2,4}\d{3,})$/, staffDetail],
  [/^#\/companies$/, companiesList],
  [/^#\/companies\/new$/, companyNew],
  [/^#\/companies\/(CO\d+)$/, companyDetail],
  [/^#\/departments$/, departmentsView, true],
  [/^#\/users$/, usersView, true],
  [/^#\/settings$/, settingsView, true],
  [/^#\/audit$/, auditView, true],
  [/^#\/more$/, moreView],
  [/^#\/tablet$/, tabletView],
  [/^#\/duties$/, dutiesView],
  [/^#\/rules$/, rulesView],
  [/^#\/rule-tests$/, ruleTestsView],
  [/^#\/punches$/, punchesView],
  [/^#\/unrecognised$/, unrecognisedView],
  [/^#\/password$/, () => changePasswordView(false)]
];
async function route() {
  if (!state.boot) return;
  const hash = location.hash || '#/home';
  const c = $('#content');
  updateNav(hash);
  window.scrollTo(0, 0);
  for (const [re, view, adminOnly] of ROUTES) {
    const m = re.exec(hash);
    if (!m) continue;
    if (adminOnly && !isAdmin()) { c.innerHTML = '<div class="note bad">Only the Admin can open this page.</div>'; return; }
    try { await view(c, m[1]); }
    catch (e) {
      if (e instanceof ApiError && (e.code === 'AUTH' || e.code === 'MUST_CHANGE_PASSWORD')) return;
      c.innerHTML = `<div class="note bad">${icon('circle-x')}<span>${esc(e.message || String(e))}</span></div>`;
    }
    return;
  }
  go('#/home');
}

async function start() {
  // Draw at once from the last start-up data (if any), then refresh from the server in the background.
  const sess = session.get(), cached = sess && sess.user ? cachedBoot(sess.user.username) : null;
  if (cached) {
    useCachedBoot(cached);
    renderShell(); route();
    loadBoot().then(() => { $('#sideLinks') && updateNav(location.hash || '#/home'); warmUp(); }).catch(() => { /* auth handler shows sign-in if needed */ });
    return;
  }
  app.innerHTML = '<div class="login"><div class="box">' + skeleton(4) + '</div></div>';
  try { await loadBoot(); }
  catch (e) {
    if (e.code === 'AUTH' || e.code === 'MUST_CHANGE_PASSWORD') return;
    app.innerHTML = `<div class="login"><div class="box"><div class="note bad">${icon('circle-x')}<span>${esc(e.message)}</span></div><button class="btn primary" onclick="location.reload()">Try again</button></div></div>`;
    return;
  }
  renderShell();
  route();
  setTimeout(warmUp, 1500);
}

setAuthLostHandler((err) => {
  if (err.code === 'MUST_CHANGE_PASSWORD') changePasswordView(true);
  else loginView(err.message);
});
window.addEventListener('hashchange', route);
// Fresh data arrived for the page on screen: redraw, unless the user is typing or a dialog is open.
setStaleHandler(() => {
  const a = document.activeElement;
  if (document.querySelector('.scrim') || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
  route();
});
function warmUp() {
  prefetch([['staff.list', { status: 'All' }], ['companies.list'], ['devices.list'], ['punches.byDate', { date: state.boot.today }], ['unrecognised.list', { status: 'All' }], ['exceptions.list', { status: 'Open' }], ['dashboard']]);
}

// client-side idle sign-out (the server enforces it too)
let lastActive = Date.now();
['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
setInterval(() => { if (state.boot && Date.now() - lastActive > 30 * 60000) { session.clear(); state.boot = null; loginView('Signed out after 30 idle minutes.'); } }, 60000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

const s = session.get();
if (!s) loginView(); else if (s.user && s.user.mustChange) changePasswordView(true); else start();
