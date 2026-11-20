# OutSource Connect: Phase 1 deployment guide

Time needed: about 1 to 1.5 hours, once. Work on a PC with Google Chrome.
You need the file `outsource-connect-phase1.zip`. Unzip it to a folder, for example `Documents\outsource-connect`.

What you will have at the end:
- A Google Sheet that holds all the data, with the server code inside it.
- The console website, which Ops managers and the Admin open on PC or phone.
- Your Admin sign-in, set up and working.

---

## Part A. Create the two free accounts (15 minutes)

Use accounts owned by the hospital, not personal ones, so the system stays with the hospital if people change jobs.

1. **Google account.** Go to `accounts.google.com/signup` and create an account, for example `outsource.connect.mah@gmail.com`. Write the password in the IT password register.
2. Turn on **2-Step Verification**: go to `myaccount.google.com/security` and follow the steps. Use the hospital IT mobile number.
3. **GitHub account.** Go to `github.com/signup` and sign up with the same email. Choose a username such as `mah-outsource-connect`.
4. Turn on **two-factor authentication** in GitHub: profile picture, then **Settings**, then **Password and authentication**.

> From here on, stay signed in to Chrome with the new Google account only. If Chrome is signed in to several Google accounts, Apps Script can mix them up. Use a separate Chrome profile if needed (profile icon at the top right of Chrome, then **Add**).

---

## Part B. Create the database and server (20 minutes)

1. Go to `sheets.new`. A blank Google Sheet opens. Click the title "Untitled spreadsheet" and name it **OutSource Connect DB**.
2. In the menu choose **Extensions**, then **Apps Script**. A new tab opens with the code editor.
3. At the top left, click **Untitled project** and rename it **OutSource Connect Server**.
4. You see a file `Code.gs` with a few lines in it. Click inside the code, press **Ctrl+A**, then **Delete**, so it is empty.
5. On your PC, open the file `apps-script\dist\Code.gs` from the unzipped folder with **Notepad** (right-click, **Open with**, **Notepad**). Press **Ctrl+A**, then **Ctrl+C**.
6. Go back to the Apps Script tab, click inside the empty `Code.gs`, press **Ctrl+V**, then **Ctrl+S** to save.
7. Click the **gear icon (Project Settings)** on the left:
   - Tick **Show "appsscript.json" manifest file in editor**.
   - Set **Time zone** to **(GMT+05:30) India Standard Time**.
8. Click the **< > (Editor)** icon on the left. A file `appsscript.json` is now listed. Open it, select everything, delete it, and paste the contents of `apps-script\dist\appsscript.json` (open it in Notepad the same way). Press **Ctrl+S**.
9. At the top, next to **Run**, there is a drop-down that shows a function name. Choose **setup**, then click **Run**.
10. Google asks for permission:
    - Click **Review permissions** and choose the new Google account.
    - You will see "Google hasn't verified this app". This appears because the script is your own and not published. Click **Advanced**, then **Go to OutSource Connect Server (unsafe)**, then **Allow**.
11. Wait until the **Execution log** at the bottom says "Execution completed". Switch to the Google Sheet tab: a message box shows the **Admin username (admin)** and a **temporary password**. **Write the temporary password down now.** It is also in the Execution log.
12. In the Sheet you now see tabs such as Settings, Departments, Companies, Rates, Staff, Users and AuditLog. **Do not type into these tabs by hand.** Always use the console.

### Publish the server as a web app

13. In the Apps Script tab, click the blue **Deploy** button (top right), then **New deployment**.
14. Click the **gear icon** next to "Select type" and choose **Web app**.
15. Fill in:
    - Description: `Phase 1`
    - Execute as: **Me**
    - Who has access: **Anyone**
16. Click **Deploy**. If asked, authorise again as in step 10.
17. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy...long.../exec`. Paste it into Notepad and keep it.
18. **Test it:** open that URL in a new Chrome tab. You should see a line of text containing `"status":"running"`.

> "Who has access: Anyone" is required, because the console calls the server from the internet. The data stays protected: every action needs a username and password, and only your Google account can open the Sheet.

**Optional speed check:** in the Sheet, a new menu **OutSource Connect** appears after you reload the page. Choose **Check password speed**. If it says more than 2,000 ms, tell me and I will lower the setting.

---

## Part C. Put the console website online (20 minutes)

1. Open the unzipped folder, then open `console\config.js` with Notepad. Replace `PASTE_YOUR_WEB_APP_URL_HERE` with your Web app URL, keeping the quotes:
   ```
   apiUrl: 'https://script.google.com/macros/s/AKfy.../exec'
   ```
   Save the file.
2. Sign in to GitHub. Click **+** at the top right, then **New repository**.
   - Repository name: `outsource-connect`
   - Choose **Public**. Free GitHub Pages needs a public repository. No staff data ever goes into it, only program code.
   - Tick **Add a README file**.
   - Click **Create repository**.
3. In the new repository click **Add file**, then **Upload files**.
4. Open the unzipped folder in Windows Explorer. Select **everything inside it** (the folders `console`, `apps-script`, `shared`, `docs`, `tests`, `tools` and the other files) and drag it all onto the GitHub page. Wait until every file is listed.
5. At the bottom, click **Commit changes**.
6. Click **Settings** (top menu of the repository), then **Pages** on the left.
   - Under **Build and deployment**, Source: **Deploy from a branch**.
   - Branch: **main**, folder **/ (root)**. Click **Save**.
7. Wait 1 to 3 minutes and refresh the page. A box shows "Your site is live at `https://<your-github-username>.github.io/outsource-connect/`".
8. Your console address is that address followed by `console/`:
   **`https://<your-github-username>.github.io/outsource-connect/console/`**
   Save it as a bookmark.

---

## Part D. First sign-in and set-up (20 minutes)

1. Open the console address. Sign in with username **admin** and the temporary password from Part B.
2. Choose your own password: at least 10 characters, letters and numbers. You are now on the Home page.
3. **Settings** (left menu, Admin section): check Organisation name, email times (09:00 and 17:30) and the title list. Email lists can wait for Phase 5.
4. **Departments**: click **Edit** on each department and enter the real required headcount for Day and Night.
5. **Users**: click **Add user** for each Ops manager. A temporary password appears **once**. Give it to the person directly, not on WhatsApp. They must change it at first sign-in.
6. **Companies & rates**: click **Add company** for each service provider, then **Add rate** for every department and designation it serves (Staff and Supervisor). The rate is per 12-hour duty.
7. **Staff**: either click **Add staff** for each person, or use **Import Excel / CSV** with the template on that page.

### Practice with fake data (optional)

In the Google Sheet menu choose **OutSource Connect**, then **Add demo data (fake)**. It adds 2 demo companies and 30 demo staff. Explore the console, then choose **Remove demo data** before you enter real staff. Employee ID numbers restart after you remove the demo data.

### Install the console on a phone

On the Ops manager's Android phone, open the console address in Chrome. Tap the **⋮ menu**, then **Add to Home screen** (or **Install app**). It now opens like an app called **OS Connect**.

---

## When I send you an update (every later phase)

1. Open the Apps Script editor (Sheet, then **Extensions**, then **Apps Script**). Replace all the code in `Code.gs` with the new `Code.gs` and save.
2. In the Sheet menu choose **OutSource Connect**, then **1. Run setup (safe to repeat)**. This adds any new tabs or columns. Existing data is never deleted.
3. Click **Deploy**, then **Manage deployments**. Click the **pencil (Edit)** icon, set **Version** to **New version**, and click **Deploy**.
   **Do not use "New deployment".** That creates a new address and the console stops working.
4. In GitHub, upload the changed files the same way as Part C, step 4. Keep **your own `console/config.js`**: do not overwrite it.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| Console says "The server address is not set" | `console/config.js` still has the placeholder. Edit it in GitHub (open the file, pencil icon), paste the Web app URL and commit. |
| Console says "The server sent an unexpected reply" | In Apps Script, Deploy, then Manage deployments: "Who has access" must be **Anyone**. |
| "Could not reach the server" | Check the internet. Open the Web app URL directly to see if it answers. |
| Admin password lost or account locked | Sheet menu **OutSource Connect**, then **Reset Admin password**. A new temporary password is shown. |
| Ops manager locked out | Admin opens **Users** and clicks **Unlock / reset**. Accounts also unlock by themselves after 30 minutes. |
| A tab or column seems missing | Sheet menu **OutSource Connect**, then **1. Run setup**. |
| Old screen after an update | Close the console fully and open it again, or press **Ctrl+F5** on PC. |
