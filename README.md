# OutSource Connect

Zero-cost face-punch attendance and billing for the outsourced staff (Housekeeping, Support Services, Security) of Marengo Asia Hospital, Surat.

- **Server:** Google Apps Script web app + Google Sheets (data) + Google Drive (photos, backups, packs).
- **Console:** static web app on GitHub Pages (`console/`), for the Admin and Ops managers on PC and phone.
- **Kiosk:** tablet web app with on-device face recognition (`kiosk/`, Phase 2).
- No paid services, no AI at runtime, no real staff data in this repository.

Designed and developed by IT Department, Marengo Asia Hospital, Surat.

## Status
Phase 1 of 6: data model, staff, departments, companies and rates, Admin and Ops manager sign-in, settings, audit log.
See `PROJECT_CONTEXT.md` for decisions, rules, the data model and the change log.

## Folders
| Folder | What it is |
|---|---|
| `apps-script/src/` | Server source, split by topic. |
| `apps-script/dist/Code.gs` | **The file you paste into Apps Script** (built from `shared/` + `apps-script/src/`). |
| `shared/osc-core.js` | Validation and Indian formatting used by both the server and the console. |
| `console/` | The console website. Only `console/config.js` needs your Web app URL. |
| `docs/` | Deployment guide and checklists. |
| `tests/` | Automated tests. They run the real `Code.gs` against an in-memory imitation of Google services. |
| `tools/` | Build script and a local test server. |

## For developers
Requires Node.js 18 or later.
```
npm test                      # builds Code.gs and runs all tests
node tools/dev-server.js --demo   # local console at http://localhost:8787 on a simulated backend
```
Rule: run `npm test` before every change, and record each change in `PROJECT_CONTEXT.md`.

## Third-party components
- Inter font (SIL Open Font License 1.1), `console/fonts/`
- Lucide icons 0.460.0 (ISC licence), inlined in `console/js/ui.js`
- read-excel-file 5.8.6 (MIT), `console/vendor/`
