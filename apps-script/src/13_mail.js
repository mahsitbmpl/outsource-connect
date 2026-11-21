/* ===== 13 Emails: morning and evening reports, tablet alerts, monthly summary, draft-ready, job failures ===== */
SCHEMA.EmailLog = { log: true, cols: [['at', 'datetime'], ['kind', 'str'], ['to', 'str'], ['subject', 'str'], ['status', 'str'], ['detail', 'str']] };
DEFAULT_SETTINGS.consoleUrl = ['', 'str', 'Console web address (GitHub Pages link) used for buttons in emails'];
DEFAULT_SETTINGS.emailAlertTo = ['', 'list', 'Tablet and system alerts go to these emails (blank = Email TO list)'];
DEFAULT_SETTINGS.emailMonthlyEnabled = ['true', 'bool', 'Send the monthly summary when every department of a month is locked'];
DEFAULT_SETTINGS.tabletAlertsEnabled = ['true', 'bool', 'Email when the tablet is silent, low on battery, camera fails or punches are stuck'];
DEFAULT_SETTINGS.tabletQueueAlert = ['20', 'int', 'Alert when this many punches are waiting on the tablet'];

var Mailer = (function () {
  var C = { teal: '#0B6B66', soft: '#E2F2F0', ink: '#0F1E1D', muted: '#66746F', line: '#DEE6E4', bad: '#B3261E', badSoft: '#FCEBEA', warn: '#9A5B00', warnSoft: '#FFF3D6', ok: '#157A3C', okSoft: '#E6F4EA' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '&#8377;&nbsp;' + OSCBill.inr(n); }
  function num(n, d) { return OSCBill.inr(n, d == null ? 2 : d); }
  function link(hash, label) { var u = Settings.str('consoleUrl'); return u ? '<a href="' + esc(u.replace(/\/?$/, '/') + hash) + '" style="display:inline-block;background:' + C.teal + ';color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:600">' + esc(label) + '</a>' : ''; }
  function layout(title, sub, body) {
    return '<div style="background:#F3F6F5;padding:16px 8px;font-family:Segoe UI,Roboto,Arial,sans-serif;color:' + C.ink + '">' +
      '<div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid ' + C.line + ';border-radius:12px;overflow:hidden">' +
      '<div style="background:' + C.teal + ';color:#fff;padding:16px 20px"><div style="font-size:12px;opacity:.85">OutSource Connect · ' + esc(Settings.str('orgName')) + '</div>' +
      '<div style="font-size:20px;font-weight:700;margin-top:2px">' + esc(title) + '</div>' + (sub ? '<div style="font-size:13px;opacity:.9;margin-top:2px">' + esc(sub) + '</div>' : '') + '</div>' +
      '<div style="padding:18px 20px">' + body + '</div>' +
      '<div style="padding:12px 20px;border-top:1px solid ' + C.line + ';font-size:11px;color:' + C.muted + '">' + esc(Settings.str('footerText')) + ' · ' + esc(APP.name + ' ' + APP.version) + ' · sent ' + esc(OSC.fmtDateTime(Clock.now())) + '</div>' +
      '</div></div>';
  }
  function h2(t) { return '<div style="font-size:15px;font-weight:700;color:' + C.teal + ';margin:18px 0 8px;border-bottom:2px solid ' + C.soft + ';padding-bottom:4px">' + esc(t) + '</div>'; }
  function table(head, rows, align) {
    align = align || [];
    var th = head.map(function (h, i) { return '<th style="text-align:' + (align[i] || 'left') + ';padding:6px 8px;background:' + C.soft + ';font-size:12px;border-bottom:1px solid ' + C.line + '">' + esc(h) + '</th>'; }).join('');
    var tr = rows.map(function (r) {
      return '<tr>' + r.map(function (c, i) {
        var o = c && typeof c === 'object' ? c : { t: c }, st = 'padding:6px 8px;font-size:13px;border-bottom:1px solid ' + C.line + ';text-align:' + (align[i] || 'left') + (o.b ? ';font-weight:700' : '') + (o.color ? ';color:' + o.color : '') + (o.bg ? ';background:' + o.bg : '');
        return '<td style="' + st + '">' + (o.html != null ? o.html : esc(o.t)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%">' + '<tr>' + th + '</tr>' + (tr || '<tr><td colspan="' + head.length + '" style="padding:8px;color:' + C.muted + ';font-size:13px">None</td></tr>') + '</table>';
  }
  function kpis(list) {
    return '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:6px 0"><tr>' + list.map(function (k) {
      var bg = k.tone === 'bad' ? C.badSoft : k.tone === 'warn' ? C.warnSoft : k.tone === 'ok' ? C.okSoft : C.soft, fg = k.tone === 'bad' ? C.bad : k.tone === 'warn' ? C.warn : k.tone === 'ok' ? C.ok : C.teal;
      return '<td style="background:' + bg + ';border-radius:10px;padding:10px 12px;vertical-align:top"><div style="font-size:11px;color:' + C.muted + '">' + esc(k.label) + '</div><div style="font-size:22px;font-weight:700;color:' + fg + '">' + esc(k.value) + '</div>' + (k.sub ? '<div style="font-size:11px;color:' + C.muted + '">' + esc(k.sub) + '</div>' : '') + '</td>';
    }).join('') + '</tr></table>';
  }
  function note(text, tone) { var bg = tone === 'bad' ? C.badSoft : tone === 'ok' ? C.okSoft : C.warnSoft, fg = tone === 'bad' ? C.bad : tone === 'ok' ? C.ok : C.warn; return '<div style="background:' + bg + ';color:' + fg + ';border-radius:8px;padding:9px 12px;font-size:13px;margin:8px 0">' + text + '</div>'; }
  var TYPE = { MISSING_OUT: 'Missing OUT', MISSING_IN: 'Missing IN', LATE_GRACE: 'Late arrival', LONG_DUTY: 'Over 12 h', SHORT_DUTY: 'Short duty', UNRECOGNISED: 'Unrecognised face' };

  // ---------- sending ----------
  function recipients(kind) {
    var alerts = ['TABLET', 'JOB_FAILED'].indexOf(kind) >= 0;
    var to = alerts && Settings.list('emailAlertTo').length ? Settings.list('emailAlertTo') : Settings.list('emailTo');
    return { to: to, cc: alerts ? [] : Settings.list('emailCc'), bcc: alerts ? [] : Settings.list('emailBcc') };
  }
  function send(kind, mail, override) {
    var r = override || recipients(kind), log = { at: Clock.now(), kind: kind, to: r.to.join(','), subject: clip(mail.subject, 200), status: 'SENT', detail: '' };
    if (!r.to.length) { log.status = 'SKIPPED'; log.detail = 'No email addresses in Settings (Email TO list)'; Db.append('EmailLog', log); return log; }
    try {
      var need = r.to.length + r.cc.length + r.bcc.length, left = MailApp.getRemainingDailyQuota();
      if (left < need) { log.status = 'FAILED'; log.detail = 'Daily email limit reached (' + left + ' left)'; Db.append('EmailLog', log); return log; }
      var o = { to: r.to.join(','), subject: mail.subject, htmlBody: mail.html, body: mail.text || stripHtml(mail.html), name: APP.name };
      if (r.cc.length) o.cc = r.cc.join(','); if (r.bcc.length) o.bcc = r.bcc.join(',');
      if (mail.attachments && mail.attachments.length) o.attachments = mail.attachments;
      MailApp.sendEmail(o);
      log.detail = mail.attachments && mail.attachments.length ? mail.attachments.length + ' attachment(s)' : '';
    } catch (e) { log.status = 'FAILED'; log.detail = clip(String(e && e.message || e), 300); }
    Db.append('EmailLog', log);
    return log;
  }
  function stripHtml(h) { return String(h).replace(/<br\s*\/?>/g, '\n').replace(/<\/(tr|div|p|h\d)>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&#8377;/g, 'Rs.').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim(); }

  // ---------- content ----------
  function dayStats(date) {
    var L = DutyEngine.list(date, date, {}), depts = Departments.list().filter(function (d) { return d.active; });
    return depts.map(function (dp) {
      var day = {}, night = {}, billable = 0, dd = 0, pending = 0;
      L.duties.forEach(function (d) { if (d.deptCode !== dp.code) return; if (d.shift === 'Night') night[d.staffId] = 1; else day[d.staffId] = 1; });
      L.days.forEach(function (x) { if (x.deptCode !== dp.code) return; billable += x.billable; dd += x.dd; pending += x.pending; });
      var nd = Object.keys(day).length, nn = Object.keys(night).length;
      return { code: dp.code, name: dp.name, day: nd, night: nn, reqDay: dp.reqDay, reqNight: dp.reqNight, shortDay: Math.max(0, dp.reqDay - nd), shortNight: Math.max(0, dp.reqNight - nn), duties: billable / 12, dd: OSCRules.r2(dd), pending: OSCRules.r2(pending) };
    });
  }
  function attention(dash, limit) {
    var exc = DutyEngine.exceptions('Open').slice(0, limit || 12);
    return h2('Needs attention (' + dash.attentionTotal + ')') +
      (dash.attentionTotal ? '<div style="font-size:13px;margin-bottom:6px">' + Object.keys(dash.attention).filter(function (k) { return dash.attention[k]; }).map(function (k) { return esc(TYPE[k] || k) + ': <b>' + dash.attention[k] + '</b>'; }).join(' · ') + '</div>' : '') +
      table(['Date', 'Staff', 'Item', 'Details'], exc.map(function (x) { return [OSC.fmtDate(x.dutyDate), x.name, { t: TYPE[x.type] || x.type, color: x.severity === 'red' ? C.bad : C.warn, b: true }, x.summary]; }));
  }
  function tabletsBlock(dash) {
    return h2('Tablet') + table(['Tablet', 'Last seen', 'Battery', 'Waiting punches', 'Camera'], dash.tablets.map(function (t) {
      return [t.name + ' (' + t.deviceId + ')', { t: t.lastSeenAt ? OSC.fmtDateTime(t.lastSeenAt) + (t.online ? '' : ' (silent)') : 'never', color: t.online ? C.ok : C.bad, b: !t.online },
        t.battery == null ? '-' : t.battery + '%' + (t.charging ? ' charging' : ''), t.queueSize || 0, t.cameraOk === false ? { t: 'Problem', color: C.bad, b: true } : 'OK'];
    }), ['left', 'left', 'right', 'right', 'left']);
  }

  function composeMorning() {
    var today = Clock.today(), y = OSC.addDays(today, -1), dash = Dashboard.build(), st = dayStats(y);
    var tot = st.reduce(function (a, d) { a.day += d.day; a.night += d.night; a.req += d.reqDay + d.reqNight; a.duties += d.duties; a.dd += d.dd; a.pending += d.pending; return a; }, { day: 0, night: 0, req: 0, duties: 0, dd: 0, pending: 0 });
    var short = st.reduce(function (a, d) { return a + d.shortDay + d.shortNight; }, 0);
    var body = '<div style="font-size:14px;margin-bottom:10px">Good morning. Here is ' + esc(OSC.fmtDate(y)) + ' and the position right now.</div>' +
      kpis([{ label: 'Yesterday · people (Day + Night)', value: (tot.day + tot.night) + ' / ' + tot.req, sub: short ? short + ' short of required' : 'Full strength', tone: short ? 'warn' : 'ok' },
        { label: 'Yesterday · duties', value: num(tot.duties, 2), sub: tot.dd ? num(tot.dd) + ' h double duty' : 'No double duty' },
        { label: 'On duty now', value: dash.onDuty + ' / ' + dash.required, sub: dash.shiftNow + ' shift', tone: dash.onDuty < dash.required ? 'warn' : 'ok' },
        { label: 'Needs attention', value: String(dash.attentionTotal), tone: dash.attentionTotal ? 'bad' : 'ok' }]) +
      h2('Yesterday by department') +
      table(['Department', 'Day', 'Night', 'Duties', 'Double h', 'Waiting approval h'], st.map(function (d) {
        return [d.name + ' (' + d.code + ')', { t: d.day + ' / ' + d.reqDay, color: d.shortDay ? C.bad : C.ink, b: !!d.shortDay }, { t: d.night + ' / ' + d.reqNight, color: d.shortNight ? C.bad : C.ink, b: !!d.shortNight }, num(d.duties), num(d.dd), num(d.pending)];
      }), ['left', 'right', 'right', 'right', 'right', 'right']) +
      attention(dash, 12) +
      h2('Open duties now') + table(['Staff', 'Dept', 'IN', 'Hours'], dash.open.slice(0, 15).map(function (o) { return [o.name, o.deptCode, OSC.fmtDateTime(o.inAt), { t: num(o.hours), color: o.flag === 'red' ? C.bad : o.flag === 'amber' ? C.warn : C.ink, b: o.flag !== 'ok' && !!o.flag }]; }), ['left', 'left', 'left', 'right']) +
      tabletsBlock(dash) +
      h2('Month so far (' + OSC.fmtMonth(today.slice(0, 7)) + ')') +
      '<div style="font-size:13px">Estimated bill with GST: <b>' + rs(dash.month.estimateNet) + '</b> · penalties ' + rs(dash.month.penalties) + ' · deductions ' + num(dash.month.deductionHours) + ' h · waiting approval ' + num(dash.month.pendingHours) + ' h</div>' +
      '<div style="margin-top:16px">' + link('#/exceptions', 'Open Exceptions') + '</div>';
    return { subject: 'Morning report · ' + OSC.fmtDate(y) + (dash.attentionTotal ? ' · ' + dash.attentionTotal + ' need attention' : ''), html: layout('Morning report', OSC.fmtDate(today), body) };
  }
  function composeEvening() {
    var today = Clock.today(), dash = Dashboard.build(), st = dayStats(today);
    var unrec = Db.where('UnrecognisedFaces', function (u) { return u.status === 'Open' && String(u.at).slice(0, 10) === today; }).length;
    var body = '<div style="font-size:14px;margin-bottom:10px">Position at ' + esc(OSC.fmtDateTime(Clock.now())) + ', before the night shift.</div>' +
      kpis([{ label: 'On duty now', value: dash.onDuty + ' / ' + dash.required, sub: dash.shiftNow + ' shift', tone: dash.onDuty < dash.required ? 'warn' : 'ok' },
        { label: 'Day shift today', value: String(dash.dayToday) }, { label: 'Needs attention', value: String(dash.attentionTotal), tone: dash.attentionTotal ? 'bad' : 'ok' },
        { label: 'Unrecognised faces today', value: String(unrec), tone: unrec ? 'warn' : 'ok' }]) +
      h2('Departments now') + table(['Department', 'On duty', 'Required now', 'Short', 'Day shift today'], dash.depts.map(function (d) {
        return [d.name + ' (' + d.code + ')', d.onDuty, d.required, { t: d.shortage, color: d.shortage ? C.bad : C.ok, b: true }, d.dayCount];
      }), ['left', 'right', 'right', 'right', 'right']) +
      attention(dash, 10) + tabletsBlock(dash) +
      '<div style="margin-top:16px">' + link('#/home', 'Open dashboard') + '</div>';
    void st;
    return { subject: 'Evening report · ' + OSC.fmtDate(today) + ' · ' + dash.onDuty + ' on duty', html: layout('Evening report', OSC.fmtDate(today), body) };
  }
  function composeTablet(dev, problems, recovered) {
    var body = recovered
      ? note('<b>' + esc(dev.name) + '</b> is working normally again.', 'ok')
      : note('<b>' + esc(dev.name) + ' (' + esc(dev.deviceId) + ')</b> needs attention:<br>' + problems.map(function (p) { return '• ' + esc(p); }).join('<br>'), 'bad') +
        '<div style="font-size:13px;margin-top:10px">What to check: the tablet is on its stand and plugged in; Wi-Fi is connected; the OutSource Connect kiosk screen is open. If the screen is frozen, hold the power button and restart; the app opens by itself (see the tablet guide).</div>';
    body += '<div style="font-size:12px;color:' + C.muted + ';margin-top:10px">Last seen: ' + esc(dev.lastSeenAt ? OSC.fmtDateTime(dev.lastSeenAt) : 'never') + ' · battery ' + esc(dev.battery == null ? '-' : dev.battery + '%') + (dev.charging ? ' (charging)' : '') + ' · waiting punches ' + esc(dev.queueSize || 0) + '</div>';
    return { subject: (recovered ? 'Tablet OK: ' : 'Tablet alert: ') + dev.name + (recovered ? ' is back' : ' · ' + problems[0]), html: layout(recovered ? 'Tablet back to normal' : 'Tablet alert', dev.name, body) };
  }
  function composeMonthly(ym) {
    var bills = Db.where('Bills', function (b) { return b.month === ym && b.status === 'Final'; }), prevYm = OSCBill.prevMonth(ym);
    var prev = {}; Db.where('Bills', function (b) { return b.month === prevYm && b.status === 'Final'; }).forEach(function (b) { prev[b.deptCode] = (prev[b.deptCode] || 0) + b.payable; });
    var cos = {}; Db.all('Companies').forEach(function (c) { cos[c.companyId] = c.name; });
    var depts = {}; Departments.list().forEach(function (d) { depts[d.code] = d.name; });
    var total = bills.reduce(function (a, b) { a.payable += b.payable; a.duties += b.duties; a.pen += b.penalties; a.gst += b.gst; return a; }, { payable: 0, duties: 0, pen: 0, gst: 0 });
    var prevTotal = Object.keys(prev).reduce(function (a, k) { return a + prev[k]; }, 0);
    var change = prevTotal ? (total.payable - prevTotal) / prevTotal * 100 : null;
    var attachments = [], links = [];
    bills.forEach(function (b) {
      try { if (b.pdfFileId) attachments.push(DriveApp.getFileById(b.pdfFileId).getBlob()); } catch (e) { /* file missing */ }
      try { if (b.xlsxFileId) { var f = DriveApp.getFileById(b.xlsxFileId); links.push('<a href="' + esc(f.getUrl()) + '">' + esc(f.getName()) + '</a>'); } } catch (e) { /* file missing */ }
    });
    var body = '<div style="font-size:14px;margin-bottom:10px">All departments are locked for <b>' + esc(OSC.fmtMonth(ym)) + '</b>. Final bills are attached as PDF.</div>' +
      kpis([{ label: 'Net payable (all bills)', value: '₹ ' + OSCBill.inr(total.payable, 0) }, { label: 'Duties billed', value: num(total.duties, 2) },
        { label: 'Penalties', value: '₹ ' + OSCBill.inr(total.pen, 0) }, { label: 'vs ' + OSC.fmtMonth(prevYm), value: change == null ? '-' : (change >= 0 ? '+' : '') + change.toFixed(1) + '%', tone: change == null ? '' : change > 5 ? 'warn' : 'ok' }]) +
      h2('Bills') + table(['Department', 'Company', 'Bill No', 'Duties', 'Hours', 'Deduction h', 'Penalties', 'GST', 'Net payable'], bills.map(function (b) {
        return [depts[b.deptCode] || b.deptCode, cos[b.companyId] || b.companyId, b.billNo, num(b.duties, 3), num(b.hours), num(b.deductionHours), { html: rs(b.penalties) }, { html: rs(b.gst) }, { html: rs(b.payable), b: true }];
      }), ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right']) +
      h2('Compared with ' + OSC.fmtMonth(prevYm)) + table(['Department', OSC.fmtMonth(prevYm), OSC.fmtMonth(ym), 'Change'], Object.keys(depts).filter(function (k) { return prev[k] || bills.some(function (b) { return b.deptCode === k; }); }).map(function (k) {
        var now = bills.filter(function (b) { return b.deptCode === k; }).reduce(function (a, b) { return a + b.payable; }, 0), p = prev[k] || 0;
        return [depts[k], { html: p ? rs(p) : '-' }, { html: rs(now) }, p ? ((now - p) / p * 100 >= 0 ? '+' : '') + ((now - p) / p * 100).toFixed(1) + '%' : '-'];
      }), ['left', 'right', 'right', 'right']) +
      (links.length ? h2('Excel packs (Google Drive)') + '<div style="font-size:13px;line-height:1.7">' + links.join('<br>') + '</div>' : '') +
      '<div style="margin-top:16px">' + link('#/month', 'Open Month-end pack') + '</div>';
    return { subject: 'Monthly summary · ' + OSC.fmtMonth(ym) + ' · net payable ₹ ' + OSCBill.inr(total.payable, 0), html: layout('Monthly summary', OSC.fmtMonth(ym), body), attachments: attachments };
  }
  function composeDraft(ym, items) {
    var blocked = items.filter(function (i) { return i.blockers.length; });
    var body = '<div style="font-size:14px;margin-bottom:10px">Draft month-end packs for <b>' + esc(OSC.fmtMonth(ym)) + '</b> are ready (draft PDFs attached, Excel in Google Drive).</div>' +
      (blocked.length ? note('<b>Before locking</b>, clear these on the Exceptions page:<br>' + blocked.map(function (i) { return '• ' + esc(i.deptName + ' · ' + i.companyName) + ': ' + i.blockers.map(esc).join('; '); }).join('<br>'), 'warn') : note('No open items. The month can be locked.', 'ok')) +
      table(['Department', 'Company', 'Duties', 'Draft net payable', 'Status'], items.map(function (i) {
        return [i.deptName, i.companyName, num(i.duties, 3), { html: rs(i.payable), b: true }, i.blockers.length ? { t: i.blockers.length + ' open', color: C.warn, b: true } : { t: 'Ready', color: C.ok, b: true }];
      }), ['left', 'left', 'right', 'right', 'left']) +
      '<div style="margin-top:16px">' + link('#/month', 'Open Month-end pack') + '</div>';
    return { subject: 'Draft month-end pack · ' + OSC.fmtMonth(ym) + (blocked.length ? ' · ' + blocked.length + ' need attention' : ' · ready to lock'), html: layout('Draft month-end pack', OSC.fmtMonth(ym), body), attachments: items.map(function (i) { return i.pdf; }) };
  }
  function composeJobFailed(job, err) {
    return { subject: 'OutSource Connect: automatic job failed · ' + job, html: layout('Automatic job failed', job, note('<b>' + esc(job) + '</b> failed at ' + esc(OSC.fmtDateTime(Clock.now())) + ':<br>' + esc(err), 'bad') + '<div style="font-size:13px">It will be tried again at its next time. If it repeats, open Admin → Automation & emails, or tell IT.</div>') };
  }

  return {
    send: send, esc: esc, layout: layout,
    morning: function () { return send('MORNING', composeMorning()); },
    evening: function () { return send('EVENING', composeEvening()); },
    tablet: function (dev, problems, recovered) { return send('TABLET', composeTablet(dev, problems, recovered)); },
    monthlySummary: function (ym) { if (!Settings.bool('emailMonthlyEnabled')) return { status: 'SKIPPED', detail: 'Monthly summary switched off in Settings' }; return send('MONTHLY', composeMonthly(ym)); },
    draftReady: function (ym, items) { return send('DRAFT', composeDraft(ym, items)); },
    jobFailed: function (job, err) { return send('JOB_FAILED', composeJobFailed(job, err)); },
    test: function (user) {
      return send('TEST', { subject: 'OutSource Connect test email', html: layout('Test email', '', '<div style="font-size:14px">Emails from OutSource Connect reach this address. Sent by ' + esc(user.fullName || user.username) + '.</div>') });
    },
    preview: function (kind, month) {
      if (kind === 'morning') return composeMorning();
      if (kind === 'evening') return composeEvening();
      if (kind === 'monthly') { var c = composeMonthly(month || OSCBill.prevMonth(Clock.today().slice(0, 7))); c.attachments = (c.attachments || []).length; return c; }
      if (kind === 'tablet') return composeTablet({ name: 'Lobby tablet', deviceId: 'TAB1', lastSeenAt: OSC.nowISTString(Clock.nowMs() - 40 * 60000), battery: 14, charging: false, queueSize: 3 }, ['Silent for 40 minutes', 'Battery 14% and not charging'], false);
      fail('VALIDATION', 'Unknown email type');
    }
  };
})();

ROUTES['email.test'] = ['ADMIN', function (u) { return Mailer.test(u); }];
ROUTES['email.preview'] = ['ADMIN', function (u, d) { var p = Mailer.preview(d.kind, d.month); return { subject: p.subject, html: p.html, attachments: typeof p.attachments === 'number' ? p.attachments : (p.attachments || []).length }; }];
ROUTES['email.log'] = ['ADMIN', function (u, d) { return Db.tail('EmailLog', Math.min(200, Number(d.limit) || 100)); }];
