# OutSource Connect

Zero-cost face-punch attendance and billing for the outsourced staff (Housekeeping, Support Services, Security) of Marengo Asia Hospital, Surat.

- **Server:** Google Apps Script web app + Google Sheets (data) + Google Drive (photos, backups, packs).
- **Console:** static web app on GitHub Pages (`console/`), for the Admin and Ops managers on PC and phone.
- **Kiosk:** tablet web app with on-device face recognition (`kiosk/`), works offline.
- No paid services, no AI at runtime, no real staff data in this repository.

Designed and developed by IT Department, Marengo Asia Hospital, Surat.

## Status
All 6 build phases done (version 6.1.0; see docs/UPDATE_6.1.md for the latest changes): data and sign-in, tablet kiosk, rules engine, dashboard and exceptions,
month-end pack and bills, emails and automation, and go-live hardening (tamper check, system health, archive, restore, parallel-run check).
Next: deploy 6.0.0, restore drill, one-month parallel run, then go live (`docs/GO_LIVE_CHECKLIST.md`).

**Documents:**

| Document | Contents |
|---|---|
| `docs/OPS_MANAGER_MANUAL.md` | Manual and SOP for the Ops manager |
| `docs/ADMIN_GUIDE.md` | Running the system, rule changes, backup and restore, troubleshooting |
| `docs/PARALLEL_RUN.md` | One-month parallel run plan |
| `docs/GO_LIVE_CHECKLIST.md` | Go-live checklist |
| `docs/SECURITY_REVIEW.md` | Security review |
| `docs/LOAD_TEST_REPORT.md` | Load test results |
| `docs/print/` | Printable PDFs of the manual, guide, parallel-run plan and checklist |

See `PROJECT_CONTEXT.md` for decisions, rules, the data model and the change log.

## Folders
| Folder | What it is |
|---|---|
| `apps-script/src/` | Server source, split by topic. |
| `apps-script/dist/Code.gs` | **The file you paste into Apps Script** (built from `shared/` + `apps-script/src/`). |
| `shared/osc-core.js` | Validation and Indian formatting used by the server, console and tablet. |
| `shared/rules.js` | The attendance rules engine (hours, split, pairing), one file for server, console and tablet. |
| `shared/rule-cases.js` | The 52 rule test cases, run by the tests and shown in the console's Rule test report. |
| `shared/billing.js` | Month bill model: hours, duties, amounts, GST after penalties, round off, amount in words, what-if. |
| `shared/pack.js`, `xlsx.js`, `pdf.js` | Excel pack (Bill Details, Summary Sheet, 8/4 Hours, Double Duty) and bill PDF, written in plain JavaScript (no add-ons). |
| `console/` | The console website. Only `console/config.js` needs your Web app URL. |
| `kiosk/` | The tablet app. Only `kiosk/config.js` needs your Web app URL. The tablet's secret is typed on the tablet, never stored here. |
| `docs/` | Deployment guide and checklists. |
| `tests/` | Automated tests. They run the real `Code.gs` against an in-memory imitation of Google services. |
| `tools/` | Build script and a local test server. |

## For developers
Requires Node.js 18 or later.
```
npm test                      # builds Code.gs and runs all tests
node tools/dev-server.js --demo [--punches] [--month]   # local console and kiosk at http://localhost:8787 on a simulated backend
sh tools/run-browser-tests.sh   # all browser tests (Playwright + Chrome), each on a fresh test server
node tools/load-test.js docs/LOAD_TEST_REPORT.md   # 100 staff x 3 years load test (about 15 s)
```
Rule: run `npm test` before every change, and record each change in `PROJECT_CONTEXT.md`.

## Third-party components
- Inter font (SIL Open Font License 1.1), `console/fonts/`
- Lucide icons 0.460.0 (ISC licence), inlined in `console/js/ui.js`
- read-excel-file 5.8.6 (MIT), `console/vendor/`
- @vladmandic/face-api 1.7.15 with bundled TensorFlow.js (MIT), `kiosk/vendor/`, and its pre-trained models (tiny face detector, 68-point landmarks, face recognition), `kiosk/models/`
- Noto Sans Devanagari (SIL Open Font License 1.1), `kiosk/fonts/`
