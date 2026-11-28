# OutSource Connect: update 6.1 (speed, kiosk self-repair, ignore, filters, bulk dismiss)

Time needed: about 15 minutes. This update includes **new kiosk files**, so the tablet must be updated too (step 6).

## What changed

### 1. Web app speed
Most of the waiting was Google starting the script for every single request (1 to 3 seconds each). Now:
- **Pages you have opened before appear at once**, even after closing the browser. The latest data loads quietly in the background, and the page updates by itself if something changed.
- **Several requests travel together.** After sign-in, the dashboard, exceptions, staff, companies, tablet, today's punches and more are loaded in **one** request, so the first click on each page is quick too.
- **The server remembers answers.** If a page is asked for again and nothing was saved since, the server answers from memory without opening the Google Sheet. Any save makes the answers fresh at once.
- The Exceptions page now loads only the dates it needs, instead of 45 days of duties.
- After **you** save something, pages wait up to 2.5 seconds for fresh data, so you never see the old state of your own change.

In tests with the server slowed to 2.5 seconds per request, previously opened pages appeared in **0.1 to 0.3 seconds**. The very first page after a long quiet period can still take Google 2 to 4 seconds once; this cannot be avoided with the free Google service.

To see the timing, open the user menu (top right). It shows the time of the last request and whether the server answered "from server memory".

### 2. Kiosk tablet (version 3.1.0): the "not punching in the evening" problem
**Causes found:**
- After long idle hours, or after the screen turned off and on, the camera picture could **freeze**, or a face-detection step inside the tablet's graphics chip could **get stuck**.
- The app had no check for either. It waited forever, and only closing and reopening the app helped.

**Fixes:**
- **Stuck check:** if one recognition round takes more than 8 seconds, it is abandoned and the camera is restarted. If it happens twice in a row, the app restarts itself in a few seconds.
- **Frozen picture check:** every 5 seconds the app checks that the camera picture is moving. If not, it restarts the camera, and after a few tries the whole app.
- **Screen on again / app back in front:** the camera and the face loop are woken up at once.
- **Graphics reset by Android:** the app restarts itself.
- **Faster recognition:**
  - The camera now runs at 640×480 instead of 1280×720: one third of the work per picture, and still enough for faces.
  - While nobody is in front, a lighter face search is used.
  - The face models are warmed up at start, so the first person is not slow.
- **Slow-down check:** if recognition becomes 3 times slower than when the app started, or memory fills up, the app refreshes itself when nobody is in front of it.
- The console **Tablet** page now shows **Health of the face app**: running time, recognition speed, camera size, self-repairs, and the reason for the last automatic restart.

### 3. Exceptions: Ignore
- Each item has **Ignore**. You can also tick several items (or **Select all shown**) and press **Ignore selected**. A reason and a note are required.
- An ignored item leaves the list **without changing any hours**:
  - an ignored Missing IN/OUT counts 0 hours for that duty;
  - ignored hours over 12 are not billed;
  - ignored items no longer block the month lock.
- Items are **not deleted**: choose **Ignored** in the drop-down to see them (with who and why), and **Restore** any of them.
- Locked months cannot be changed.

### 4. Punches: date filters
- Quick choices: **Today, Yesterday, Last 7 days, This month, Last month**, or any **From–To** range (up to 62 days).
- Filter by **IN/OUT** and **department**, search by **name or ID**, and download a **CSV**.

### 5. Unrecognised faces: dismiss many at once
- Tick boxes, **Select all shown**, **Dismiss selected**, and **Dismiss all shown**.
- Date filters (Today, Yesterday, …, From–To) and a status filter (Open, Dismissed, Assigned, All).

## Steps

1. **Server:** paste the new `apps-script\dist\Code.gs` into Apps Script and save.
2. Reload the Sheet and run **OutSource Connect → 1. Run setup** (adds the tablet health column).
3. **Deploy → Manage deployments → pencil → New version → Deploy.**
4. **GitHub:** upload all files (console and kiosk folders included). Your `config.js` files are not in the zip.
5. **Console:** press **Ctrl+F5** once. On phones, close and reopen the browser tab.
6. **Tablet:** open the kiosk, then pull down to refresh, or close it from Recents and open it again. After at most one more restart, the small line on the waiting screen shows **v3.1.0**, and the console **Tablet** page shows app version 3.1.0. The setup code is **not** needed again.

## Tablet settings that matter (your IT tablet, until the real kiosk set-up)

These prevent most evening problems even before the self-repair is needed:

| Setting | Where (Samsung) | Set to |
|---|---|---|
| Keep the screen on while charging | Settings → About tablet → Software information → tap **Build number** 7 times → back → **Developer options** → **Stay awake** | On, and keep the tablet **plugged in** |
| Do not put Chrome to sleep | Settings → Battery → **Background usage limits** | **Put unused apps to sleep**: Off; add Chrome to **Never sleeping apps** |
| Adaptive battery | Settings → Battery → More battery settings | Off |
| Open the kiosk as an app | Chrome → kiosk page → ⋮ → **Add to home screen → Install**. Then always open it from that icon. | Full screen, no address bar |
| Do not clear site data | Chrome → Settings → Privacy | Never "Clear browsing data" for the kiosk site. It holds the tablet's secret and any punches not yet sent. |
| Evening light | At the tablet | A light on the face side (ceiling or wall light in front of the person), not a bright window or lamp behind them |

If something still goes wrong, open **Tablet** in the console and look at **Health of the face app**. Send me the line "Self-repairs …" and the reason for the last restart.

## For the parallel run from 1 December
- Clear old Exceptions before 1 December. Use **Ignore** for test data from the trial days, with the note "Trial period".
- Dismiss the trial-period unrecognised photos with **Dismiss all shown** (filter: This month).
