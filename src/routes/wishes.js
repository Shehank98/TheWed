const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * POST /api/wishes/:slug — submit a guestbook wish from the public page.
 * Wishes are visible by default; the couple can hide any from their dashboard.
 */
router.post('/:slug', async (req, res, next) => {
  try {
    const invitation = await db('invitations').where({ slug: req.params.slug }).first();
    if (!invitation || invitation.status !== 'published') {
      return res.status(404).json({ error: 'This guestbook is not available' });
    }

    const { guest_name, message } = req.body || {};
    if (!guest_name || !String(guest_name).trim()) {
      return res.status(400).json({ error: 'Your name is required' });
    }
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'A message is required' });
    }

    const [wish] = await db('guest_wishes')
      .insert({
        invitation_id: invitation.id,
        guest_name: String(guest_name).trim().slice(0, 200),
        message: String(message).trim().slice(0, 2000),
        approved: true,
      })
      .returning('*');

    return res.status(201).json({
      ok: true,
      wish: { guest_name: wish.guest_name, message: wish.message, created_at: wish.created_at },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
