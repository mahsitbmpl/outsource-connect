# OutSource Connect: Admin guide

For the IT Admin who owns the Google account, the Google Sheet, the GitHub site and the tablet.
The deployment steps for each phase are in `PHASE1_DEPLOY.md` to `PHASE6_DEPLOY.md`. This guide covers running the system.

---

## 1. What lives where

| Part | Where | Who can open it |
|---|---|---|
| Data (all tabs) | Google Sheet "OutSource Connect" in the owner's Google Drive | Owner only (keep sharing **Restricted**) |
| Server code | Extensions → Apps Script inside that Sheet (`Code.gs`) | Owner |
| Photos, bills, backups, archives | Drive folder **OutSource Connect Data** (Photos, Unrecognised, Month packs, Backups) | Owner only |
| Tablet secret, Drive folder IDs, job state | Apps Script → Project settings → **Script properties** | Owner. These are **not** in backups (see section 5). |
| Console and kiosk websites | GitHub repository → GitHub Pages | Public code; no data and no secrets |

---

## 2. Users and roles

- **Admin:**
  - everything the Ops manager can do;
  - users, settings, departments and attendance rules;
  - unlocking a month, or locking it with open items;
  - Automation & emails, and System health.
- **Ops manager:** staff, companies and rates, exceptions, penalties, duties, the month-end pack and locking, the parallel-run check.
- Add users under **Admin → Users**. A temporary password is shown once, and the user must change it at first sign-in.
- After 5 wrong passwords an account locks for 30 minutes. The Admin can unlock it with **Reset password**.
- If the Admin password is lost: in the Sheet, choose **OutSource Connect → Reset Admin password**.

---

## 3. Weekly Admin routine (10 minutes)

1. Open **Admin → System health**. Every line should say **Good**. What to do for each line:
   - **Sheet size:** see section 7.
   - **Automatic processing:** off → Sheet menu → **4. Start automatic processing**.
   - **Automatic run time:** over half of the 90 minutes → check **Automation & emails** for a job taking long.
   - **Sheet sharing / Drive folder sharing:** Act now → in Google Drive, set Share → General access → **Restricted**. Remove extra editors.
   - **Last weekly backup:** older than 8 days → open Automation & emails, check the **Weekly backup** result, and use **Run now**.
   - **Tamper check:** see section 6.
2. **Automation & emails:** all jobs should show **OK**. Read any FAILED detail.
3. **Audit log:** skim for unusual activity (for example, many overrides by one user, or rate changes).

---

## 4. Safe rule-change guide (attendance rules)

Rules decide money. Change them only with written approval from management, and in this order:

1. **Agree the change in writing.** For example: "From 1-Jan-2027 grace becomes 15 minutes".
2. **See the effect first:**
   - **Compare & what-if → What-if: attendance rules.** Enter the new values for last month and note how many duties change and how much the bill changes.
   - **Admin → Attendance rules → Preview impact** for the last 30 days.
3. **Run the rule test report:** Attendance rules → **Rule test report**. All cases must pass. If you change a rule the cases depend on, ask IT to update `shared/rule-cases.js` and run `npm test` before going on.
4. **Add the new rule version** with an effective date on the **1st of a month**, so a bill never mixes two rule sets. Write the reason, including who approved it. Months that are already locked can never be changed.
5. **After the 1st:** check a few duties in **Duties → How?**. The explanation shows the rule version used.
6. **Record it:** add a line to the change log in `PROJECT_CONTEXT.md` (date, change, approval, test result).

Face-matching settings (strictness, margin, liveness) are in **Settings**. Change them in small steps (0.02) and watch the Unrecognised faces count for a week.

---

## 5. Backup and restore

**Automatic:**
- **Every Sunday at 02:00**, a full copy of the Sheet is saved to Drive → Backups. The newest 8 are kept.
- Month packs (Excel and PDF) of locked months are kept in Drive → Month packs.

**Not in the backup (keep these safely on paper or in a password manager):**
- The tablet's setup code. If it is lost, use **Tablet → Remove tablet** and then **Add tablet** to get a new one.
- Script properties: the tablet secret, Drive folder IDs and job state. If the whole Apps Script project is lost, run setup again in a new Sheet, restore the data (below), then add the tablet again.

**Restore (when data was damaged or deleted by mistake):**
1. Decide which backup to use: Drive → OutSource Connect Data → Backups → "OutSource Connect backup YYYY-MM-DD" (the last good date).
2. Open that backup and copy its link (address bar).
3. In the **live** Sheet, choose **OutSource Connect → 7. Restore from a backup…**, paste the link, and type `RESTORE` to confirm.
4. The system then:
   - first makes a **safety copy** of the current state (Backups → "OutSource Connect before restore …");
   - replaces every data tab with the backup's tab;
   - resets the tamper-check codes and the punch counters;
   - writes an entry in the audit log.
5. Punches made **after** the backup time are not in the restored data. Add them as manual punches from the paper register (Exceptions / Duties).
6. Open the console. Check Staff, Duties for the last days, and the Month-end pack. Run **System health → Run tamper check now**.

**Restore drill (do it once before go-live, then once a year):**
1. Make a copy of the live Sheet (File → Make a copy) named "OSC drill". Open its Apps Script and run **setup** once, so it has its own folders.
2. In the drill copy, delete a few Staff rows.
3. Run **7. Restore from a backup…** in the drill copy, using last Sunday's backup.
4. Check that the Staff rows are back. Note the time it took on the go-live checklist. Then delete the drill copy and its "OutSource Connect Data" folder.

---

## 6. Tamper check

- Every new punch and audit-log row gets a **check code** (SHA-256) that depends on the row before it.
- Every Sunday at 03:30 the codes are re-checked. You can also run the check from **System health**.
- If someone edits, deletes or inserts a row by hand in the Google Sheet, the check reports the row and an email is sent.
- **If the check reports a problem:**
  1. Open the Sheet at the tab and row shown, and compare it with the same row in the last backup.
  2. If the change was a mistake, restore from the backup (section 5), or ask IT to put the original value back.
  3. Find out who had edit access (Drive → Share), and remove access that is not needed.
- Rows written before version 6.0 have no check code. They are shown as "older rows without check codes" and are not checked.

---

## 7. Capacity, quotas and the yearly roll-over

**Google limits** (free account):

| Limit | Amount | What uses it |
|---|---|---|
| Cells per spreadsheet | 10 million | All tabs together |
| Automatic run time per day | 90 minutes | The 5-minute job |
| Emails per day | about 100 recipients | About 2 to 6 emails a day |
| One run | 6 minutes | Longer jobs carry on at the next 5-minute tick |

**Capacity** (the load test in `LOAD_TEST_REPORT.md`): 100 staff for 3 years uses about 59% of the cell limit. About 12 minutes of automatic run time a day are needed.

**Every January** the roll-over job (01:00 daily, acting in December and January) does three things:
- It makes next year's punch and duty tabs from 15 December.
- It moves punch and duty tabs older than the current year plus 2 past years (**Settings → dataKeepYears**, default 2) to a file "OutSource Connect archive YYYY" in Backups.
- It moves log rows, exceptions and decisions of those years to the same archive.

Each copy is checked before anything is removed. The archive files are ordinary Google Sheets you can open at any time.

If **Sheet size** goes above 60%, lower *dataKeepYears* to 1 in December, or ask IT.

---

## 8. Updating the system (new version from IT)

1. Read the release note (`PHASEx_DEPLOY.md` or `UPDATE_x.md`).
2. Paste the new `Code.gs` into Apps Script and save. Reload the Sheet and run **1. Run setup**. This is safe to repeat: it only adds tabs, columns and settings.
3. Choose **Deploy → Manage deployments → pencil → New version → Deploy**. The web address stays the same.
4. Upload the new website files to GitHub. **Never upload** `console/config.js` or `kiosk/config.js` over your own copies; the release zips leave them out.
5. Press **Ctrl+F5** in the console. On the tablet, unpin the app, close it, reopen it and pin it again.
6. Check **System health** and run **Speed check**.

---

## 9. Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Console says "Cannot reach the server" | Wrong web app link in `console/config.js`, or the deployment was deleted | In Apps Script, use Deploy → Manage deployments, copy the Web app URL, and check `config.js` on GitHub. |
| "Your session has ended" often | 30 minutes idle or 8 hours total | Normal. Change it in Settings → sessionIdleMinutes or sessionHours. |
| Pages slow (5 s or more) | Google starting the script after a quiet period | The first page after a while is slow; the rest are fast. **System health → Speed check** shows the server's share. |
| Duties not updating | The 5-minute trigger is off, or failing | System health → Automatic processing. Re-run menu **4**. Check Automation & emails. |
| No emails | No permission, or Email TO list empty | Run menu **6. Send a test email**, accept permission, fill Settings → Email TO list. |
| Emails in spam | New sender | Mark as "Not spam" once in each inbox. |
| Lock button missing | Month not over, open items, or already locked | Read the yellow box on Month-end pack. |
| Bill shows "NO RATE" | No rate card for that designation and date | Companies & rates → Add rate with the right effective date. |
| Tablet "not registered" | The tablet was removed in the console | Tablet → Add tablet; type the new setup code on the tablet. |
| Photo "removed after the retention period" | Older than photoRetentionDays (180) | Expected. Change the setting if longer is needed (uses more Drive space). |
| Tamper check problem | Someone edited the Sheet by hand | Section 6. |
| "The system is busy" | Two heavy actions at the same moment | Wait 10 seconds and try again. |

**Contacts:** IT Department, Marengo Asia Hospital, Surat. Keep this guide with the go-live checklist.
