const express = require('express');
const db = require('../db');
const config = require('../config');
const {
  requireAdmin,
  verifyCredentials,
  setSessionCookie,
  clearSessionCookie,
} = require('../middleware/adminAuth');
const { generateMagicLinkToken } = require('../utils/codes');
const { sendEmail, paymentConfirmedEmail } = require('../utils/email');

const router = express.Router();

function magicLinkUrl(token) {
  return `${config.baseUrl}/edit/${token}`;
}

// --- Auth (unprotected) -----------------------------------------------------

/** POST /api/admin/login — set the admin session cookie. */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!verifyCredentials(username, password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  setSessionCookie(res);
  return res.json({ ok: true });
});

/** POST /api/admin/logout */
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

// --- Everything below requires admin auth -----------------------------------
router.use(requireAdmin);

/** GET /api/admin/me — confirm the session is valid. */
router.get('/me', (req, res) => res.json({ ok: true, username: config.admin.username }));

/**
 * GET /api/admin/orders?status=pending_payment|paid
 */
router.get('/orders', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = db('orders')
      .leftJoin('templates', 'orders.template_id', 'templates.id')
      .leftJoin('invitations', 'invitations.order_id', 'orders.id')
      .select(
        'orders.*',
        'templates.name as template_name',
        'invitations.id as invitation_id',
        'invitations.status as invitation_status',
        'invitations.slug as invitation_slug'
      )
      .orderBy('orders.created_at', 'desc');

    if (status) query.where('orders.status', status);

    const orders = await query;
    return res.json({ orders });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/admin/orders/:id/mark-paid
 * Marks the order paid, creates the linked invitation (draft, with a magic
 * token) if not already present, and emails the customer their magic link.
 */
router.post('/orders/:id/mark-paid', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const order = await db('orders').where({ id: orderId }).first();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const template = await db('templates').where({ id: order.template_id }).first();

    // Generate the token outside the transaction (it does its own collision check).
    let invitation = await db('invitations').where({ order_id: order.id }).first();
    let magicToken = invitation ? invitation.magic_link_token : await generateMagicLinkToken();

    await db.transaction(async (trx) => {
      if (order.status !== 'paid') {
        await trx('orders').where({ id: order.id }).update({
          status: 'paid',
          paid_at: trx.fn.now(),
        });
      }

      if (!invitation) {
        const [created] = await trx('invitations')
          .insert({
            order_id: order.id,
            template_id: order.template_id,
            status: 'draft',
            magic_link_token: magicToken,
            custom_fields: '{}',
          })
          .returning('*');
        invitation = created;
      }
    });

    const magicLink = magicLinkUrl(magicToken);

    const { subject, html } = paymentConfirmedEmail({
      customerName: order.customer_name,
      magicLink,
      templateName: template ? template.name : null,
    });
    const emailResult = await sendEmail({ to: order.email, subject, html });

    return res.json({
      ok: true,
      order: { id: order.id, status: 'paid' },
      invitation: { id: invitation.id, magic_link_token: magicToken },
      magicLink,
      email: emailResult,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/admin/invitations?status=draft|published|archived
 */
router.get('/invitations', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = db('invitations')
      .leftJoin('orders', 'invitations.order_id', 'orders.id')
      .leftJoin('templates', 'invitations.template_id', 'templates.id')
      .select(
        'invitations.*',
        'orders.customer_name',
        'orders.email',
        'orders.reference_code',
        'templates.name as template_name'
      )
      .orderBy('invitations.created_at', 'desc');

    if (status) query.where('invitations.status', status);

    const invitations = await query;
    // don't leak the raw token in the list beyond what admin needs; it's admin-only anyway
    return res.json({ invitations });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/admin/invitations/:id/resend-magic-link
 */
router.post('/invitations/:id/resend-magic-link', async (req, res, next) => {
  try {
    const invitation = await db('invitations').where({ id: req.params.id }).first();
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

    const order = await db('orders').where({ id: invitation.order_id }).first();
    const template = await db('templates').where({ id: invitation.template_id }).first();
    const magicLink = magicLinkUrl(invitation.magic_link_token);

    const { subject, html } = paymentConfirmedEmail({
      customerName: order ? order.customer_name : '',
      magicLink,
      templateName: template ? template.name : null,
    });
    const emailResult = await sendEmail({ to: order.email, subject, html });

    return res.json({ ok: true, magicLink, email: emailResult });
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/admin/invitations/:id/archive-at  { archive_at: ISO | null }
 */
router.patch('/invitations/:id/archive-at', async (req, res, next) => {
  try {
    const { archive_at } = req.body || {};
    const invitation = await db('invitations').where({ id: req.params.id }).first();
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

    let value = null;
    if (archive_at) {
      const d = new Date(archive_at);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid archive_at' });
      value = d.toISOString();
    }

    await db('invitations').where({ id: invitation.id }).update({
      archive_at: value,
      updated_at: db.fn.now(),
    });

    return res.json({ ok: true, archive_at: value });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/admin/invitations/:id/status  { status: draft|published|archived }
 * Lets an admin manually archive/unarchive.
 */
router.post('/invitations/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const invitation = await db('invitations').where({ id: req.params.id }).first();
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

    await db('invitations').where({ id: invitation.id }).update({
      status,
      updated_at: db.fn.now(),
    });
    return res.json({ ok: true, status });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
