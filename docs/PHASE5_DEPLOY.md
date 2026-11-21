# OutSource Connect: Phase 5 deployment guide (month-end pack, bills, emails, automation)

Time needed: about 20 minutes. You need `outsource-connect-phase5.zip`. It does not contain `console/config.js` or `kiosk/config.js`, so your settings stay as they are. The tablet needs no update.

## What Phase 5 adds

- **Month-end pack** (menu: Month-end pack). For each department and month you get:
  - a **bill** you can view on screen;
  - an **Excel pack** with the same five tabs as your sample sheet: *Bill Details*, *Summary Sheet*, *8 Hours Duty*, *4 Hours Duty*, *Double Duty*;
  - a **bill PDF**.

  How the bill is worked out:
  - Duties = net hours ÷ 12.
  - Amount = duties × rate. The rate comes from the rate card in force on each date.
  - GST is charged after penalties.
  - The net amount is rounded to the nearest rupee, and the round-off is shown on its own line.
  - The amount is also printed in words.

  The PDF also shows:
  - numbered penalty remarks and the deduction details;
  - Prepared / Checked / Approved by boxes;
  - no logo.

  Until the month is locked, the files are marked **DRAFT**.
- **Month lock.** Click **Lock** after the month is over and nothing is open. Locking does the following:
  - The bill becomes **FINAL** with a bill number, for example `MAH-OSC/HK/2026-10/ALPHA`.
  - The Excel pack and PDF are saved to Google Drive (*OutSource Connect Data → Month packs → 2026-10 → Final*).
  - Nobody can change that month's punches, decisions, penalties or deductions any more.
  - Only the Admin can unlock, and must give a reason. Locking again makes a new revision (`...-R1`), and the old bill is kept as *Superseded*.
  - If items are still open, the Ops manager cannot lock. The Admin can choose **Lock anyway** with a written reason, and the bill shows "locked with open items".
- **Compare & what-if:**
  - The same month's hours priced with every company's rate cards, cheapest first.
  - What-if for rates, GST and penalties, worked out live on screen.
  - What-if for attendance rules (grace, early arrival, extra-time rounding, over-12 approval). It recalculates the month from the same punches and saves nothing.
- **Emails:**
  - **09:00** morning report: yesterday by department, items needing attention, open duties, tablet status, month so far.
  - **17:30** evening report.
  - **Tablet alerts**: tablet silent, low battery and not charging, camera fault, punches stuck. You get one email when a problem starts and one when it clears.
  - **Draft month-end pack** on the 1st, with the draft PDFs attached.
  - **Monthly summary** once every department of the month is locked: all bills, comparison with the previous month, PDFs attached, and links to the Excel files.
  - An **email to the Admin** if an automatic job fails.
- **Automatic jobs.** These all run from the same 5-minute timer:
  - **Nightly close (23:45):** re-checks the last 3 days, including short duties, and removes old sign-ins.
  - **Clean-up (03:00):** photos older than the retention days and face data of staff who left more than 90 days ago.
  - **Weekly backup (Sunday 02:00):** a full copy of the Google Sheet in *Backups*. The last 8 are kept.
  - **Draft pack on the 1st (07:00).**
  - **Year roll-over (from 15 December):** next year's tabs are made early, and years older than 3 full years move to an archive file.
- **Admin → Automation & emails:**
  - every job, with its last run and **Run now**;
  - **Send test email** and previews of each email;
  - the email log and the job history.

## Steps

1. **Server code.** In the Google Sheet, open **Extensions → Apps Script**. Replace all of `Code.gs` with the new `apps-script\dist\Code.gs` and save.
2. **New permission (once).** Reload the Sheet. Choose **OutSource Connect → 1. Run setup (safe to repeat)**. Google asks for permission again because the system now sends emails. Click **Continue**, choose your account, then **Advanced → Go to OutSource Connect (unsafe) → Allow**. ("Unsafe" only means Google has not reviewed your own script.) Setup adds the **Bills**, **EmailLog** and **JobLog** tabs and the new settings.
3. Choose **OutSource Connect → 4. Start automatic processing**. This restarts the 5-minute timer with the new permission.
4. In Apps Script, click **Deploy → Manage deployments → pencil**. Set **Version** to **New version** and click **Deploy**. The web address stays the same.
5. **Website.** In GitHub, choose **Add file → Upload files**. Drag everything from the unzipped folder and click **Commit changes**. Then open the console and press **Ctrl+F5**.
6. **Settings** (Admin → Settings). Fill in:
   - **Emails:**
     - *Email TO list* (Ops manager), plus *CC* if needed;
     - *Tablet and system alerts* (IT or Admin; if left blank, the TO list is used);
     - *Console web address*: your GitHub Pages console link, which is used for the buttons in emails.
   - **Organisation:** *Hospital address* and, optionally, *Hospital GSTIN*. If the GSTIN is filled in and the provider is in the same state, the PDF shows CGST + SGST.
   - **Bills:** the bill number prefix (default `MAH-OSC`) and the signature boxes (default Prepared by, Checked by, Approved by).
   - **Automation:** the backup day and time, the number of backups to keep, and the draft-pack time.
7. Choose **OutSource Connect → 6. Send a test email**, or click **Send test email** on Automation & emails, and check the inbox (and the spam folder).

## Month-end routine for the Ops manager

1. On the **1st**, the draft email arrives. Open **Month-end pack** and pick last month.
2. If a department shows **Clear before locking**, open **Exceptions** and resolve those items.
3. Click **View bill** and compare it with the vendor's invoice. Download the **Excel pack** or **Bill PDF** if needed.
4. Click **Lock [month]** for each department. When the last one is locked, the monthly summary email goes out automatically.
5. If a correction is needed after locking, ask the Admin to **Unlock**. Fix the item and lock again (this makes a new revision).

## Good to know

- **Email limit:** free Google accounts can send to about 100 recipients a day. The normal daily use is 2 to 6 emails, so this is not a problem.
- **Backups** are full copies of the Google Sheet, including its script. Open a backup only to look at or copy data. Do not run the menu from a backup.
- **Archived years** go into a separate file, *OutSource Connect archive YYYY*, in the Backups folder. The copy is checked before anything is removed.
- **Photos** older than the retention period (180 days by default) go to the Google Drive bin, which Google empties after 30 days.
