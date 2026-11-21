# Phase 5 checklist: verify before Phase 6

## Setup
- [ ] Setup ran with the new permission. The **Bills**, **EmailLog** and **JobLog** tabs exist.
- [ ] Admin → Automation & emails shows "Automatic processing is on".
- [ ] The test email arrived (check spam once, then mark it as "Not spam").

## Bill accuracy (the main check)
- [ ] Pick one past month for Housekeeping. Open **Month-end pack → View bill**.
- [ ] Compare it with your manual bill:
  - [ ] the 8 Hrs, 4 Hrs and Double duty totals per designation;
  - [ ] the deduction hours and the duties;
  - [ ] rate × duties;
  - [ ] the penalties;
  - [ ] GST on (sub total − penalties);
  - [ ] the net amount and the round-off;
  - [ ] the amount in words.
- [ ] Open the **Excel pack**. Check that all five tabs look like your sample sheet and that the 8 Hours Duty grid shows "A" on days the person was absent.
- [ ] **Summary Sheet:** the total hours = 8 Hrs + 4 Hrs + Double for every date, including the last day of the month.
- [ ] **Bill PDF:** the provider details, the bill number, and that the signature boxes are right. There is no logo.
- [ ] Send me any difference (the date, the person, and your figure against the system's).

## Lock and unlock
- [ ] With open items, the Ops manager sees **Clear before locking** and cannot lock.
- [ ] After the items are cleared, **Lock** makes the bill FINAL. Check that:
  - [ ] the bill number shows;
  - [ ] the files are in Drive under *Month packs → YYYY-MM → Final*.
- [ ] In the locked month, adding a penalty, deduction or fix is refused with "locked".
- [ ] The Admin can **Unlock** with a reason, and locking again gives `-R1`.
- [ ] When all departments are locked, the **monthly summary email** arrives with the PDFs.

## Compare & what-if
- [ ] Company comparison lists every company with rate cards for the department.
- [ ] Changing a rate in the what-if table changes the net payable and the difference at once.
- [ ] The rule what-if shows how many duties would change. Nothing is saved, so Attendance rules stay the same.

## Emails and automation (watch for 2 to 3 days)
- [ ] The morning email arrives at about 09:00 (within 5 minutes) and the evening email at about 17:30.
- [ ] Unplug the tablet's Wi-Fi for 20 minutes: a **Tablet alert** arrives. Reconnect it: a **Tablet OK** email arrives.
- [ ] On Sunday after 02:00, a new backup is in Drive → *Backups*.
- [ ] Automation & emails shows each job's last run as **OK**.
