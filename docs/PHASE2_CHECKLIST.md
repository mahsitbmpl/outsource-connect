# Phase 2 checklist: verify on the real tablet before Phase 3

Tick each item. Note anything odd (time, what you saw, the tablet's battery) and send it to me.

## Server and console
- [ ] **Run setup** added the new tabs (Devices, FaceData, Punches_2026 and the others), and old data is unchanged.
- [ ] **Check password speed** shows about 1,000 ms after you have signed in once.
- [ ] The console shows the new menu items: **Punches**, **Unrecognised faces** and **Tablet**.
- [ ] An Ops manager can see the Tablet page but cannot add or remove a tablet.

## Tablet set-up and lock
- [ ] A wrong or short setup code is refused with a clear message.
- [ ] The right code connects. The idle screen is dark, with a dim clock that moves now and then.
- [ ] Console **Tablet** page: Online, battery %, Charging, Camera working, and "Waiting to sync" 0.
- [ ] Screen pinning: Home and Recents do nothing. **Back + Recents** asks for the PIN.
- [ ] Notifications do not appear on the tablet (Do not disturb is on).
- [ ] The screen stays on for 1 hour without anyone touching it.

## Enrollment (3 people)
- [ ] **Enroll face** in the console: the tablet switches to "Enrolling: <name>, <ID>" within 15 seconds.
- [ ] Too far, too dark or a turned head gives a clear hint (Come closer, Too dark, Look straight).
- [ ] 5 photos, then the test punch, then "Face enrolled". The test punch is **not** in Punches.
- [ ] Try to enroll person B with person A standing in front: it stops with "already enrolled as <A's ID>".
- [ ] **Cancel enrollment** in the console brings the tablet back to normal.

## Punching
- [ ] The first punch of the day shows green **IN accepted** with name, ID, time and a beep.
- [ ] The same person again within 3 minutes shows yellow **Already punched** and adds no new punch.
- [ ] After 3 minutes the same person shows blue **OUT recorded**, with "This duty: x h y m".
- [ ] Two people at once: only the person closest to the tablet is read.
- [ ] A printed photo or a phone photo of an enrolled person held up to the camera is **not** accepted (no blink).
- [ ] A person who is not enrolled gets red **Not recognised**, and the photo appears under **Unrecognised faces**.
- [ ] **Punches** page: every punch has the right time, and **Photo** opens the proof photo.

## Offline
- [ ] Switch off Wi-Fi on the router (or the tablet's Wi-Fi, briefly unpinning). Punch 2 people: the screen shows "Saved on tablet · will sync".
- [ ] Switch Wi-Fi back on: within a minute the punches appear in the console, marked "offline", with the **original** punch times.
- [ ] Changing the tablet's clock while offline does not change the punch times (they follow the server clock).

## Recovery
- [ ] Unplug the charger for 10 minutes: the console shows the battery dropping and Charging off.
- [ ] Restart the tablet: unlock with the PIN, open **OS Kiosk** from the home screen (it does not start by itself after a restart) and pin it again. It works without entering the setup code again.
- [ ] Mark one test person as exited: within about 15 seconds the tablet no longer recognises them.

## Accuracy over the first week (write down)
- [ ] Number of "Not recognised" for enrolled staff per day: ______ (aim: under 1 in 20 punches)
- [ ] Any wrong person ever accepted? ______ (must be 0; if it happens, tell me at once)
