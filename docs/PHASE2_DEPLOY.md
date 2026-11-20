# OutSource Connect: Phase 2 deployment guide (tablet)

Time needed: about 1.5 hours. You need `outsource-connect-phase2.zip`, your Web app URL from Phase 1, a PC with Chrome, and the Galaxy Tab S9 FE.

What Phase 2 adds:
- The **kiosk app** for the tablet: face punching, enrollment, and an offline queue.
- Console pages for **Tablet**, **Punches** and **Unrecognised faces**, plus **Enroll face** on each staff page.
- **Faster sign-in**: the password check now takes about 1 second instead of 2.

> The zip does **not** contain `console/config.js`, so your working console settings are not overwritten.

---

## Part A. Update the server (10 minutes)

1. Open the Google Sheet **OutSource Connect DB**, then **Extensions**, then **Apps Script**.
2. Open `Code.gs`, select everything (**Ctrl+A**), delete it, and paste the new `apps-script\dist\Code.gs` from the zip. Press **Ctrl+S**.
3. Go back to the Sheet and reload the page. Choose **OutSource Connect**, then **1. Run setup (safe to repeat)**.
   It adds the new tabs: Devices, Heartbeats, EnrollRequests, FaceData, FaceThumbs, StaffState, UnrecognisedFaces and Punches_2026. Your existing data is not touched.
4. Google may ask for permission again, because Phase 2 saves photos in Drive. Allow it as you did in Phase 1.
5. In Apps Script, click **Deploy**, then **Manage deployments**. Click the **pencil (Edit)**, set **Version** to **New version**, add the description `Phase 2`, and click **Deploy**.
   The Web app URL stays the same. **Do not** use "New deployment".
6. Sign in to the console once. Your password is then upgraded to the faster setting automatically. **Check password speed** in the Sheet menu should now show about 1,000 ms.

## Part B. Upload the new files to GitHub (15 minutes)

1. On your PC, open `kiosk\config.js` from the unzipped folder with Notepad. Replace `PASTE_YOUR_WEB_APP_URL_HERE` with the **same Web app URL** that is in `console/config.js`, and save.
2. Open your GitHub repository `outsource-connect`. Click **Add file**, then **Upload files**.
3. Drag **everything inside the unzipped folder** onto the page. This includes the new `kiosk` folder. GitHub replaces changed files and adds new ones. Your `console/config.js` stays as it is, because it is not in the zip.
4. Click **Commit changes**. Wait about 2 minutes for GitHub Pages to update.
5. The tablet address is your console address with `kiosk/` instead of `console/`:
   **`https://<your-github-username>.github.io/outsource-connect/kiosk/`**
6. Check on your PC: open that address. You should see the dark **Tablet setup** screen with a code box. You don't need to enter anything on the PC.

## Part C. Create the tablet's setup code (2 minutes)

1. In the console, sign in as **Admin** and open **Tablet** in the left menu. Click **Add tablet** and name it, for example "Main lobby".
2. A **setup code** appears, like `TAB1-ABCD-EFGH-…`. It is shown **only once**. Keep this window open until the tablet is connected (Part D, step 14).
   If the code is lost, click **Remove tablet** and add it again.

> The setup code is the tablet's password. It is never stored on GitHub. Every message from the tablet is signed with it, so nobody can send fake punches to the server.

---

## Part D. Prepare and lock the Galaxy Tab S9 FE (45 minutes)

Do these steps in order. The menu names are from One UI 6 (Android 14) and may differ slightly on other versions.

### D1. Basics
1. Charge the tablet. Go to **Settings**, then **Software update**, then **Download and install**, and install all updates.
2. **Settings → Connections → Wi-Fi**: connect to the hospital Wi-Fi. Open the Wi-Fi network's settings and set **Auto reconnect** to on.
3. **Settings → General management → Date and time**: turn on **Automatic date and time**. Time zone: India Standard Time.
4. **Settings → Lock screen → Screen lock type → PIN**: set a 6-digit PIN known only to the Admin and IT. The PIN is needed to leave kiosk mode and after a restart. Staff never use it.

### D2. Keep the screen on and the battery healthy
5. **Settings → Display → Screen timeout**: 10 minutes. The app also keeps the screen awake by itself.
6. **Settings → Display**: set **Auto rotate** to off, and keep the tablet in **landscape**.
7. **Settings → Battery → More battery settings**: turn on **Protect battery** (charges to 85%, which is best for a tablet that is always plugged in).
8. **Settings → Battery → Background usage limits → Never sleeping apps**: add **Chrome**.
9. Turn on developer options: **Settings → About tablet → Software information**, then tap **Build number** 7 times and enter the PIN. Then go to **Settings → Developer options** and turn on **Stay awake** (the screen never sleeps while charging).

### D3. Quiet tablet
10. **Settings → Notifications**: turn on **Do not disturb**. In its settings, choose **Always**.
11. **Settings → Advanced features → Side button**: set **Press and hold** to **Power off menu**, so long-pressing does not open Bixby.
12. **Settings → Display → Edge panels**: off. **Settings → Advanced features → Labs / Multi window**: turn off the swipe gestures.

### D4. Install the kiosk app
13. Open **Chrome** and go to the kiosk address. Tap **⋮**, then **Add to Home screen**, then **Install**. An icon **OS Kiosk** appears.
14. Open **OS Kiosk** from the home screen; it opens full screen. Type the setup code from Part C, without worrying about dashes or capital letters, and tap **Connect**. Allow the **camera** when asked.
15. The app loads the face models (only the first time, about 10 seconds) and then shows the dark idle screen with a dim clock.
16. Tap the screen once. This turns on sound for the beeps. After a daily restart, tap once again if the beep is missing.
17. In Chrome, tap **⋮ → Settings → Site settings**, then the kiosk site: set **Camera** to Allow and **Sound** to Allow.

### D5. Lock the tablet to the app (screen pinning)
18. **Settings → Security and privacy → More security settings → Pin app**: turn it on. Inside it, turn on **Ask for PIN before unpinning**.
19. Open **OS Kiosk**. Tap the **Recents** button (three lines). At the top of the OS Kiosk card, tap the **app icon**, then **Pin this app**.
20. Now nobody can leave the app. To leave it (Admin only), press and hold **Back + Recents** together, then enter the PIN.

### D6. Mount it
21. Mount the tablet at about 1.3 m (face height), in landscape, with the camera on top, facing away from windows or strong lights behind people.
22. Keep it **on the charger at all times**. A lockable wall enclosure that covers the buttons is strongly recommended. It is the only way to stop someone pressing the power button.
23. **Settings → Security and privacy → Lost device protection (Find My Mobile)**: on, signed in with the hospital Samsung or Google account.

> Honest limits of the free route: screen pinning stops casual use, but someone with the PIN, or who holds the power button, can still get out. The enclosure and keeping the PIN private close most of that gap. Paid Samsung Knox kiosk mode is not used.

---

## Part E. Enroll and test (15 minutes)

1. In the console, open **Staff** and choose a person. Click **Enroll face**.
2. Within about 15 seconds the tablet shows **"Enrolling: <name>, <ID>"**. The person stands in front of it, without cap or mask, and looks straight at the camera. The tablet takes 5 photos in about 2 seconds, checking light, sharpness and distance.
3. Then the tablet asks for a **test punch**: the person looks at the camera again. It shows **Face enrolled**. The test punch is **not** attendance.
4. The console window shows each step: Requested, InProgress, Captured, Done.
5. Now the person walks up to the tablet normally. The screen lights up, asks for a blink, and shows green **IN accepted** with a beep.
6. Open **Punches** in the console. The punch is listed with its time, and **Photo** opens the proof photo.

If someone is often not recognised, open their staff page and click **Add another sample**. This adds photos without removing the old ones.

---

## Day to day

| Situation | What happens |
|---|---|
| Internet down | Punches are saved on the tablet ("Saved on tablet · will sync") and sent when the internet returns. Nothing is lost. |
| Tablet silent | The console **Tablet** page shows **Silent** after 15 minutes. Email alerts arrive in Phase 5. |
| Camera stops | The app restarts the camera by itself, and reloads after 3 failed tries. |
| Every night at 03:30 | The app reloads itself quietly. You can change the time in **Settings**. |
| Staff member exits | Their face stops working on the tablet within about 15 seconds. |
| Recognition too strict or too loose | **Settings → Face match strictness** (default 0.45: lower is stricter). Change it only in small steps, such as 0.43 or 0.47, and note why. |
| Tablet replaced | **Tablet → Remove tablet** for the old one, then **Add tablet** for the new one. First check that "Waiting to sync" is 0. |

## Troubleshooting

| What you see on the tablet | What to do |
|---|---|
| "That code is not complete" | Retype the setup code. Every group has 4 characters, plus `TAB1` at the start. |
| "This tablet is not registered" | The tablet was removed in the console. Add a new one and type the new code. |
| "Tablet time differs from the server" | Turn on **Automatic date and time** on the tablet (D1, step 3). |
| "Camera permission is blocked" | Chrome, then **Site settings**, then the kiosk site: set Camera to Allow. |
| No beep | Tap the screen once (step 16). Check that the volume is up. |
| Old screens after an update | Unpin the tablet, close OS Kiosk from Recents, open it again, and pin it again. |
