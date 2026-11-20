/* ===== 00 Config: app constants and sheet schema ===== */
var APP = {
  name: 'OutSource Connect',
  version: '4.0.0-phase4',
  tz: 'Asia/Kolkata',
  roles: { ADMIN: 'ADMIN', OPS: 'OPS' }
};

/*
 * Column types: str | date ('YYYY-MM-DD') | datetime (ISO with +05:30) | num | bool | json
 * key: primary key column. log: append-only table (never updated or deleted).
 * Tabs are created and extended by setup(); existing columns are never removed or reordered by code.
 */
var SCHEMA = {
  Settings: { key: 'key', cols: [['key', 'str'], ['value', 'str'], ['type', 'str'], ['description', 'str'], ['updatedAt', 'datetime'], ['updatedBy', 'str']] },
  Departments: { key: 'code', cols: [['code', 'str'], ['name', 'str'], ['active', 'bool'], ['nextSeq', 'num'], ['reqDay', 'num'], ['reqNight', 'num'], ['sortOrder', 'num'], ['updatedAt', 'datetime'], ['updatedBy', 'str']] },
  Companies: { key: 'companyId', cols: [['companyId', 'str'], ['code', 'str'], ['name', 'str'], ['deptCodes', 'str'], ['contractStart', 'date'], ['contractEnd', 'date'], ['status', 'str'], ['gstin', 'str'], ['pan', 'str'], ['address', 'str'], ['contactName', 'str'], ['contactMobile', 'str'], ['contactEmail', 'str'], ['notes', 'str'], ['createdAt', 'datetime'], ['createdBy', 'str'], ['updatedAt', 'datetime'], ['updatedBy', 'str']] },
  Rates: { key: 'rateId', cols: [['rateId', 'str'], ['companyId', 'str'], ['deptCode', 'str'], ['designation', 'str'], ['ratePerDuty', 'num'], ['gstPct', 'num'], ['effectiveFrom', 'date'], ['effectiveTo', 'date'], ['status', 'str'], ['note', 'str'], ['createdAt', 'datetime'], ['createdBy', 'str'], ['voidReason', 'str']] },
  Staff: { key: 'staffId', cols: [['staffId', 'str'], ['title', 'str'], ['fullName', 'str'], ['dob', 'date'], ['mobile', 'str'], ['deptCode', 'str'], ['designation', 'str'], ['companyId', 'str'], ['joinDate', 'date'], ['exitDate', 'date'], ['exitReason', 'str'], ['status', 'str'], ['faceStatus', 'str'], ['vendorCode', 'str'], ['createdAt', 'datetime'], ['createdBy', 'str'], ['updatedAt', 'datetime'], ['updatedBy', 'str']] },
  StaffHistory: { key: 'histId', cols: [['histId', 'str'], ['staffId', 'str'], ['field', 'str'], ['value', 'str'], ['effectiveFrom', 'date'], ['effectiveTo', 'date'], ['reason', 'str'], ['createdAt', 'datetime'], ['createdBy', 'str']] },
  Users: { key: 'username', cols: [['username', 'str'], ['fullName', 'str'], ['role', 'str'], ['active', 'bool'], ['pwHash', 'str'], ['mustChange', 'bool'], ['failedCount', 'num'], ['lockedUntil', 'datetime'], ['lastLoginAt', 'datetime'], ['pwChangedAt', 'datetime'], ['createdAt', 'datetime'], ['createdBy', 'str'], ['updatedAt', 'datetime'], ['updatedBy', 'str']] },
  Sessions: { key: 'sid', cols: [['sid', 'str'], ['username', 'str'], ['createdAt', 'datetime'], ['expiresAt', 'datetime'], ['lastSeenAt', 'datetime'], ['revoked', 'bool'], ['userAgent', 'str']] },
  LoginLog: { log: true, cols: [['at', 'datetime'], ['username', 'str'], ['result', 'str'], ['detail', 'str'], ['userAgent', 'str']] },
  AuditLog: { log: true, cols: [['auditId', 'str'], ['at', 'datetime'], ['username', 'str'], ['action', 'str'], ['entity', 'str'], ['entityId', 'str'], ['reason', 'str'], ['before', 'json'], ['after', 'json']] },
  MonthLocks: { key: 'lockId', cols: [['lockId', 'str'], ['month', 'str'], ['deptCode', 'str'], ['status', 'str'], ['lockedAt', 'datetime'], ['lockedBy', 'str'], ['unlockedAt', 'datetime'], ['unlockedBy', 'str'], ['unlockReason', 'str']] },
  // ----- Phase 2: tablet, faces, punches -----
  Devices: { key: 'deviceId', cols: [['deviceId', 'str'], ['name', 'str'], ['active', 'bool'], ['createdAt', 'datetime'], ['createdBy', 'str'], ['revokedAt', 'datetime'], ['revokedBy', 'str'], ['lastSeenAt', 'datetime'], ['appVersion', 'str'], ['battery', 'num'], ['charging', 'bool'], ['queueSize', 'num'], ['cameraOk', 'bool'], ['lastPunchAt', 'datetime'], ['backend', 'str'], ['userAgent', 'str']] },
  Heartbeats: { log: true, cols: [['at', 'datetime'], ['deviceId', 'str'], ['battery', 'num'], ['charging', 'bool'], ['queueSize', 'num'], ['cameraOk', 'bool'], ['appVersion', 'str'], ['note', 'str']] },
  EnrollRequests: { key: 'reqId', cols: [['reqId', 'str'], ['staffId', 'str'], ['mode', 'str'], ['status', 'str'], ['requestedBy', 'str'], ['requestedAt', 'datetime'], ['updatedAt', 'datetime'], ['deviceId', 'str'], ['message', 'str']] },
  FaceData: { key: 'faceId', cols: [['faceId', 'str'], ['staffId', 'str'], ['descriptors', 'json'], ['samples', 'num'], ['quality', 'json'], ['source', 'str'], ['status', 'str'], ['reqId', 'str'], ['createdAt', 'datetime'], ['activatedAt', 'datetime'], ['disabledAt', 'datetime'], ['note', 'str']] },
  FaceThumbs: { key: 'staffId', cols: [['staffId', 'str'], ['thumb', 'str'], ['updatedAt', 'datetime']] },
  StaffState: { key: 'staffId', cols: [['staffId', 'str'], ['lastPunchId', 'str'], ['lastType', 'str'], ['lastAt', 'datetime']] },
  UnrecognisedFaces: { key: 'unrecId', cols: [['unrecId', 'str'], ['at', 'datetime'], ['deviceId', 'str'], ['photoFileId', 'str'], ['bestStaffId', 'str'], ['bestDistance', 'num'], ['status', 'str'], ['resolvedBy', 'str'], ['resolvedAt', 'datetime'], ['note', 'str']] }
};

/* Default settings: key -> [value, type, description]. setup() adds missing keys only. */
var DEFAULT_SETTINGS = {
  orgName: ['Marengo Asia Hospital, Surat', 'str', 'Organisation name shown in emails and reports'],
  footerText: ['Designed and developed by IT Department, Marengo Asia Hospital, Surat', 'str', 'Footer on console pages'],
  titles: ['Mr.,Mrs.,Ms.,Miss,Dr.', 'list', 'Titles allowed for staff (comma separated)'],
  designations: ['Staff,Supervisor', 'list', 'Designations (comma separated)'],
  kioskLanguages: ['en,hi', 'list', 'Languages shown together on the tablet'],
  emailMorningTime: ['09:00', 'time', 'Morning email time (24-hour HH:MM, IST)'],
  emailEveningTime: ['17:30', 'time', 'Evening email time (24-hour HH:MM, IST)'],
  emailEveningEnabled: ['true', 'bool', 'Send the evening email'],
  emailTo: ['', 'list', 'Email TO list (comma separated)'],
  emailCc: ['', 'list', 'Email CC list (comma separated)'],
  emailBcc: ['', 'list', 'Email BCC list (comma separated)'],
  photoRetentionDays: ['180', 'int', 'Days to keep punch and unrecognised photos'],
  faceDeleteDaysAfterExit: ['90', 'int', 'Days after exit before face data is deleted'],
  sessionHours: ['8', 'int', 'Console session length in hours'],
  sessionIdleMinutes: ['30', 'int', 'Sign out after this many idle minutes'],
  lockoutAttempts: ['5', 'int', 'Wrong passwords before an account is locked'],
  lockoutMinutes: ['30', 'int', 'Minutes an account stays locked (Admin can unlock earlier)'],
  passwordMinLength: ['10', 'int', 'Minimum password length'],
  tabletSilentAlertMinutes: ['15', 'int', 'Alert when the tablet is silent this long'],
  tabletLowBatteryPct: ['20', 'int', 'Alert when battery is below this % and not charging'],
  kioskReloadTime: ['03:30', 'time', 'Daily quiet reload time on the tablet'],
  faceMatchThreshold: ['0.45', 'num', 'Face match strictness: lower = stricter (0.35 to 0.55)'],
  faceMatchMargin: ['0.06', 'num', 'Minimum gap between the best and second-best person'],
  livenessEnabled: ['true', 'bool', 'Ask for a blink or small head turn before punching'],
  duplicateWindowMin: ['3', 'int', 'Ignore a second punch by the same person within these minutes'],
  kioskNewInAfterHours: ['36', 'int', 'If the last IN is older than this, the next punch is a new IN (forgotten OUT)'],
  kioskMinFacePct: ['16', 'int', 'Face must be at least this % of the camera width (ignores people behind)']
};

var DEFAULT_DEPARTMENTS = [
  { code: 'HK', name: 'Housekeeping', reqDay: 14, reqNight: 6, sortOrder: 1 },
  { code: 'SS', name: 'Support Services', reqDay: 8, reqNight: 4, sortOrder: 2 },
  { code: 'SC', name: 'Security', reqDay: 6, reqNight: 4, sortOrder: 3 }
];

var PBKDF2_ITERATIONS = 2000; // stored inside each hash; older hashes are re-made with this value at the next sign-in (fast plain-JS hashing since v2.1)
var CACHED_TABLES = ['Settings', 'Departments', 'Companies', 'Rates', 'Staff', 'Users', 'MonthLocks', 'Devices'];

/* Punches live in one tab per year (Punches_2026, Punches_2027 ...). Rows are never edited or deleted. */
var PUNCH_COLS = [['punchId', 'str'], ['staffId', 'str'], ['type', 'str'], ['at', 'datetime'], ['deviceTime', 'datetime'], ['receivedAt', 'datetime'], ['deviceId', 'str'], ['distance', 'num'], ['liveness', 'str'], ['offline', 'bool'], ['status', 'str'], ['photoFileId', 'str'], ['note', 'str']];
function punchTable(year) {
  var n = 'Punches_' + year;
  if (!SCHEMA[n]) SCHEMA[n] = { key: 'punchId', log: true, cols: PUNCH_COLS };
  return n;
}
punchTable(new Date(Date.now() + 19800000).getUTCFullYear());
