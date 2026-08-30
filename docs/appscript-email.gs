/**
 * TheWed — Email sender (Google Apps Script Web App)
 * ---------------------------------------------------
 * This receives POST requests from the TheWed backend and sends the email
 * from your Gmail / Google Workspace account.
 *
 * SETUP
 * 1. Go to https://script.google.com and create a new project.
 * 2. Paste this file's contents into Code.gs.
 * 3. Set SHARED_SECRET below to a long random string and put the SAME value
 *    in the backend's EMAIL_SHARED_SECRET env var.
 * 4. Deploy → New deployment → type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Copy the Web app URL (ends in /exec) into the backend's
 *    GOOGLE_APPSCRIPT_EMAIL_URL env var.
 *
 * The backend POSTs JSON: { secret, to, subject, html, fromName }
 * and expects a JSON reply: { ok: true } on success.
 */

var SHARED_SECRET = 'CHANGE_ME_to_match_EMAIL_SHARED_SECRET';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');

    if (SHARED_SECRET && body.secret !== SHARED_SECRET) {
      return json({ ok: false, error: 'unauthorized' });
    }
    if (!body.to || !body.subject) {
      return json({ ok: false, error: 'missing to/subject' });
    }

    MailApp.sendEmail({
      to: body.to,
      subject: body.subject,
      htmlBody: body.html || '',
      name: body.fromName || 'TheWed',
    });

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, service: 'thewed-email' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
