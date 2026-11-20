/* ===== 07 API: web app entry points and router ===== */
/*
 * The console calls: POST <web app URL> with body text JSON {action, token, data}
 * (Content-Type text/plain avoids a CORS preflight, which Apps Script cannot answer).
 * Every reply is JSON: {ok:true, data, serverTime} or {ok:false, error:{code, message, fields}, serverTime}.
 */
var ROUTES = {
  // action: [roles allowed ('*' = no sign-in needed), handler(user, data)]
  'ping': ['*', function () { return { app: APP.name, version: APP.version }; }],
  'auth.login': ['*', function (u, d) { return Auth.login(d.username, d.password, d.userAgent); }],
  'auth.me': ['ANY', function (u) { return { user: { username: u.username, fullName: u.fullName, role: u.role, mustChange: u.mustChange } }; }],
  'auth.logout': ['ANY', function (u) { return Auth.logout(u); }],
  'auth.changePassword': ['ANY', function (u, d) { return Auth.changePassword(u, d.oldPassword, d.newPassword); }],

  'meta.bootstrap': ['APP', function (u) {
    return {
      user: { username: u.username, fullName: u.fullName, role: u.role },
      app: { name: APP.name, version: APP.version, footer: Settings.str('footerText'), orgName: Settings.str('orgName') },
      titles: Settings.list('titles'), designations: Settings.list('designations'),
      departments: Departments.list(), companies: Companies.list(), today: Clock.today(),
      summary: { staff: Staff.stats(), departments: Departments.list(), companies: Companies.list().length }
    };
  }],
  'home.summary': ['APP', function () {
    return { staff: Staff.stats(), departments: Departments.list(), companies: Companies.list().length };
  }],

  'staff.list': ['APP', function (u, d) { return Staff.list(d); }],
  'staff.get': ['APP', function (u, d) { return Staff.get(d.staffId); }],
  'staff.create': ['APP', function (u, d) { return Staff.create(u, d); }],
  'staff.update': ['APP', function (u, d) { return Staff.update(u, d.staffId, d, d.reason); }],
  'staff.transfer': ['APP', function (u, d) { return Staff.transfer(u, d.staffId, d); }],
  'staff.exit': ['APP', function (u, d) { return Staff.exit(u, d.staffId, d); }],
  'staff.reactivate': ['APP', function (u, d) { return Staff.reactivate(u, d.staffId, d); }],
  'staff.import': ['APP', function (u, d) { return Staff.importRows(u, d.rows, !!d.commit); }],

  'companies.list': ['APP', function () { return Companies.list(); }],
  'companies.get': ['APP', function (u, d) { var c = Companies.get(d.companyId); if (!c) fail('NOT_FOUND', 'Company not found'); c.rates = Rates.list(c.companyId); return c; }],
  'companies.save': ['APP', function (u, d) { return Companies.save(u, d, d.reason); }],
  'rates.add': ['APP', function (u, d) { return Rates.add(u, d); }],
  'rates.void': ['APP', function (u, d) { return Rates.voidRate(u, d.rateId, d.reason); }],

  'departments.list': ['APP', function () { return Departments.list(); }],
  'departments.save': ['ADMIN', function (u, d) { return Departments.save(u, d, d.reason); }],

  'users.list': ['ADMIN', function () { return Auth.listUsers(); }],
  'users.create': ['ADMIN', function (u, d) { return Auth.createUser(u, d); }],
  'users.setActive': ['ADMIN', function (u, d) { return Auth.setActive(u, d.username, !!d.active, d.reason); }],
  'users.resetPassword': ['ADMIN', function (u, d) { return Auth.resetPassword(u, d.username, d.reason); }],
  'users.loginLog': ['ADMIN', function (u, d) { return Auth.loginLog(d.limit); }],

  'settings.list': ['ADMIN', function () { return Settings.allForUi(); }],
  'settings.update': ['ADMIN', function (u, d) { return Settings.update(u, d.key, d.value, requireReason(d.reason)); }],

  'audit.recent': ['APP', function (u, d) { return Audit.recent(d.limit, d); }]
};

function handle(body) {
  var req;
  try { req = JSON.parse(body || '{}'); } catch (e) { fail('BAD_REQUEST', 'Request is not valid JSON'); }
  if (!req || typeof req.action !== 'string') fail('BAD_REQUEST', 'Missing action');
  var route = ROUTES[req.action];
  if (!route) fail('BAD_REQUEST', 'Unknown action ' + req.action);
  var data = req.data && typeof req.data === 'object' ? req.data : {};
  if (route[0] === '*') return route[1](null, data);
  if (route[0] === 'DEVICE') { var dev = Devices.verify(req); return route[1](dev, Devices.payload(req)); }
  var user = Auth.check(req.token);
  // A user with a temporary password may only change it or sign out.
  if (user.mustChange && ['auth.changePassword', 'auth.logout', 'auth.me'].indexOf(req.action) < 0)
    fail('MUST_CHANGE_PASSWORD', 'Please set a new password first');
  if (route[0] === 'ADMIN' && user.role !== APP.roles.ADMIN) fail('FORBIDDEN', 'Only the Admin can do this');
  if (route[0] === 'APP' && [APP.roles.ADMIN, APP.roles.OPS].indexOf(user.role) < 0) fail('FORBIDDEN', 'Not allowed');
  return route[1](user, data);
}

function respond(obj) {
  obj.serverTime = Clock.now();
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function apiCall(body) {
  try {
    return { ok: true, data: handle(body) };
  } catch (e) {
    if (e && e.name === 'AppError') return { ok: false, error: { code: e.code, message: e.message, fields: e.fields } };
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong on the server. Please try again; if it repeats, tell the Admin.' } };
  }
}

function doPost(e) {
  var t0 = Date.now();
  var out = apiCall(e && e.postData ? e.postData.contents : '');
  out.ms = Date.now() - t0; // time our code used; the rest of the wait is Google starting the script
  return respond(out);
}
function doGet() { return respond({ ok: true, data: { app: APP.name, version: APP.version, status: 'running' } }); }
