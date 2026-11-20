# Update 2.2: faster page changes (10 minutes)

Same steps as update 2.1:
1. Apps Script: replace all of `Code.gs` with the new `apps-script\dist\Code.gs` and save. Then click **Deploy**, then **Manage deployments**, then the **pencil**, set **Version** to **New version**, and click **Deploy**.
2. GitHub: **Add file**, then **Upload files**. Drag everything from the unzipped folder and click **Commit changes**. Both `config.js` files are left out, so your settings stay.
3. Open the console and press **Ctrl+F5** once (on a phone, close the app and open it again) so the new version loads.

What changes:
- **Pages you've already opened** (Staff, Punches, Companies and the others) appear at once. Fresh data loads in the background, and the page updates by itself if something changed.
- **Staff, Companies, Punches, Unrecognised faces and Tablet** are fetched quietly after you sign in, so even the first click on them is quick.
- **Any change you save** (for example adding staff) makes the console fetch fresh data again.

If a page you haven't opened yet is still slow, open your **user menu** (top right) and send me the line "Last server reply … (our code …)".
