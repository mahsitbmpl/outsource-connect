# OutSource Connect: Phase 3 deployment guide (rules engine and duties)

Time needed: about 20 minutes. You need `outsource-connect-phase3.zip`. It does **not** contain `console/config.js` or `kiosk/config.js`, so your settings stay as they are.

What Phase 3 adds:
- **Attendance rules engine.** Your rules, written once and used by the server, the console and the tablet.
- **Duties.** Every 5 minutes, new punches become duties. Each duty shows its hours, shift, the 8 / 4 / Double split, and the company and rate in force that day.
- **Needs attention.** Missing OUT, missing IN, late-arrival grace, over 12 h approval and short duty are found and kept up to date automatically. The buttons to fix them come in Phase 4.
- **Attendance rules page (Admin).** Rule versions with a start date, an impact preview before saving, recalculation, and the **Rule test report**.
- **Tablet.** The OUT screen now shows hours under your rules, for example "This duty: 12.50 hrs".

---

## Steps

1. **Server.** In the Google Sheet, open **Extensions**, then **Apps Script**. Replace all of `Code.gs` with the new `apps-script\dist\Code.gs` and save.
2. Reload the Sheet. Choose **OutSource Connect**, then **1. Run setup (safe to repeat)**. It adds the tabs **Rules**, **Exceptions**, **DutyDecisions** and **Duties_2026**, and the default rule version **RV1** (your Phase 0 rules).
3. In Apps Script, click **Deploy**, then **Manage deployments**, then the **pencil**. Set **Version** to **New version** and click **Deploy**. (Do not use "New deployment".)
4. **Turn on automatic processing.** In the Sheet menu choose **OutSource Connect**, then **4. Start automatic processing (every 5 min)**. Google asks for permission once; allow it.
   You can check it in Apps Script: the **clock icon (Triggers)** on the left shows `processPunchesJob`, every 5 minutes.
5. **Process the punches you already have.** In the Sheet menu choose **5. Recalculate this month's duties**.
6. **Website.** In GitHub, choose **Add file**, then **Upload files**. Drag everything from the unzipped folder and click **Commit changes**.
7. Open the console and press **Ctrl+F5**. On the tablet, unpin, close **OS Kiosk**, open it again and pin it again, so it loads version 3.0.0.

## Where to look

| Page | What it shows |
|---|---|
| **Duties** | Every duty: IN, OUT, "Counted from", hours, final hours, status, rate. Click **How?** to see the calculation step by step. |
| **Duties → Per person per date** | Total, 8 Hrs, 4 Hrs, Double duty, hours waiting for approval, billable hours and duties for each person and date, in the same columns as your sample sheet. |
| **Duties → Needs attention** | Missing OUT and missing IN (with a suggested time), late-arrival grace, over 12 h waiting for approval, short duty. |
| **Attendance rules** (Admin) | The values in force, all versions, **New rule version** (with **Preview impact**), **Recalculate duties**. |
| **Rule test report** | All 52 test cases calculated live, with expected and calculated hours and the reason. Print it and compare with manual maths. |

## Changing a rule safely

1. **Attendance rules → New rule version.** Change only what you need.
2. Click **Preview impact on the last 30 days**. Read which duties would change and by how many hours.
3. The start date must be the **1st of a month**, so one bill never mixes two rule sets. It cannot fall in a locked month.
4. Enter the reason or approval reference, then save. The old version stays on record.
5. Use **Recalculate duties** from that 1st if the month is still open. Ops manager decisions are kept, and locked months never change.

## How the late-arrival rule works

| IN | Counted from | Result |
|---|---|---|
| 08:00 to 08:10 | 08:00 | normal |
| 08:11 to 08:59 | 09:00 | automatic |
| 09:01 to 09:10, 10:01 to 10:10 … | the next full hour (strict) | shows under **Needs attention → Late arrival: grace decision**. Phase 4 adds the buttons "Keep strict" and "Give grace". Until then, the strict hours are used. |

The hours beyond 12 on one date (for one person) stay out of the bill until approved. They appear as "Waiting approval" and under **Needs attention → Over 12 h: approval**.
