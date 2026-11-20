/*
 * Rule test cases (default rules). Used by the automated tests AND shown in the console's "Rule test report"
 * so the Ops manager can compare every line with manual maths. Times are IST: 'YYYY-MM-DD HH:MM'.
 * h = expected hours; g = hours if late-arrival grace is given; date = duty date; shift = Day/Night.
 */
var OSC_RULE_CASES = [
  // --- owner's required cases (brief) ---
  { id: 'R1', group: 'Required', in: '2026-11-02 08:05', out: '2026-11-02 20:32', h: 12.5, note: 'within grace; 32 min extra = 0.5' },
  { id: 'R2', group: 'Required', in: '2026-11-02 08:00', out: '2026-11-02 20:29', h: 12.0, note: '29 min extra = 0' },
  { id: 'R3', group: 'Required', in: '2026-11-02 08:00', out: '2026-11-02 20:44', h: 12.5, note: '44 min extra = 0.5' },
  { id: 'R4', group: 'Required', in: '2026-11-02 08:00', out: '2026-11-02 20:45', h: 13.0, note: '45 min extra = 1.0' },
  { id: 'R5', group: 'Required', in: '2026-11-02 08:00', out: '2026-11-03 06:00', h: 22.0, note: 'over midnight; 10 whole hours extra' },
  { id: 'R6', group: 'Required', in: '2026-11-02 08:00', out: '2026-11-03 01:00', h: 17.0, split: [8, 4, 5], note: 'split 8 / 4 / 5' },
  { id: 'R7', group: 'Required', in: '2026-11-02 22:00', out: '2026-11-03 08:30', h: 10.5, shift: 'Night', note: 'starts on the hour; 30 min extra after 08:00 = 0.5' },
  { id: 'R8', group: 'Required', in: '2026-11-02 11:00', out: '2026-11-03 17:00', h: 30.0, split: [8, 4, 18], note: '30-hour duty' },
  { id: 'R9', group: 'Required', in: '2026-11-02 08:12', out: '2026-11-02 20:00', h: 11.0, note: 'owner rule: late beyond grace counts from 09:00 (was 11.8 in the brief)' },
  // --- owner's late-arrival decisions ---
  { id: 'L1', group: 'Late arrival', in: '2026-11-02 08:10', out: '2026-11-02 20:00', h: 12.0, note: '10 min is still within grace' },
  { id: 'L2', group: 'Late arrival', in: '2026-11-02 08:11', out: '2026-11-02 20:00', h: 11.0, note: '1 min past grace: from 09:00' },
  { id: 'L3', group: 'Late arrival', in: '2026-11-02 08:12', out: '2026-11-02 20:40', h: 11.5, note: 'from 09:00; 40 min extra = 0.5' },
  { id: 'L4', group: 'Late arrival', in: '2026-11-02 08:59', out: '2026-11-02 20:00', h: 11.0, note: 'from 09:00' },
  { id: 'L5', group: 'Late arrival', in: '2026-11-02 09:00', out: '2026-11-02 20:00', h: 11.0, note: 'exactly on the hour' },
  { id: 'L6', group: 'Late arrival', in: '2026-11-02 09:05', out: '2026-11-02 20:00', h: 10.0, g: 11.0, note: 'strict from 10:00; Ops manager may give grace from 09:00' },
  { id: 'L7', group: 'Late arrival', in: '2026-11-02 10:08', out: '2026-11-02 20:00', h: 9.0, g: 10.0, note: 'grace review again' },
  { id: 'L8', group: 'Late arrival', in: '2026-11-02 10:11', out: '2026-11-02 20:00', h: 9.0, note: 'outside grace: no review' },
  { id: 'L9', group: 'Late arrival', in: '2026-11-02 20:15', out: '2026-11-03 08:00', h: 11.0, shift: 'Night', note: 'night duty, late: from 21:00' },
  { id: 'L10', group: 'Late arrival', in: '2026-11-02 22:20', out: '2026-11-03 08:30', h: 9.5, shift: 'Night', note: 'from 23:00; 30 min extra = 0.5' },
  { id: 'L11', group: 'Late arrival', in: '2026-11-02 23:20', out: '2026-11-03 08:00', h: 8.0, date: '2026-11-02', shift: 'Night', note: 'start rounds to 00:00 but duty date stays the IN date' },
  // --- early arrival ---
  { id: 'E1', group: 'Early arrival', in: '2026-11-02 07:30', out: '2026-11-02 20:00', h: 12.0, note: 'early not counted' },
  { id: 'E2', group: 'Early arrival', in: '2026-11-02 06:00', out: '2026-11-02 20:00', h: 12.0, note: 'exactly 120 min early: snaps to 08:00' },
  { id: 'E3', group: 'Early arrival', in: '2026-11-02 05:59', out: '2026-11-02 20:00', h: 14.0, note: '121 min early: counted from 06:00' },
  { id: 'E4', group: 'Early arrival', in: '2026-11-02 05:30', out: '2026-11-02 20:00', h: 14.0, note: 'counted from 06:00' },
  { id: 'E5', group: 'Early arrival', in: '2026-11-02 19:00', out: '2026-11-03 08:00', h: 12.0, shift: 'Night', note: 'night duty, early: from 20:00' },
  { id: 'E6', group: 'Early arrival', in: '2026-11-02 04:00', out: '2026-11-02 20:00', h: 16.0, note: 'on the hour, outside snap window' },
  // --- leaving early / short duty ---
  { id: 'S1', group: 'Leaving early', in: '2026-11-02 08:00', out: '2026-11-02 15:20', h: 7.33, split: [7.33, 0, 0], note: 'exact minutes: 7 h 20 m' },
  { id: 'S2', group: 'Leaving early', in: '2026-11-02 08:00', out: '2026-11-02 19:50', h: 11.83, note: 'exact: 11 h 50 m' },
  { id: 'S3', group: 'Leaving early', in: '2026-11-02 08:00', out: '2026-11-02 12:00', h: 4.0 },
  { id: 'S4', group: 'Leaving early', in: '2026-11-02 08:12', out: '2026-11-02 15:20', h: 6.33, note: 'from 09:00, exact to 15:20' },
  { id: 'S5', group: 'Leaving early', in: '2026-11-02 08:12', out: '2026-11-02 08:40', h: 0, note: 'left before the counted start' },
  { id: 'S6', group: 'Leaving early', in: '2026-11-02 20:00', out: '2026-11-03 06:00', h: 10.0, shift: 'Night', note: 'night, left 2 h early' },
  { id: 'S7', group: 'Leaving early', in: '2026-11-02 08:00', out: '2026-11-02 20:00', h: 12.0 },
  // --- extra time ---
  { id: 'X1', group: 'Extra time', in: '2026-11-02 08:00', out: '2026-11-02 21:29', h: 13.0, note: '1 h 29 m extra = 1.0' },
  { id: 'X2', group: 'Extra time', in: '2026-11-02 08:00', out: '2026-11-02 21:30', h: 13.5 },
  { id: 'X3', group: 'Extra time', in: '2026-11-02 08:00', out: '2026-11-02 21:59', h: 14.0 },
  { id: 'X4', group: 'Extra time', in: '2026-11-02 20:00', out: '2026-11-03 08:44', h: 12.5, shift: 'Night' },
  { id: 'X5', group: 'Extra time', in: '2026-11-02 20:00', out: '2026-11-03 09:45', h: 14.0, shift: 'Night' },
  // --- long and double duties ---
  { id: 'D1', group: 'Long duty', in: '2026-11-02 08:00', out: '2026-11-03 08:00', h: 24.0, split: [8, 4, 12], note: 'continuous double duty' },
  { id: 'D2', group: 'Long duty', in: '2026-11-02 08:00', out: '2026-11-04 08:00', h: 48.0, split: [8, 4, 36], note: '48-hour duty' },
  { id: 'D3', group: 'Long duty', in: '2026-11-02 20:00', out: '2026-11-03 20:00', h: 24.0, shift: 'Night' },
  { id: 'D4', group: 'Long duty', in: '2026-11-02 08:00', out: '2026-11-03 08:20', h: 24.0, note: '20 min extra after 08:00 = 0' },
  // --- midnight, month and year boundaries ---
  { id: 'M1', group: 'Dates', in: '2026-10-31 20:00', out: '2026-11-01 08:00', h: 12.0, date: '2026-10-31', shift: 'Night', note: 'belongs to October' },
  { id: 'M2', group: 'Dates', in: '2026-12-31 20:05', out: '2027-01-01 08:10', h: 12.0, date: '2026-12-31', shift: 'Night', note: 'belongs to 2026' },
  { id: 'M3', group: 'Dates', in: '2027-02-28 20:00', out: '2027-03-01 08:00', h: 12.0, date: '2027-02-28', shift: 'Night' },
  { id: 'M4', group: 'Dates', in: '2028-02-29 08:00', out: '2028-02-29 20:00', h: 12.0, date: '2028-02-29', note: 'leap day' },
  { id: 'M5', group: 'Dates', in: '2026-11-02 23:59', out: '2026-11-03 08:00', h: 8.0, date: '2026-11-02', shift: 'Night' },
  { id: 'M6', group: 'Dates', in: '2026-11-03 00:00', out: '2026-11-03 08:00', h: 8.0, date: '2026-11-03', shift: 'Night', note: 'IN at midnight belongs to the new date' },
  // --- shift tag edges ---
  { id: 'T1', group: 'Shift tag', in: '2026-11-02 04:00', out: '2026-11-02 08:00', h: 4.0, shift: 'Day' },
  { id: 'T2', group: 'Shift tag', in: '2026-11-02 03:59', out: '2026-11-02 08:00', h: 4.0, shift: 'Night', note: 'from 04:00 (on-hour round-up), Night tag' },
  { id: 'T3', group: 'Shift tag', in: '2026-11-02 13:59', out: '2026-11-02 20:00', h: 6.0, shift: 'Day', note: 'from 14:00' },
  { id: 'T4', group: 'Shift tag', in: '2026-11-02 14:00', out: '2026-11-02 20:00', h: 6.0, shift: 'Night' }
];
if (typeof module !== 'undefined' && module.exports) module.exports = OSC_RULE_CASES;
