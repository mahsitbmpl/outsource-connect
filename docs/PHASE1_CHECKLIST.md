# Phase 1 checklist: verify before Phase 2

Tick each item. If anything fails, note what you saw and send it to me.

## Server and sheet
- [ ] The Web app URL opens and shows `"status":"running"`.
- [ ] The Sheet has these tabs: Settings, Departments, Companies, Rates, Staff, StaffHistory, Users, Sessions, LoginLog, AuditLog, MonthLocks.
- [ ] Running **1. Run setup** a second time says "Everything was already set up" and does not add a second admin.
- [ ] **Check password speed** shows under 2,000 ms.

## Sign-in and security
- [ ] Admin first sign-in with the temporary password forces a password change.
- [ ] A weak password (for example `admin12345`) is refused with a clear message.
- [ ] Five wrong passwords lock the account. The sixth try, even with the right password, says "locked".
- [ ] Sheet menu **Reset Admin password** gives a new temporary password that works.
- [ ] Leaving the console idle for 30 minutes signs you out.
- [ ] **Sign out** from the user menu works, and the back button does not show data afterwards.

## Users (Admin)
- [ ] Create an Ops manager. The temporary password is shown once.
- [ ] The Ops manager signs in on a phone, changes the password, and sees Home, Staff and Companies, but no Admin section.
- [ ] Disable the Ops manager: their open session stops working at once.
- [ ] **Recent sign-ins** lists the successful, failed and locked attempts.

## Departments and settings (Admin)
- [ ] Set real required headcount for HK, SS and SC. Home shows the new numbers.
- [ ] Change the morning email time to `9 am`: refused. Change it to `09:00`: saved, with the reason in the Audit log.

## Companies and rates
- [ ] Add a company with a wrong GSTIN: a clear error appears. Fix it and save.
- [ ] Add Staff and Supervisor rates for each department the company serves.
- [ ] Add a newer rate with a later start date: the old rate gets an end date the day before.
- [ ] A rate starting earlier than the latest one is refused.

## Staff
- [ ] Add a person: they get an ID such as HK001. The next person in HK gets HK002, and Security starts at SC001.
- [ ] A date of birth that makes the person under 18 is refused.
- [ ] Using a mobile that an active person already has is refused and names that person's ID.
- [ ] Choosing a company that does not serve the department is refused.
- [ ] Edit a person without a reason: refused. With a reason: saved, and shown in the Change log.
- [ ] **Transfer** someone from HK to SS: the ID stays the same and History shows both rows with dates.
- [ ] **Mark exit**: status becomes Exited and Face shows Disabled or Not enrolled. **Re-join** works with a later date.
- [ ] Export CSV opens in Excel with the Indian date format (20-Nov-2026).

## Import
- [ ] Download the Excel template, fill in 3 real or test rows, and import. Problems are listed per row and nothing is saved until all rows are right.
- [ ] After fixing the rows, **Import** creates the IDs in order.

## Phone
- [ ] The console opens on a phone with the bottom tab bar. **Add to Home screen** works.
- [ ] Every page shows the footer "Designed and developed by IT Department, Marengo Asia Hospital, Surat".

## Before go-live
- [ ] Demo data removed (Sheet menu **Remove demo data**).
- [ ] The Google Sheet is **not** shared with anyone except the system account.
