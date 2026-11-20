# OutSource Connect: Phase 4 deployment guide (dashboard and exceptions)

Time needed: about 15 minutes. You need `outsource-connect-phase4.zip`. It does not contain `console/config.js` or `kiosk/config.js`, so your settings stay as they are.

What Phase 4 adds:
- **Dashboard** (replaces Home):
  - On duty now against required, for the current shift, plus Day and Night counts.
  - Each department's headcount and shortage.
  - Open duties with live timers (amber after 13 h, red after 24 h).
  - Live punches today and the number of items needing attention.
  - Tablet battery, charging, last seen and queue.
  - This month so far: duties per department, double duty, deductions, penalties and an estimated bill.
  - A 30-day trend, active staff by department and company, and joiners and exits.
  It refreshes every minute.
- **Exceptions**: one list with fix buttons for every item:
  - **Missing OUT**: "Set OUT <suggested time>", or another time.
  - **Missing IN**: "Add IN <suggested time>", or another time. The duty is re-paired automatically.
  - **Late arrival**: "Keep strict" or "Give grace", or override.
  - **Over 12 h**: "Approve all hours", "Approve 12 h only", or split a long duty into two dates.
  - **Short duty**: mark reviewed, or override the hours.
  - **Unrecognised face**: view the photo, then assign it to a person as IN or OUT.
- **Penalties & deductions**: penalties by date (one person or the whole department, with a reason printed on the bill) and deductions in hours, both with cancel.
- **Duties → How?**: Override hours, Change shift tag, Split duty, Set OUT and Add IN from the same window.

Every fix needs a **reason** and a **note**, and is saved with your name in the audit log. Tablet punches are **never** changed. A correction is stored as a separate manual punch, marked MANUAL with the reason, or as a decision. The Ops manager's decision is final, and both the system hours and the final hours are kept.

## Steps

1. **Server.** In the Google Sheet, open **Extensions**, then **Apps Script**. Replace all of `Code.gs` with the new `apps-script\dist\Code.gs` and save.
2. Reload the Sheet. Choose **OutSource Connect**, then **1. Run setup (safe to repeat)**. It adds the **Penalties** and **Deductions** tabs.
3. In Apps Script, click **Deploy**, then **Manage deployments**, then the **pencil**. Set **Version** to **New version** and click **Deploy**.
4. **Website.** In GitHub, choose **Add file**, then **Upload files**. Drag everything from the unzipped folder and click **Commit changes**.
5. Open the console and press **Ctrl+F5**. The tablet does not need an update this time.

## Reason codes

Hospital requirement · Emergency · Transport problem · Tablet fault · Forgot to punch · Other. You always add a short note as well, such as who confirmed it.

## Good daily routine for the Ops manager

1. Morning: open the **Dashboard** and check shortages and open duties older than 13 h (amber).
2. Open **Exceptions** and clear Missing OUT and Missing IN first, then late-arrival grace, then over 12 h approvals.
3. Check **Unrecognised faces**. If the same person appears often, use **Add another sample** on their staff page.
4. Enter penalties and deductions on the day they happen.
