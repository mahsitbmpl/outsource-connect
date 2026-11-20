# Update 2.1: faster sign-in and console (10 minutes)

1. **Server.** In the Google Sheet, open **Extensions**, then **Apps Script**. Open `Code.gs`, select all, delete, paste the new `apps-script\dist\Code.gs`, and save.
2. Click **Deploy**, then **Manage deployments**. Click the **pencil**, set **Version** to **New version**, and click **Deploy**. (Do not use "New deployment".)
3. **Website.** In GitHub, choose **Add file**, then **Upload files**. Drag everything from the unzipped folder and click **Commit changes**.
   This zip does **not** contain `console/config.js` or `kiosk/config.js`, so your Web app URL stays as it is.
4. Sign in to the console once. Your password is quietly re-saved with the new fast method.
5. In the Sheet menu choose **OutSource Connect**, then **Check password speed**. You should now see the sign-in password check in tens of milliseconds, not seconds.
6. In the console, open your **user menu** (top right). It shows how long the last server reply took and how much of that was our code. The rest is Google starting the script and the network.

If a page still feels slow, note the numbers from step 6 and send them to me.
