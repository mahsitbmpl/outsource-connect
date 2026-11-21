# OutSource Connect: Phase 6 deployment guide (hardening and go-live, version 6.0.0)

Time needed: about 15 minutes, plus the restore drill (about 20 minutes). The zip does not contain your `config.js` files. The tablet needs no update.

## What Phase 6 adds

- **Tamper check.** Every new punch and audit-log row gets a check code. Hand edits, deletions or insertions in the Google Sheet are found:
  - every Sunday, with an email if something is wrong;
  - or on demand from System health.
- **System health** (Admin menu). In one screen:
  - sheet size against Google's 10-million-cell limit, per tab;
  - the 5-minute processing and today's automatic run time (out of 90 minutes);
  - emails left today;
  - **sharing of the Sheet and the Drive folder**;
  - the last backup and the tamper check;
  - a **Speed check** of the main screens on your real installation.
- **Faster with years of data.**
  - Big tabs are read by date range.
  - Unchanged rows are no longer rewritten every 5 minutes.
  - Month-end screens read only that month.
  - The load test with 100 staff × 3 years is in `LOAD_TEST_REPORT.md`.
- **Smaller sheet.**
  - Tabs lose their empty columns when you run setup.
  - Each January, data older than the current year + 2 past years moves to archive files in Drive. The setting *dataKeepYears* now defaults to 2.
- **Restore from a backup:** Sheet menu → **7. Restore from a backup…** (with a safety copy first).
- **Parallel run check** page: upload the paper register (Employee ID, Date, Hours) and see the match % and every difference, with hints.
- **Phone:** everyone now gets a **More** menu.
- **Documents:**

  | Document | Contents |
  |---|---|
  | `OPS_MANAGER_MANUAL.md` | Manual and SOP for the Ops manager |
  | `ADMIN_GUIDE.md` | Weekly routine, safe rule changes, backup and restore with a drill, tamper check, quotas and roll-over, updates, troubleshooting |
  | `PARALLEL_RUN.md` | One-month parallel run plan |
  | `GO_LIVE_CHECKLIST.md` | Go-live checklist |
  | `SECURITY_REVIEW.md` | Security review |
  | `LOAD_TEST_REPORT.md` | Load test results |

## Steps

1. Paste the new `apps-script\dist\Code.gs` into Apps Script and save.
2. Reload the Sheet and run **OutSource Connect → 1. Run setup**. This adds the check-code columns and new settings, and removes empty columns. It is safe to repeat.
3. **Deploy → Manage deployments → pencil → New version → Deploy.**
4. Upload the website files to GitHub and press **Ctrl+F5** in the console.
5. **Settings → Retention → dataKeepYears:** if it still shows 3 from Phase 5, change it to **2**. The reason is in the Admin guide, section 7.
6. Open **Admin → System health**:
   - fix anything marked **Act now** (usually sharing);
   - click **Run tamper check now** (punches before today show as "older rows without check codes", which is normal);
   - click **Speed check** and write the times on the go-live checklist.
7. Do the **restore drill** (Admin guide, section 5) once.
8. Start the **parallel run** on the 1st of next month (`PARALLEL_RUN.md`). Then complete `GO_LIVE_CHECKLIST.md`.
