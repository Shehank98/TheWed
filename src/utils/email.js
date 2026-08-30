const config = require('../config');

/**
 * Email delivery via a Google Apps Script web app.
 *
 * Deploy docs/appscript-email.gs as a Web App and put its /exec URL in
 * GOOGLE_APPSCRIPT_EMAIL_URL. We POST JSON { secret, to, subject, html, fromName }.
 * The script sends the mail with GmailApp/MailApp and returns { ok: true }.
 *
 * If the URL is not configured we log the email instead of sending, so the
 * rest of the flow keeps working in local/dev without email set up.
 */
async function sendEmail({ to, subject, html }) {
  if (!config.email.appScriptUrl) {
    console.log('[email] GOOGLE_APPSCRIPT_EMAIL_URL not set — email not sent. Preview:');
    console.log(`[email] to=${to} subject=${subject}`);
    return { ok: false, skipped: true, reason: 'not_configured' };
  }

  const payload = {
    secret: config.email.sharedSecret,
    to,
    subject,
    html,
    fromName: config.email.fromName,
  };

  try {
    const res = await fetch(config.email.appScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    if (!res.ok || body.ok === false) {
      console.error('[email] Apps Script responded with an error:', res.status, text);
      return { ok: false, status: res.status, body };
    }
    return { ok: true, body };
  } catch (err) {
    console.error('[email] Failed to reach Apps Script:', err.message);
    return { ok: false, error: err.message };
  }
}

function baseWrapper(innerHtml) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f1ec;font-family:Georgia,'Times New Roman',serif;color:#3b342c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.06);">
            <tr>
              <td style="background:#b08d57;padding:28px 32px;text-align:center;">
                <div style="font-size:22px;letter-spacing:3px;color:#fff;text-transform:uppercase;">TheWed</div>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px;line-height:1.6;font-size:16px;">
                ${innerHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px;background:#faf8f4;color:#9a9088;font-size:12px;text-align:center;">
                Made with love · TheWed digital invitations
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * "Payment confirmed — set up your invitation here" email.
 */
function paymentConfirmedEmail({ customerName, magicLink, templateName }) {
  const subject = 'Your payment is confirmed — let’s build your invitation';
  const html = baseWrapper(`
    <h1 style="font-size:24px;margin:0 0 16px;color:#3b342c;">Thank you${customerName ? `, ${escapeHtml(customerName)}` : ''}! 🎉</h1>
    <p style="margin:0 0 14px;">Your payment for the <strong>${escapeHtml(templateName || 'wedding invitation')}</strong> template has been confirmed.</p>
    <p style="margin:0 0 24px;">You can now set up your invitation — add your names, wedding date, venue, your story, and photos. When you’re ready, publish it and share the link with your guests.</p>
    <p style="text-align:center;margin:0 0 28px;">
      <a href="${magicLink}" style="display:inline-block;background:#b08d57;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;letter-spacing:0.5px;">Build my invitation</a>
    </p>
    <p style="margin:0 0 6px;font-size:13px;color:#9a9088;">Or paste this private link into your browser:</p>
    <p style="margin:0;font-size:13px;word-break:break-all;color:#b08d57;">${magicLink}</p>
    <p style="margin:24px 0 0;font-size:13px;color:#9a9088;">Keep this link private — anyone with it can edit your invitation.</p>
  `);
  return { subject, html };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  sendEmail,
  paymentConfirmedEmail,
  baseWrapper,
  escapeHtml,
};
