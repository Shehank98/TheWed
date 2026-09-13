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
 * 4. Deploy -> New deployment -> type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    (The first deploy asks you to authorise the "Send email as you" scope.)
 * 5. Copy the Web app URL (ends in /exec) into the backend's
 *    GOOGLE_APPSCRIPT_EMAIL_URL env var.
 *
 * The backend POSTs JSON: { secret, to, subject, html, fromName, replyTo }
 * and expects a JSON reply: { ok: true } on success.
 *
 * QUOTA: a normal Gmail account can send ~100 emails/day; Google Workspace
 * accounts ~1500/day. MailApp.getRemainingDailyQuota() reports what's left.
 */

var SHARED_SECRET = 'CHANGE_ME_to_match_EMAIL_SHARED_SECRET';

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'empty request body' });
    }

    var body = JSON.parse(e.postData.contents);

    // Reject if a secret is configured and doesn't match.
    if (SHARED_SECRET && body.secret !== SHARED_SECRET) {
      return json({ ok: false, error: 'unauthorized' });
    }
    if (!body.to || !body.subject) {
      return json({ ok: false, error: 'missing to/subject' });
    }

    var html = body.html || '';

    var options = {
      to: String(body.to),
      subject: String(body.subject),
      htmlBody: html,
      // Plain-text fallback improves deliverability (fewer spam flags).
      body: htmlToPlainText(html) || String(body.subject),
      name: body.fromName || 'TheWed',
    };
    if (body.replyTo) {
      options.replyTo = String(body.replyTo);
    }

    MailApp.sendEmail(options);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Health check — open the /exec URL in a browser to confirm it's live.
function doGet() {
  return json({
    ok: true,
    service: 'thewed-email',
    remainingQuota: MailApp.getRemainingDailyQuota(),
  });
}

// Very small HTML -> text reducer for the plain-text alternative part.
function htmlToPlainText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
