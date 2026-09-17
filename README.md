# MLBM — Mogul Luxury Brand Management website

Static website for MLBM, ready for Netlify. The inquiry form saves every submission to a Google Sheet and emails a notification to **melody@mlbmrep.com**. The visitor receives no email; they are sent to a thank-you page.

---

## 1. What's in this folder

```
index.html              Home page (services, process, inquiry form)
roster.html             Talent roster
privacy.html            Privacy Notice (updated to describe Google Sheets)
terms.html              Service Terms
thank-you.html          Page shown after a successful inquiry
404.html                "Page not found" page (Netlify uses it automatically)
netlify.toml            Netlify settings (security headers, caching, hides docs)
assets/
  styles.css            All styling
  site.js               All interactivity + form submission
  mlbm-logo.png
  hero-editorial.png
google-apps-script/
  Code.gs               The backend: saves to Google Sheet + emails Melody
README.md               This file
```

`netlify.toml` blocks public access to `README.md` and `google-apps-script/`, so they can safely live in the deployed folder.

---

## 2. What changed in this version

**Headings.** Every heading was reduced by roughly 35–45% (hero, section titles, "Creator to Company", roster, legal pages, thank-you page). Line height was opened up slightly so the smaller sizes read comfortably.

**Interactivity.**
- The header now stays at the top while you scroll and turns into a blurred dark bar once you leave the hero.
- A thin gold progress bar at the top shows how far down the page you are.
- The hero plays one entrance sequence on load, and the background image moves slightly slower than the page as you scroll.
- The navigation underlines the section you're currently viewing.
- Sections reveal in a staggered sequence instead of all at once.
- "2022" and "360°" count up when they come into view.
- Service rows, process steps, roster names, and past-roster cards respond on hover. The "Creator to Company" deliverables appear one by one.
- The mobile menu animates into an X, locks page scrolling while open, and closes with the Escape key.
- Roster numbering and the "Current roster / Past collaborations" totals are now calculated from the lists. Add or remove a name in `roster.html` and the numbers update themselves.
- All motion is switched off for visitors who have "reduce motion" enabled on their device.

**Form.**
- FormSubmit was removed and replaced with Google Sheets + Apps Script.
- Fields are checked inline, with a specific message under each field that needs fixing.
- The button shows "Sending…" with a spinner while the submission is in progress.
- If sending fails, the visitor sees a clear message with Melody's email as a fallback.

**Other.**
- Added a "skip to content" link for keyboard users and visible focus outlines.
- Added a branded 404 page and social-sharing meta tags.
- Added `?v=2` to CSS/JS links so returning visitors get the new files instead of cached old ones. **Bump this number (`?v=3`, …) whenever you edit `styles.css` or `site.js`.**

---

## 3. Connecting the form (one-time setup, about 10 minutes)

> Do this in the Google account that should own the data. If `melody@mlbmrep.com` is a Google Workspace account, use that account — the notification emails will then be sent from Melody's own address.

### Step 1 — Create the Google Sheet
1. Go to <https://sheets.new>.
2. Name it something like **MLBM Website Inquiries**.

### Step 2 — Add the script
1. In the sheet, open **Extensions → Apps Script**.
2. Delete everything in `Code.gs`.
3. Paste in the full contents of `google-apps-script/Code.gs`.
4. At the top, check the `CONFIG` block:
   - `NOTIFY_EMAIL` is already `melody@mlbmrep.com`.
   - Set `THANK_YOU_URL` to your live site, e.g. `https://mlbm.netlify.app/thank-you.html`. (Only used for visitors with JavaScript turned off.)
5. Click the **Save** icon.

### Step 3 — Authorize and test
1. In the function dropdown at the top of the editor, choose **`setup`** and click **Run**.
2. Google will ask for permission. Click **Review permissions**, pick the account, then **Advanced → Go to (project name) → Allow**.
   The warning appears because this is your own unpublished script; that's normal.
3. Back in the sheet, an **Inquiries** tab now exists with a gold-on-black header row.
4. Choose **`testSubmission`** and click **Run**. You should see a test row in the sheet and a test email in Melody's inbox. Delete the test row afterward.

### Step 4 — Publish the script as a Web App
1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy** and copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfycb…/exec`

"Anyone" is required because website visitors aren't signed in to Google. They can only submit the form; they can't see the sheet.

### Step 5 — Paste the URL into the website
Open `index.html`, find this line (search for `PASTE_YOUR_DEPLOYMENT_ID`):

```html
<form class="inquiry-form reveal" id="inquiry-form"
      action="https://script.google.com/macros/s/PASTE_YOUR_DEPLOYMENT_ID/exec" …>
```

Replace the whole `action` value with your Web app URL. Save.

### Step 6 — Deploy to Netlify
- **Drag and drop:** go to <https://app.netlify.com/drop> and drop the folder (or the ZIP).
- **Existing site:** Netlify → your site → **Deploys** → drag the folder onto the deploy area.

Then submit the live form once to confirm: a row appears in the sheet, Melody gets an email, and you land on the thank-you page.

---

## 4. How the connection works (detailed explanation)

```
Visitor fills form ──► site.js validates ──► POST to Apps Script Web App
                                                   │
                                   ┌───────────────┼────────────────┐
                                   ▼               ▼                ▼
                           spam check        append row to      email to
                           (honeypot)        "Inquiries" tab    melody@mlbmrep.com
                                                   │
                           JSON { ok: true } ◄─────┘
                                   │
Visitor ◄── redirected to thank-you.html
```

### 4.1 The front end (`assets/site.js`)

The form keeps a normal HTML `action` pointing at the Apps Script URL, but JavaScript takes over on submit:

1. **Validation.** Each required field is checked. If one is empty or the email is malformed, a message appears under that field and the cursor moves to the first problem. Nothing is sent.
2. **Endpoint check.** If the `action` still contains `PASTE_`, the form shows "not connected yet" instead of silently failing.
3. **Packing the data.**
   ```js
   var data = new URLSearchParams(new FormData(form));
   data.set('_ajax', '1');                 // tells the script to reply in JSON
   data.set('page', window.location.href); // which page the inquiry came from
   ```
   `URLSearchParams` sends the fields as `application/x-www-form-urlencoded`. Browsers treat that as a "simple request", so they skip the CORS preflight check that Apps Script can't answer. This is the key detail that makes a static site talk to Apps Script reliably.
4. **Sending.**
   ```js
   fetch(endpoint, { method: 'POST', body: data })
   ```
   Google answers with a redirect to `script.googleusercontent.com`; `fetch` follows it automatically and that final response allows cross-site reading, so the page can read the JSON.
5. **Result.** If the reply is `{ "ok": true }`, the browser goes to `thank-you.html`. Otherwise (error reply, no internet, or no answer within 25 seconds) the button resets and an error message with Melody's email appears.

**Spam protection.** The form has a hidden field named `_honey`. People can't see it, but bots fill in every field. If it has any value, the script pretends to succeed and saves nothing.

### 4.2 The back end (`google-apps-script/Code.gs`)

**`doPost(e)`** runs for every submission. `e.parameter` holds the fields, e.g. `e.parameter.email`.

1. **Honeypot.** If `_honey` is filled, return success and stop.
2. **Validation.** Loops over the `FIELDS` list, trims each value, cuts it to its max length, and rejects the submission if a required field is empty or the email doesn't look like an email. The server checks again even though the browser already did, because anyone can send requests straight to the URL.
3. **`saveRow_()`** adds the row.
   - `LockService` makes simultaneous submissions wait their turn so rows never overwrite each other.
   - `getSheet_()` finds the **Inquiries** tab, or creates it with a styled header row the first time.
   - `safeCell_()` puts an apostrophe in front of any value starting with `=`, `+`, `-` or `@`. Without it, a visitor could type a spreadsheet formula and the sheet would run it.
4. **`sendNotification_()`** emails Melody with `MailApp.sendEmail`:
   - a clean HTML table of the answers (all text escaped so nobody can inject HTML), plus a plain-text version;
   - subject like `New inquiry: Jane Doe — Brand creation`;
   - **`replyTo` is set to the visitor's email**, so Melody can hit Reply and answer them directly;
   - a link to open the sheet.
   The email step is wrapped in its own `try/catch`: if it fails (for example, the daily limit is reached) the row is already saved, the error is logged, and the visitor still sees the thank-you page.
5. **`respond_()`** replies with JSON for JavaScript submissions. For the rare visitor with JavaScript disabled, it returns a small page with a link to `THANK_YOU_URL`.

**`doGet()`** returns "MLBM inquiry endpoint is running." Open the Web app URL in a browser to confirm the deployment is live.

**`setup()`** and **`testSubmission()`** are helpers you run by hand from the editor.

### 4.3 Sheet layout

| Submitted | Name | Email | Service | Message | Terms accepted | Page URL |
|---|---|---|---|---|---|---|

Timestamps use the script's time zone: **Apps Script editor → Project Settings → Time zone** (set it to America/Chicago for Illinois).

---

## 5. Maintenance

**Editing the script later.** Saving the code is not enough; the live URL keeps running the old version until you redeploy:
**Deploy → Manage deployments → pencil icon → Version: New version → Deploy.**
Choose "Manage deployments", not "New deployment", so the URL stays the same and the website doesn't need changing.

**Adding a form field.**
1. Add the input to the form in `index.html` with a `name`, e.g. `<input name="instagram">`.
2. Add a line to `FIELDS` in `Code.gs`: `{ key: 'instagram', label: 'Instagram', required: false, max: 200 },`
3. Add a matching column header in the sheet (in the same position), redeploy the script as above, and redeploy the site.

**Changing who gets notified.** Edit `NOTIFY_EMAIL` (comma-separate multiple addresses) and redeploy the script.

**Adding a roster name.** Copy an existing `<li>` or `<article class="past-card">` in `roster.html`. Numbering and totals update automatically.

**Changing CSS or JS.** Bump `?v=2` in every HTML file so browsers load the new version.

---

## 6. Limits and troubleshooting

| Issue | Fix |
|---|---|
| Form says "not connected yet" | The `action` in `index.html` still has the placeholder. Paste the Web app URL. |
| Form says "did not send" | Open the Web app URL in a browser. If it doesn't show "endpoint is running", redeploy with **Who has access: Anyone**. |
| Row saved but no email | Check **Apps Script → Executions** for the logged error. Check Melody's spam folder. |
| Changes to the script have no effect | Redeploy with a **New version** (see section 5). |
| Emails stop partway through the day | Google caps script emails per day (roughly 100 for free Gmail accounts, more for Workspace). Rows are still saved. |
| Permission error when running `setup` | Run it again and complete the **Advanced → Allow** step. |

**Privacy.** The sheet is private to its owner and anyone they share it with. `privacy.html` was updated to say inquiries go to a private Google Sheet and that visitors don't get an automated email. Review it if you change how data is handled.
