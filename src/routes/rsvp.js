const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * POST /api/rsvp/:slug — submit an RSVP from the public invitation page.
 */
router.post('/:slug', async (req, res, next) => {
  try {
    const invitation = await db('invitations').where({ slug: req.params.slug }).first();
    if (!invitation || invitation.status !== 'published') {
      return res.status(404).json({ error: 'This invitation is not accepting RSVPs' });
    }

    const { guest_name, attending, guest_count, message, meal_preference } = req.body || {};

    if (!guest_name || !String(guest_name).trim()) {
      return res.status(400).json({ error: 'guest_name is required' });
    }

    const isAttending =
      attending === true || attending === 'true' || attending === 'yes' || attending === 1 || attending === '1';

    let count = Number(guest_count);
    if (!Number.isFinite(count) || count < 0) count = isAttending ? 1 : 0;
    count = Math.min(Math.round(count), 50); // sane upper bound

    const [rsvp] = await db('rsvps')
      .insert({
        invitation_id: invitation.id,
        guest_name: String(guest_name).trim().slice(0, 200),
        attending: isAttending,
        guest_count: count,
        message: message ? String(message).trim().slice(0, 2000) : null,
        meal_preference: meal_preference ? String(meal_preference).trim().slice(0, 100) : null,
      })
      .returning('*');

    return res.status(201).json({
      ok: true,
      rsvp: {
        id: rsvp.id,
        guest_name: rsvp.guest_name,
        attending: rsvp.attending,
        guest_count: rsvp.guest_count,
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
