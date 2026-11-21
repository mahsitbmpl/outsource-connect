# Go-live checklist

Tick every line before switching off the paper register. Keep this page signed in the IT file.

## A. Accounts and access
- [ ] The Google account that owns the Sheet uses a strong password and **2-step verification**.
- [ ] The Google Sheet and the Drive folder "OutSource Connect Data" are shared as **Restricted** (System health shows Good for both).
- [ ] The GitHub account has 2-step verification. The repository holds no `config.js` with real data and no staff data.
- [ ] Users: one Admin, the Ops manager(s), and no test users left (**Admin → Users**).
- [ ] The Admin password and the tablet setup code are kept in a sealed envelope or password manager.

## B. Data
- [ ] Demo data removed (Sheet menu → **3. Remove demo data**).
- [ ] All active staff entered with correct IDs, departments, designations and companies.
- [ ] Rate cards correct for every department and designation, with GST.
- [ ] Required headcount per department set (**Admin → Departments**).
- [ ] Settings filled in:
  - [ ] Email TO / CC and alert emails;
  - [ ] console address;
  - [ ] hospital address and GSTIN;
  - [ ] bill prefix and signatures;
  - [ ] backup day.

## C. Tablet
- [ ] Mounted, charging, on hospital Wi-Fi, with screen pinning on (`PHASE2_DEPLOY.md`, part D).
- [ ] Every active staff member is enrolled and has done a test punch.
- [ ] The offline test passed: Wi-Fi off, punch, Wi-Fi on, and the punch arrives.

## D. Automation and safety
- [ ] **System health:** all lines Good (or explained).
- [ ] **Automation & emails:** all jobs OK. The test email, morning and evening emails were received.
- [ ] A weekly backup exists in Drive → Backups.
- [ ] The **restore drill** was done (Admin guide, section 5). Time taken: ______ minutes.
- [ ] The **tamper check** was run: no changes found.
- [ ] **Speed check** was run: Dashboard ______ s, Month-end overview ______ s.

## E. Rules and billing
- [ ] **Rule test report:** all cases pass (Attendance rules → Rule test report). Printed and signed.
- [ ] The parallel-run month is complete and signed (`PARALLEL_RUN.md`).
- [ ] The first month's bill matches the manual bill (or each difference is explained).

## F. People
- [ ] The Ops manager has had training: daily SOP, exceptions, month-end, and parallel-run check.
- [ ] Supervisors know what to do when the tablet is down (keep the register for that day; enter manual punches later).
- [ ] The Admin guide and the Ops Manager manual are printed and kept at the Ops desk.

## Sign-off
| | Name | Signature | Date |
|---|---|---|---|
| IT (Admin) | | | |
| Ops manager | | | |
| Unit head | | | |

**Go-live date:** __________ (start on the 1st of a month, so the first bill is fully from the system).
