# OutSource Connect: Ops Manager manual and SOP

For the Ops manager who runs attendance and billing for outsourced Housekeeping (HK), Support Services (SS) and Security (SC) staff.
Console: open the link from IT on a PC or phone and sign in with your username and password.

---

## 1. How the system works (one minute)

1. Staff punch **IN** and **OUT** with their face on the lobby tablet. They need no card and no PIN.
2. Every 5 minutes the system turns punches into **duties** using the hospital rules:
   - The 08:00 and 20:00 boundaries apply, with 10 minutes' grace.
   - A late arrival is counted from the next full hour.
   - Extra time is rounded: under 30 minutes counts as 0; 30 to 44 minutes as ½ hour; 45 minutes or more as 1 hour.
   - Hours are split into 8 Hrs, 4 Hrs and Double duty.
3. Anything that needs a person's decision appears on the **Exceptions** page:
   - a missing IN or OUT;
   - a late-arrival grace decision;
   - hours over 12 waiting for approval;
   - a short duty;
   - an unrecognised face.
4. At month end you check and **lock** each department. The bill and the Excel pack become final, and the summary email goes out.

The tablet's punches are **never changed**. Every correction you make is stored next to them with your name, a reason and a note.

---

## 2. Daily SOP

| When | Do this | Where |
|---|---|---|
| 09:00 (email arrives) | Read the **Morning report**: yesterday's attendance against the required number, items needing attention, and the tablet status. | Email |
| Morning | Open the **Dashboard**. Check the shortage per department, and open duties shown amber (over 13 h) or red (over 24 h). | Dashboard |
| Morning | Clear the **Exceptions**, in this order: Missing OUT → Missing IN → Late arrival → Over 12 h → Short duty → Unrecognised faces. | Exceptions |
| Any time | Enter **penalties** and **deductions** on the day they happen. The reason you type is printed on the bill. | Penalties & deductions |
| 17:30 (email arrives) | Read the **Evening report** before the night shift: who is on duty now, and any shortage. | Email |
| If a **Tablet alert** email arrives | Go to the tablet (see section 6). | Lobby |

### How to clear each exception

| Exception | Usual cause | What to press |
|---|---|---|
| **Missing OUT** | Forgot to punch OUT, or left without punching | **Set OUT [suggested time]** if the person worked the normal duty; otherwise **Another time** and enter the real time from the register or CCTV. |
| **Missing IN** | Forgot to punch IN | **Add IN [suggested time]** or **Another time**. |
| **Late arrival (grace)** | IN within 10 minutes after a full hour, for example 09:05 | **Keep strict** (counted from 10:00) or **Give grace** (counted from 09:00). Your decision is final. |
| **Over 12 h** | Stayed beyond 12 hours | **Approve all hours** if the extra was asked for by the hospital; otherwise **Approve 12 h only**. For a 24 h+ stretch, use **Split duty**. |
| **Short duty** | Less than 12 hours | **Mark reviewed** if correct, or **Override hours** if the hours are wrong. |
| **Unrecognised face** | Face not matched (light, mask, new staff) | **View photo**, then **Assign to a person** as IN or OUT. If the same person appears often, ask the Admin to **Add another sample** of that face. |

Each fix asks for a **reason** (Hospital requirement, Emergency, Transport problem, Tablet fault, Forgot to punch, Other) and a **note**. In the note, write who confirmed it, for example "Confirmed by HK supervisor Rakesh".

---

## 3. Weekly SOP

- **Monday:** open **Duties → Per person per date** for last week. Look for people with many short duties or missing punches, and talk to the provider's supervisor.
- **Monday:** check **Unrecognised faces**. If the same person shows up repeatedly, ask the Admin to re-enroll them.
- **During the parallel run only:** upload the register on the **Parallel run check** page (section 7).

---

## 4. Month-end SOP (1st to 5th of the month)

1. On the **1st at about 07:00**, an email "Draft month-end pack" arrives. It has the draft PDF bills attached and lists anything still open.
2. Open **Month-end pack** and choose last month. Each department shows its draft net payable and any **Clear before locking** items.
3. Clear those items on **Exceptions**. They are usually a missing OUT on the last day or an over-12 approval.
4. For each department, click **View bill**:
   - Check the duties per designation, the rate, the penalties, GST, the net payable and the amount in words.
   - Compare with the provider's invoice. Download the **Excel pack** to see day-by-day hours in the same layout as the old sheet (8 Hours Duty, 4 Hours Duty, Double Duty).
5. If you think the provider is too expensive, use **Compare & what-if** to see the same month priced with another company's rates.
6. Click **Lock [month]** for each department. The bill gets its final number (for example `MAH-OSC/HK/2026-10/ALPHA`), and the files are saved in Google Drive.
7. When the last department is locked, the **Monthly summary** email goes out with all the PDF bills attached.
8. Print the bill PDF, get it signed (Prepared by, Checked by, Approved by) and send it to Accounts with the provider's invoice.

**If something is wrong after locking:** ask the Admin to **Unlock** the department, giving the reason. Correct the item and lock again. The new bill gets `-R1`, and the old one is kept as "Superseded".

---

## 5. Staff and companies

| Task | Where | Note |
|---|---|---|
| New joiner | **Staff → Add staff** | Employee ID is given automatically (HK015 …). Then ask the Admin to **enroll the face** on the tablet. |
| Transfer to another department | Staff → person → **Transfer** | The person keeps their Employee ID. Choose the date it takes effect. |
| Exit | Staff → person → **Exit** | Their face stops working on the tablet within seconds. |
| New rate from the provider | **Companies & rates** → company → **Add rate** | Give the effective-from date. The old rate closes the day before. Rates of locked months cannot change. |

---

## 6. Tablet: what to do when…

| Situation | Action |
|---|---|
| "Tablet alert: silent" email | Check that the tablet is on its stand, plugged in and on Wi-Fi, with the kiosk screen showing. Restart it if the screen is frozen; the app opens by itself. |
| "Battery low and not charging" | Check the charger and cable at the wall socket. |
| Internet down | Nothing to do. Punches are kept on the tablet ("Saved on tablet") and sent later. |
| Person not recognised again and again | Ask the Admin to use **Add another sample** (Staff → person). |
| Person punched twice | The second punch within 3 minutes is ignored automatically. |

---

## 7. Parallel run check (first month only)

1. Keep the paper register as before.
2. Each week, type the register into the **Excel template**: Employee ID, Date and Hours (the template is on the Parallel run check page).
3. Upload it. The page shows the **match %**, and lists every row where the register and the system differ, with a hint.
4. Fix real mistakes on the Exceptions page. Tell IT about any difference you think the system calculated wrongly: send the date, the person and both figures.

---

## 8. Good practice

- Sign out on shared PCs (top right → **Sign out**).
- Never share your password. The Admin can reset it if you forget it.
- Write meaningful notes. They are kept for audit and cannot be deleted.
- Decide exceptions within 2 days, while people still remember what happened.
