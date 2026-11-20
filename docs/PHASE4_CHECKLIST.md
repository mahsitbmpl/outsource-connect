# Phase 4 checklist: verify before Phase 5

## Dashboard
- [ ] "On duty now" matches the people actually inside, and "required" matches the Departments page for the current shift.
- [ ] Each department card shows the right shortage.
- [ ] Open duty timers count up. A duty older than 13 h turns amber, and older than 24 h turns red.
- [ ] A new punch on the tablet appears in "Live punches today" within about a minute (after processing; or click **Process new punches now** on Duties).
- [ ] The Tablet card matches the Tablet page (battery, charging, queue).
- [ ] "This month so far" duties per department are close to your own count for the month to date.
- [ ] The dashboard works on the Ops manager's phone.

## Exceptions (do each once with a real or test case)
- [ ] **Missing OUT → Set OUT** with the suggested time: the duty becomes Closed with the right hours, and the item leaves the list.
- [ ] **Missing IN → Add IN**: the duty is re-paired and the hours are right.
- [ ] **Late arrival → Give grace**: final hours go up by 1 h. **Keep strict**: they stay.
- [ ] **Over 12 h → Approve 12 h only**: "Billable now" stays 12. **Approve all**: billable equals the total.
- [ ] **Split duty** of a long duty at 08:00: each part goes to its own date.
- [ ] **Short duty → Mark reviewed** removes it from the list without changing the hours.
- [ ] **Override hours** from Duties → How?: Final shows the new hours with "override", and System hours stay unchanged.
- [ ] **Unrecognised face → Assign** to a person as IN: the punch appears in Punches marked MANUAL, and the duty is recalculated.
- [ ] Every fix without a reason or note is refused.
- [ ] **Audit log** shows each fix with your name, the reason and the note.
- [ ] In the Google Sheet, the original tablet rows in **Punches_2026** are unchanged. Corrections are new rows with deviceId MANUAL.

## Penalties and deductions
- [ ] Add a whole-department penalty and a one-person penalty. Both are listed with the totals.
- [ ] Add a deduction in hours. It appears on the dashboard as deduction hours.
- [ ] Cancel an entry with a reason. It shows as Cancelled and leaves the totals.

## Parallel check (keep going)
- [ ] For the days since Phase 3, after resolving exceptions, compare **Duties → Per person per date** with your paper register. Send me any difference.
