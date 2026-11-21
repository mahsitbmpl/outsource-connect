# Security review (Phase 6, version 6.0.0)

**Scope:** server (`apps-script/src`, `shared`), console, kiosk, Google Sheet and Drive set-up, and the deployment.
**Method:** a code read of every entry point and every place data is written or shown, automated tests for each fix (`tests/hardening.test.js`), and a load test (`LOAD_TEST_REPORT.md`).

## 1. What protects the system

| Area | Control |
|---|---|
| Sign-in | PBKDF2-HMAC-SHA256 passwords (random salt, 2,000 rounds, rounds stored in each hash); a minimum of 10 characters with letters and numbers; the same message for an unknown user and a wrong password; lockout after 5 tries for 30 minutes; a login log. |
| Sessions | Random token, of which only its SHA-256 is stored; 8 hours absolute and 30 minutes idle; revoked at sign-out; old sessions removed nightly. |
| Roles | Every server action declares who may call it (Admin, Ops, tablet, or public for sign-in only). This is checked on the server, never in the browser. A temporary password allows only "change password". |
| Tablet | Each request is signed with HMAC-SHA256 (device ID, time, nonce, action, payload). The clock window is ±10 minutes and nonces are not accepted twice. The secret is only in Script properties and on the tablet, never in the website code. It can be revoked from the console. |
| Input | Every field is validated and has a length limit. Batches are limited (20 punches, 300 import rows); photos are limited to 400 KB, JPEG only. |
| Spreadsheet formulas | Text starting with `= + - @` is stored with a leading apostrophe, so it can never run as a formula in Sheets. CSV exports are guarded the same way. |
| Browser | Strict Content-Security-Policy (scripts only from the site itself). All server text is HTML-escaped before it is shown. Email previews use a sandboxed frame with no scripts. |
| Emails | All values are HTML-escaped. Links use the configured console address, which must be `https://`. |
| Audit | Every change records who, when, why, and before/after. The audit log is append-only. |
| Records | Tablet punches are never edited. Corrections are new rows (MANUAL) or decisions with a reason. Locked months cannot change. |

## 2. Findings and fixes in Phase 6

| # | Finding | Risk | Fix |
|---|---|---|---|
| 1 | Anyone with edit access to the Google Sheet could change a punch or an audit row by hand without trace. | Medium | **Tamper check:** every new punch and audit row carries a chained SHA-256 check code. A weekly job and the System health button report edited, removed or inserted rows, and an email is sent if anything is wrong. |
| 2 | The Sheet or the Drive folder (face photos, bills) could be shared with "Anyone with the link" by mistake. | High if it happened | System health checks the sharing of both, and shows **Act now** if it is open to anyone or has more than 3 editors. |
| 3 | The console address used in email buttons accepted any text (for example `javascript:`). | Low (Admin only) | It must now be a full `https://` address. |
| 4 | Nested locks: a change made inside a locked step could wait for its own lock. | Low (stability) | One script-wide lock helper; nested use in the same run is safe. |
| 5 | Resolving an exception older than about 5,000 rows could silently fail. | Low (correctness at scale) | Exceptions are looked up by date. |
| 6 | Size: new tabs carried 26 empty columns, and 3 past years of data would near Google's cell limit. | Medium (availability) | Empty columns are removed; old years and old log rows move to archive files each January (default: current year + 2 past years). |
| 7 | Restore: there was no safe way to put back a backup. | Medium (recovery) | Menu **7. Restore from a backup…**. It makes a safety copy first and needs `RESTORE` typed to confirm; the restore is audited. |

## 3. Accepted risks (known limits of a zero-cost design)

| Risk | Why accepted | Mitigation |
|---|---|---|
| Only 2,000 PBKDF2 rounds (modern guidance is far higher). | Google Apps Script runs JavaScript slowly; more rounds would make sign-in take seconds. Password hashes are never sent to browsers. | The Sheet is restricted to the owner; lockout after 5 tries; strong-password rules; 2-step verification on the owner's Google account. |
| The session token is kept in the browser's local storage. | Needed for a static website with no server-side cookies. | Strict CSP and escaping against script injection; idle and absolute time-outs; sign-out revokes the token. |
| The web app is reachable by anyone on the internet. | Required for the tablet and phones. | Every action except sign-in needs a session or a tablet signature; errors never show internal details. |
| The Google account owner can do anything. | They own the data. | 2-step verification; the tamper check detects hand edits; backups. |
| Face photos are personal data. | Needed as proof of attendance. | Drive folder restricted; photos are deleted after 180 days; face data is deleted 90 days after exit; no face data in the website code. |

## 4. Owner actions (do these before go-live)

1. Turn on **2-step verification** for the Google account that owns the Sheet, and for the GitHub account.
2. Keep the Sheet and the "OutSource Connect Data" folder **Restricted**. System health must show Good.
3. Give Admin rights to one person only (plus one backup). Use Ops manager accounts for daily work.
4. Do not install other Apps Script add-ons in this Sheet.
5. After any staff change in IT, change the Admin password and the Google account password.
