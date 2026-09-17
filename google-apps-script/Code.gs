/**
 * ============================================================================
 *  MLBM Website Inquiry Handler — Google Apps Script
 * ============================================================================
 *
 *  What this does, every time someone submits the website form:
 *    1. Receives the form fields (name, email, service, message, terms).
 *    2. Ignores spam bots (hidden "honeypot" field).
 *    3. Validates the fields.
 *    4. Appends one row to the "Inquiries" tab of this Google Sheet.
 *    5. Emails a notification to melody@mlbmrep.com.
 *       (The visitor does NOT get an email. The website sends them to
 *        thank-you.html instead.)
 *    6. Replies to the website with JSON: { ok: true } or { ok: false, error }.
 *
 *  Where this code lives:
 *    Open the Google Sheet → Extensions → Apps Script → paste this file
 *    into Code.gs. Because the script is "bound" to the sheet,
 *    SpreadsheetApp.getActiveSpreadsheet() always points at that sheet.
 *
 *  Full setup steps are in README.md.
 * ============================================================================
 */

/* ----------------------------------------------------------------------------
 * 1. SETTINGS — the only part you normally edit
 * ------------------------------------------------------------------------- */
const CONFIG = {
  // Who receives the "new inquiry" email. Add more with commas:
  // 'melody@mlbmrep.com, someone@else.com'
  NOTIFY_EMAIL: 'melody@mlbmrep.com',

  // Tab name inside the spreadsheet. Created automatically if missing.
  SHEET_NAME: 'Inquiries',

  // Sender display name shown in Melody's inbox.
  SENDER_NAME: 'MLBM Website',

  // Used only if someone submits with JavaScript turned off.
  // Replace with your live Netlify / custom domain.
  THANK_YOU_URL: 'https://YOUR-SITE.netlify.app/thank-you.html',
};

/* ----------------------------------------------------------------------------
 * 2. COLUMNS — one entry per spreadsheet column, left to right.
 *    `key`      = the form field's name="" attribute in index.html
 *    `label`    = the column header in the sheet and the email
 *    `required` = reject the submission if empty
 *    `max`      = trim anything longer than this many characters
 *
 *    To add a new form field later: add an input to index.html with a
 *    name, add a line here with the same key, redeploy (see README).
 * ------------------------------------------------------------------------- */
const FIELDS = [
  { key: 'name',           label: 'Name',           required: true, max: 120  },
  { key: 'email',          label: 'Email',          required: true, max: 200  },
  { key: 'service',        label: 'Service',        required: true, max: 120  },
  { key: 'message',        label: 'Message',        required: true, max: 5000 },
  { key: 'terms_accepted', label: 'Terms accepted', required: true, max: 10   },
  { key: 'page',           label: 'Page URL',       required: false, max: 500 },
];

/* ============================================================================
 * 3. ENTRY POINTS
 * ========================================================================= */

/**
 * doPost runs whenever the website POSTs to the Web App URL.
 * `e.parameter` holds the submitted fields as { fieldName: value }.
 */
function doPost(e) {
  const params = (e && e.parameter) || {};
  const wantsJson = params._ajax === '1'; // set by site.js

  try {
    // --- Spam trap -------------------------------------------------------
    // Humans never see the "_honey" field, so only bots fill it.
    // We pretend it worked so the bot moves on, but save nothing.
    if (params._honey) {
      return respond_(wantsJson, { ok: true });
    }

    // --- Validate --------------------------------------------------------
    const clean = {};
    for (const f of FIELDS) {
      const value = String(params[f.key] || '').trim().slice(0, f.max);
      if (f.required && !value) {
        return respond_(wantsJson, { ok: false, error: 'Missing field: ' + f.label });
      }
      clean[f.key] = value;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
      return respond_(wantsJson, { ok: false, error: 'Invalid email address' });
    }

    // --- Save to the sheet ------------------------------------------------
    const submittedAt = new Date();
    saveRow_(submittedAt, clean);

    // --- Notify Melody ---------------------------------------------------
    // If the email fails (e.g. daily quota reached) the row is already
    // saved, so we still report success to the visitor and log the error.
    try {
      sendNotification_(submittedAt, clean);
    } catch (mailErr) {
      console.error('Notification email failed: ' + mailErr);
    }

    return respond_(wantsJson, { ok: true });

  } catch (err) {
    console.error('doPost failed: ' + (err && err.stack ? err.stack : err));
    return respond_(wantsJson, { ok: false, error: 'Server error' });
  }
}

/**
 * doGet runs if you open the Web App URL in a browser.
 * Handy as a quick "is it deployed?" check.
 */
function doGet() {
  return ContentService
    .createTextOutput('MLBM inquiry endpoint is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/* ============================================================================
 * 4. HELPERS
 * ========================================================================= */

/** Appends one submission as a new row. */
function saveRow_(submittedAt, clean) {
  // A lock stops two submissions arriving at the same moment from
  // writing over each other.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_();
    const row = [submittedAt].concat(FIELDS.map(f => safeCell_(clean[f.key])));
    sheet.appendRow(row);
    sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('yyyy-mm-dd hh:mm');
  } finally {
    lock.releaseLock();
  }
}

/** Returns the Inquiries tab, creating it with headers if needed. */
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    const headers = ['Submitted'].concat(FIELDS.map(f => f.label));
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0a0909')
      .setFontColor('#c7a86c');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(5, 420); // Message column wider
  }
  return sheet;
}

/**
 * Stops "formula injection": if a visitor types something like
 * =HYPERLINK(...) the sheet would run it. A leading apostrophe makes
 * Sheets treat it as plain text.
 */
function safeCell_(value) {
  const s = String(value == null ? '' : value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/** Sends the notification email to Melody. */
function sendNotification_(submittedAt, clean) {
  const tz = Session.getScriptTimeZone();
  const when = Utilities.formatDate(submittedAt, tz, "MMM d, yyyy 'at' h:mm a z");
  const sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();

  const rows = FIELDS.map(f =>
    '<tr>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e8e2d7;color:#766e63;font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:top;white-space:nowrap">' + esc_(f.label) + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e8e2d7;color:#0a0909;font-size:15px;white-space:pre-wrap">' + esc_(clean[f.key] || '—') + '</td>' +
    '</tr>'
  ).join('');

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background:#f3f0e8">' +
      '<div style="background:#0a0909;color:#c7a86c;padding:22px 24px;font-size:18px">New website inquiry</div>' +
      '<div style="padding:20px 24px;color:#0a0909">' +
        '<p style="margin:0 0 16px">' + esc_(clean.name) + ' sent an inquiry on ' + esc_(when) + '.</p>' +
        '<table style="width:100%;border-collapse:collapse;background:#ffffff">' + rows + '</table>' +
        '<p style="margin:20px 0 0">Reply to this email to respond directly to ' + esc_(clean.name) + '.</p>' +
        '<p style="margin:8px 0 0"><a href="' + sheetUrl + '" style="color:#8a6d38">Open the inquiries sheet</a></p>' +
      '</div>' +
    '</div>';

  const text =
    'New website inquiry (' + when + ')\n\n' +
    FIELDS.map(f => f.label + ': ' + (clean[f.key] || '-')).join('\n') +
    '\n\nSheet: ' + sheetUrl;

  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: 'New inquiry: ' + clean.name + ' — ' + clean.service,
    body: text,
    htmlBody: html,
    name: CONFIG.SENDER_NAME,
    replyTo: clean.email, // "Reply" goes straight to the visitor
  });
}

/** Escapes text for safe use inside the HTML email. */
function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Builds the reply to the website.
 * - JavaScript submissions (normal case) get JSON.
 * - No-JavaScript submissions get a small page linking to the thank-you page.
 */
function respond_(wantsJson, payload) {
  if (wantsJson) {
    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const msg = payload.ok
    ? 'Thank you. Your inquiry was received.'
    : 'Your inquiry could not be sent: ' + esc_(payload.error);
  const link = payload.ok ? CONFIG.THANK_YOU_URL : 'javascript:history.back()';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:40px;text-align:center">' +
      '<p>' + msg + '</p>' +
      '<p><a href="' + link + '" target="_top">Continue</a></p>' +
    '</div>'
  ).setTitle('MLBM');
}

/* ============================================================================
 * 5. ONE-TIME SETUP & TESTING — run these from the Apps Script editor
 * ========================================================================= */

/**
 * Run once: creates the "Inquiries" tab with headers and makes Google
 * ask for the permissions the script needs (Sheets + send email).
 */
function setup() {
  getSheet_();
  console.log('Setup complete. Sheet tab "' + CONFIG.SHEET_NAME + '" is ready.');
}

/**
 * Simulates a real submission without touching the website.
 * Adds a test row and sends a test email to NOTIFY_EMAIL.
 */
function testSubmission() {
  const result = doPost({
    parameter: {
      _ajax: '1',
      name: 'Test Visitor',
      email: 'test@example.com',
      service: 'Brand creation',
      message: 'This is a test submission from the Apps Script editor.',
      terms_accepted: 'Yes',
      page: 'apps-script-test',
    },
  });
  console.log(result.getContent());
}
