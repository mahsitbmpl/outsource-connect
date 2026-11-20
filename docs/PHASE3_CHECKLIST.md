# Phase 3 checklist: verify before Phase 4

## Set-up
- [ ] After **Run setup**, the Sheet has the tabs Rules (with RV1), Exceptions, DutyDecisions and Duties_2026.
- [ ] Apps Script **Triggers** shows `processPunchesJob` every 5 minutes, and only once.
- [ ] **Recalculate this month's duties** finishes with a message showing the number of duties.

## Rule test report (most important)
- [ ] Open **Attendance rules → Rule test report**. It says **52 of 52**.
- [ ] Print it. For at least the 9 **Required** cases and all **Late arrival** cases, work out the hours by hand from your manual method and tick each one that agrees.
- [ ] If any line disagrees with how you calculate today, write the case ID and your answer, and send it to me **before** Phase 4.

## Real punches on the tablet
- [ ] A normal day duty (IN about 08:00, OUT about 20:00) appears on **Duties** within 5 minutes with 12.00 h, and **How?** explains it.
- [ ] A late IN between 08:11 and 08:59 is counted from 09:00.
- [ ] A late IN within 10 minutes after a later full hour (for example 09:05) shows a grace amount, and appears under **Needs attention → Late arrival**.
- [ ] Someone who punches IN and forgets OUT shows **On duty** until 24 hours, then **Missing OUT** with a suggested OUT time.
- [ ] An OUT with no IN shows **Missing IN** with a suggested IN time.
- [ ] A double duty (for example 08:00 to 08:00 next day) shows 24 h: 8 / 4 / 12, with 12 h **waiting approval**.
- [ ] Each duty shows the correct **rate** for the person's company and designation on that date.
- [ ] **Per person per date** matches the 8 Hrs / 4 Hrs / Double Duty columns you would write in your sheet for the same days.
- [ ] The tablet OUT screen shows "This duty: xx.xx hrs", and it matches the Duties page after processing.

## Rule versions (Admin)
- [ ] **New rule version** with a start date that is not the 1st of a month is refused.
- [ ] **Preview impact** with grace changed to 15 minutes lists the duties that would change. **Cancel** saves nothing.
- [ ] (Optional, on a test copy only) Save a version, recalculate, check the hours change from that date only, then contact me to remove the test version.

## Parallel check
- [ ] For 3 days, write the hours from your paper register next to the **Per person per date** figures. List every difference with the person, date, your figure and the system's figure.
