const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const QRCode = require('qrcode');
const db = require('../db');
const config = require('../config');
const drive = require('../utils/drive');
const { generateUniqueSlug, generateGuestToken } = require('../utils/codes');
const { renderPayload, loadImages, normalizeSchedule, loadEvents, EVENT_TYPES } = require('../utils/serialize');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Only image uploads are allowed'));
  },
});

const IMAGE_TYPES = ['hero', 'gallery', 'couple'];

// --- Helpers ----------------------------------------------------------------

async function loadByToken(token) {
  const invitation = await db('invitations').where({ magic_link_token: token }).first();
  if (!invitation) return null;
  const order = await db('orders').where({ id: invitation.order_id }).first();
  const template = await db('templates').where({ id: invitation.template_id }).first();
  return { invitation, order, template };
}

// ===========================================================================
// Public render data (Phase 4)
// ===========================================================================

/** GET /api/invitations/public/:slug */
router.get('/public/:slug', async (req, res, next) => {
  try {
    const invitation = await db('invitations').where({ slug: req.params.slug }).first();
    if (!invitation || invitation.status === 'draft') {
      return res.status(404).json({ error: 'not_found' });
    }
    if (invitation.status === 'archived') {
      return res.status(410).json({ error: 'archived' });
    }
    const template = await db('templates').where({ id: invitation.template_id }).first();
    const images = await loadImages(invitation.id);
    const payload = renderPayload(invitation, template, images);

    // Approved wishes (guestbook) + live confirmed-guest count for first paint.
    const wishes = await db('guest_wishes')
      .where({ invitation_id: invitation.id, approved: true })
      .orderBy('created_at', 'desc')
      .limit(200);
    payload.wishes = wishes.map((w) => ({
      guest_name: w.guest_name,
      message: w.message,
      created_at: w.created_at,
    }));

    // Events, gated by guest (?g=token). Private events are EXCLUDED from the
    // response unless the guest is explicitly assigned to them (Phase 2/8).
    const allEvents = await loadEvents(invitation);
    const guestToken = (req.query.g || '').toString();
    let guest = null;
    let allowedPrivate = new Set();
    if (guestToken) {
      guest = await db('guests').where({ invitation_id: invitation.id, unique_token: guestToken }).first();
      if (guest) {
        const access = await db('guest_event_access').where({ guest_id: guest.id });
        allowedPrivate = new Set(access.map((a) => Number(a.event_id)));
      }
    }
    payload.events = allEvents.filter((e) => !e.isPrivate || allowedPrivate.has(Number(e.id)));
    if (guest) payload.guestName = guest.guest_name;

    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

/** GET /api/invitations/public/:slug/wishes — approved wishes for live refresh. */
router.get('/public/:slug/wishes', async (req, res, next) => {
  try {
    const invitation = await db('invitations').where({ slug: req.params.slug }).first();
    if (!invitation || invitation.status !== 'published') return res.status(404).json({ error: 'not_found' });
    const wishes = await db('guest_wishes')
      .where({ invitation_id: invitation.id, approved: true })
      .orderBy('created_at', 'desc')
      .limit(200);
    return res.json({
      wishes: wishes.map((w) => ({ guest_name: w.guest_name, message: w.message, created_at: w.created_at })),
    });
  } catch (err) {
    return next(err);
  }
});


// ===========================================================================
// Editor (Phase 3) — all keyed by magic_link_token
// ===========================================================================

/** GET /api/invitations/token/:token — editor data */
router.get('/token/:token', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const images = await loadImages(ctx.invitation.id);
    const payload = renderPayload(ctx.invitation, ctx.template, images);
    payload.order = ctx.order
      ? {
          reference_code: ctx.order.reference_code,
          customer_name: ctx.order.customer_name,
          email: ctx.order.email,
        }
      : null;
    payload.invitation.id = ctx.invitation.id;
    payload.publicUrl = ctx.invitation.slug ? `${config.baseUrl}/i/${ctx.invitation.slug}` : null;
    payload.archiveAt = ctx.invitation.archive_at;
    payload.events = await loadEvents(ctx.invitation);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

/** PUT /api/invitations/token/:token — update draft fields */
router.put('/token/:token', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    if (ctx.invitation.status === 'archived') {
      return res.status(410).json({ error: 'This invitation is archived and can no longer be edited' });
    }

    const b = req.body || {};
    const update = { updated_at: db.fn.now() };

    if ('groom_name' in b) update.groom_name = b.groom_name || null;
    if ('bride_name' in b) update.bride_name = b.bride_name || null;
    if ('wedding_date' in b) update.wedding_date = b.wedding_date || null;
    if ('wedding_time' in b) update.wedding_time = b.wedding_time || null;
    if ('venue_name' in b) update.venue_name = b.venue_name || null;
    if ('venue_address' in b) update.venue_address = b.venue_address || null;
    if ('story_text' in b) update.story_text = b.story_text || null;
    if ('custom_fields' in b) {
      let cf = b.custom_fields;
      if (typeof cf === 'string') {
        try {
          cf = JSON.parse(cf);
        } catch {
          return res.status(400).json({ error: 'custom_fields must be valid JSON' });
        }
      }
      update.custom_fields = JSON.stringify(cf || {});
    }
    if ('schedule' in b) {
      let sc = b.schedule;
      if (typeof sc === 'string') {
        try {
          sc = JSON.parse(sc);
        } catch {
          return res.status(400).json({ error: 'schedule must be valid JSON' });
        }
      }
      update.schedule = JSON.stringify(normalizeSchedule(sc));
    }
    if ('map_link' in b) update.map_link = b.map_link ? String(b.map_link).slice(0, 4000) : null;
    if ('music_url' in b) update.music_url = b.music_url ? String(b.music_url).slice(0, 2000) : null;
    if ('language_default' in b) {
      const lang = ['en', 'si', 'ta'].includes(b.language_default) ? b.language_default : 'en';
      update.language_default = lang;
    }
    if ('meal_pref_enabled' in b) update.meal_pref_enabled = Boolean(b.meal_pref_enabled);

    await db('invitations').where({ id: ctx.invitation.id }).update(update);
    const refreshed = await db('invitations').where({ id: ctx.invitation.id }).first();
    const images = await loadImages(ctx.invitation.id);
    const out = renderPayload(refreshed, ctx.template, images);
    out.events = await loadEvents(refreshed);
    return res.json(out);
  } catch (err) {
    return next(err);
  }
});

// ===========================================================================
// Events (Phase 1) — CRUD, keyed by magic_link_token
// ===========================================================================

function cleanEvent(e) {
  const type = EVENT_TYPES.includes(e.event_type) ? e.event_type : 'Custom';
  return {
    event_name: String(e.event_name || '').slice(0, 200),
    event_type: type,
    event_date: e.event_date || null,
    event_time: e.event_time ? String(e.event_time).slice(0, 50) : null,
    venue_name: e.venue_name ? String(e.venue_name).slice(0, 300) : null,
    venue_address: e.venue_address ? String(e.venue_address).slice(0, 600) : null,
    map_link: e.map_link ? String(e.map_link).slice(0, 4000) : null,
    sort_order: Number.isFinite(Number(e.sort_order)) ? Number(e.sort_order) : 0,
    is_private: Boolean(e.is_private),
  };
}

/** GET /api/invitations/token/:token/events */
router.get('/token/:token/events', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const events = await db('invitation_events')
      .where({ invitation_id: ctx.invitation.id })
      .orderByRaw('sort_order asc, event_date asc nulls last, id asc');
    return res.json({ events });
  } catch (err) {
    return next(err);
  }
});

/**
 * PUT /api/invitations/token/:token/events — sync the full event list.
 * Body: { events: [{ id?, event_name, event_type, event_date, event_time,
 *                     venue_name, venue_address, map_link, sort_order }] }
 * Upserts by id, inserts new (no id), deletes rows not present — preserving ids
 * for untouched events so per-guest access assignments stay valid.
 */
router.put('/token/:token/events', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const incoming = Array.isArray(req.body.events) ? req.body.events : [];

    const existing = await db('invitation_events').where({ invitation_id: ctx.invitation.id });
    const existingIds = new Set(existing.map((e) => e.id));
    const keptIds = [];

    await db.transaction(async (trx) => {
      for (let i = 0; i < incoming.length; i += 1) {
        const raw = incoming[i];
        const data = cleanEvent({ ...raw, sort_order: raw.sort_order != null ? raw.sort_order : i });
        const id = Number(raw.id);
        if (id && existingIds.has(id)) {
          await trx('invitation_events').where({ id, invitation_id: ctx.invitation.id }).update(data);
          keptIds.push(id);
        } else {
          const [created] = await trx('invitation_events')
            .insert({ ...data, invitation_id: ctx.invitation.id })
            .returning('id');
          keptIds.push(typeof created === 'object' ? created.id : created);
        }
      }
      const toDelete = [...existingIds].filter((eid) => !keptIds.includes(eid));
      if (toDelete.length) {
        await trx('invitation_events').whereIn('id', toDelete).del();
      }
    });

    const events = await db('invitation_events')
      .where({ invitation_id: ctx.invitation.id })
      .orderByRaw('sort_order asc, event_date asc nulls last, id asc');
    return res.json({ ok: true, events });
  } catch (err) {
    return next(err);
  }
});

/** POST /api/invitations/token/:token/images — upload one image to Drive */
router.post('/token/:token/images', upload.single('image'), async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    if (!req.file) return res.status(400).json({ error: 'No image file provided (field name: image)' });

    const image_type = String(req.body.image_type || 'gallery');
    if (!IMAGE_TYPES.includes(image_type)) {
      return res.status(400).json({ error: `image_type must be one of ${IMAGE_TYPES.join(', ')}` });
    }

    if (!drive.isConfigured()) {
      return res.status(503).json({
        error: 'Image storage is not configured on the server (Google Drive service account missing).',
      });
    }

    // hero is single — replace any existing hero.
    if (image_type === 'hero') {
      const existingHero = await db('invitation_images')
        .where({ invitation_id: ctx.invitation.id, image_type: 'hero' })
        .first();
      if (existingHero) {
        await drive.deleteFile(existingHero.drive_file_id).catch(() => {});
        await db('invitation_images').where({ id: existingHero.id }).del();
      }
    }

    const folderName = `invitation-${ctx.invitation.order_id}`;
    const ext = (req.file.originalname.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
    const filename = `${image_type}-${Date.now()}${ext}`;

    const { fileId, url } = await drive.uploadImage({
      folderName,
      filename,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    });

    const maxPos = await db('invitation_images')
      .where({ invitation_id: ctx.invitation.id, image_type })
      .max('position as m')
      .first();
    const position = (maxPos && maxPos.m != null ? Number(maxPos.m) : -1) + 1;

    const [image] = await db('invitation_images')
      .insert({
        invitation_id: ctx.invitation.id,
        drive_file_id: fileId,
        drive_url: url,
        image_type,
        position,
      })
      .returning('*');

    return res.status(201).json({
      image: { id: image.id, url: image.drive_url, driveFileId: image.drive_file_id, image_type, position },
    });
  } catch (err) {
    return next(err);
  }
});

/** DELETE /api/invitations/token/:token/images/:image_id */
router.delete('/token/:token/images/:image_id', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });

    const image = await db('invitation_images')
      .where({ id: req.params.image_id, invitation_id: ctx.invitation.id })
      .first();
    if (!image) return res.status(404).json({ error: 'Image not found' });

    await drive.deleteFile(image.drive_file_id).catch(() => {});
    await db('invitation_images').where({ id: image.id }).del();

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/** POST /api/invitations/token/:token/publish */
router.post('/token/:token/publish', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const inv = ctx.invitation;

    // Events (Phase 1) — the new source of dates/venues; single wedding_date is
    // a legacy fallback so older invitations keep publishing.
    const events = await loadEvents(inv);
    const datedEvents = events.filter((e) => e.date);

    // Validate required fields.
    const missing = [];
    if (!inv.groom_name) missing.push('groom_name');
    if (!inv.bride_name) missing.push('bride_name');
    if (!datedEvents.length && !inv.wedding_date) missing.push('at least one event with a date');
    if (missing.length) {
      return res.status(400).json({ error: 'Please fill in all required fields before publishing', missing });
    }

    // Generate slug (keep existing on re-publish).
    const slug = inv.slug || (await generateUniqueSlug(inv.groom_name, inv.bride_name, inv.id));

    // archive_at = latest event date (or wedding_date) + 90 days
    const dateStrings = datedEvents.map((e) => e.date);
    if (inv.wedding_date) dateStrings.push(new Date(inv.wedding_date).toISOString().slice(0, 10));
    const latest = dateStrings.sort().pop();
    const baseDate = latest ? new Date(latest + 'T00:00:00Z') : new Date();
    const archiveAt = new Date(baseDate.getTime());
    archiveAt.setUTCDate(archiveAt.getUTCDate() + 90);

    await db('invitations').where({ id: inv.id }).update({
      slug,
      status: 'published',
      archive_at: archiveAt.toISOString(),
      updated_at: db.fn.now(),
    });

    return res.json({
      ok: true,
      slug,
      status: 'published',
      publicUrl: `${config.baseUrl}/i/${slug}`,
      archive_at: archiveAt.toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

// ===========================================================================
// RSVP dashboard + export (Phase 5)
// ===========================================================================

/** GET /api/invitations/token/:token/rsvps */
router.get('/token/:token/rsvps', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });

    const rsvps = await db('rsvps')
      .where({ invitation_id: ctx.invitation.id })
      .orderBy('submitted_at', 'desc');

    const attending = rsvps.filter((r) => r.attending);
    const notAttending = rsvps.filter((r) => !r.attending);
    const totalGuests = attending.reduce((sum, r) => sum + (Number(r.guest_count) || 0), 0);

    return res.json({
      rsvps,
      summary: {
        totalResponses: rsvps.length,
        attendingResponses: attending.length,
        notAttendingResponses: notAttending.length,
        totalGuests,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/** GET /api/invitations/token/:token/rsvps/export — .xlsx download */
router.get('/token/:token/rsvps/export', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });

    const rsvps = await db('rsvps')
      .where({ invitation_id: ctx.invitation.id })
      .orderBy('submitted_at', 'asc');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TheWed';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('RSVPs');

    sheet.columns = [
      { header: 'Guest Name', key: 'guest_name', width: 28 },
      { header: 'Attending', key: 'attending', width: 12 },
      { header: 'Guest Count', key: 'guest_count', width: 14 },
      { header: 'Message', key: 'message', width: 50 },
      { header: 'Submitted At', key: 'submitted_at', width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };

    rsvps.forEach((r) => {
      sheet.addRow({
        guest_name: r.guest_name,
        attending: r.attending ? 'Yes' : 'No',
        guest_count: r.guest_count,
        message: r.message || '',
        submitted_at: new Date(r.submitted_at).toISOString(),
      });
    });

    const attending = rsvps.filter((r) => r.attending);
    const totalGuests = attending.reduce((sum, r) => sum + (Number(r.guest_count) || 0), 0);
    sheet.addRow({});
    const totalRow = sheet.addRow({ guest_name: 'TOTAL ATTENDING GUESTS', guest_count: totalGuests });
    totalRow.font = { bold: true };

    const coupleName =
      [ctx.invitation.groom_name, ctx.invitation.bride_name].filter(Boolean).join('-') || 'invitation';
    const safeName = coupleName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="rsvps-${safeName}.xlsx"`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    return next(err);
  }
});

// ===========================================================================
// Guestbook moderation (dashboard) — approve/hide wishes
// ===========================================================================

/** GET /api/invitations/token/:token/wishes — all wishes (approved + hidden). */
router.get('/token/:token/wishes', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const wishes = await db('guest_wishes')
      .where({ invitation_id: ctx.invitation.id })
      .orderBy('created_at', 'desc');
    return res.json({ wishes });
  } catch (err) {
    return next(err);
  }
});

/** PATCH /api/invitations/token/:token/wishes/:id — { approved: bool } */
router.patch('/token/:token/wishes/:id', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const wish = await db('guest_wishes')
      .where({ id: req.params.id, invitation_id: ctx.invitation.id })
      .first();
    if (!wish) return res.status(404).json({ error: 'Wish not found' });
    await db('guest_wishes').where({ id: wish.id }).update({ approved: Boolean(req.body.approved) });
    return res.json({ ok: true, approved: Boolean(req.body.approved) });
  } catch (err) {
    return next(err);
  }
});

/** DELETE /api/invitations/token/:token/wishes/:id */
router.delete('/token/:token/wishes/:id', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    await db('guest_wishes').where({ id: req.params.id, invitation_id: ctx.invitation.id }).del();
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ===========================================================================
// Guests (dashboard) — per-guest tokens, event access, CSV import, Excel export
// ===========================================================================

function guestLink(slug, guestToken) {
  return slug ? `${config.baseUrl}/i/${slug}?g=${encodeURIComponent(guestToken)}` : null;
}
function whatsappNumber(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

/** Serialize a guest with its assigned event ids + link + WhatsApp link. */
async function serializeGuest(g, slug, coupleNames) {
  const access = await db('guest_event_access').where({ guest_id: g.id });
  const eventIds = access.map((a) => a.event_id);
  const link = guestLink(slug, g.unique_token);
  let whatsapp = null;
  const num = whatsappNumber(g.phone);
  if (num && link) {
    const msg = `${coupleNames} are getting married! You're invited. See your invitation: ${link}`;
    whatsapp = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }
  return {
    id: g.id,
    guest_name: g.guest_name,
    phone: g.phone || '',
    plus_one_limit: g.plus_one_limit,
    unique_token: g.unique_token,
    event_ids: eventIds,
    link,
    whatsapp,
    reminder_sent_at: g.reminder_sent_at || null,
    link_opened_at: g.link_opened_at || null,
  };
}

async function setGuestAccess(guestId, invitationId, eventIds) {
  await db('guest_event_access').where({ guest_id: guestId }).del();
  if (!Array.isArray(eventIds) || !eventIds.length) return;
  const valid = await db('invitation_events')
    .where({ invitation_id: invitationId })
    .whereIn('id', eventIds.map(Number))
    .pluck('id');
  if (valid.length) {
    await db('guest_event_access').insert(valid.map((eid) => ({ guest_id: guestId, event_id: eid })));
  }
}

function coupleNamesOf(inv) {
  return [inv.groom_name, inv.bride_name].filter(Boolean).join(' & ') || 'The couple';
}

/** GET /api/invitations/token/:token/guests */
router.get('/token/:token/guests', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const rows = await db('guests').where({ invitation_id: ctx.invitation.id }).orderBy('created_at', 'asc');
    const slug = ctx.invitation.slug;
    const names = coupleNamesOf(ctx.invitation);
    const guests = await Promise.all(rows.map((g) => serializeGuest(g, slug, names)));
    return res.json({ guests, published: Boolean(slug) });
  } catch (err) {
    return next(err);
  }
});

/** POST /api/invitations/token/:token/guests — create one guest. */
router.post('/token/:token/guests', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const name = String(req.body.guest_name || '').trim();
    if (!name) return res.status(400).json({ error: 'guest_name is required' });
    const token = await generateGuestToken();
    const [guest] = await db('guests')
      .insert({
        invitation_id: ctx.invitation.id,
        guest_name: name.slice(0, 200),
        phone: req.body.phone ? String(req.body.phone).slice(0, 40) : null,
        plus_one_limit: Math.max(0, Math.min(20, Number(req.body.plus_one_limit) || 0)),
        unique_token: token,
      })
      .returning('*');
    await setGuestAccess(guest.id, ctx.invitation.id, req.body.event_ids || []);
    const out = await serializeGuest(guest, ctx.invitation.slug, coupleNamesOf(ctx.invitation));
    return res.status(201).json({ ok: true, guest: out });
  } catch (err) {
    return next(err);
  }
});

/** PUT /api/invitations/token/:token/guests/:id — update a guest. */
router.put('/token/:token/guests/:id', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const guest = await db('guests').where({ id: req.params.id, invitation_id: ctx.invitation.id }).first();
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    const update = {};
    if ('guest_name' in req.body) update.guest_name = String(req.body.guest_name || '').slice(0, 200);
    if ('phone' in req.body) update.phone = req.body.phone ? String(req.body.phone).slice(0, 40) : null;
    if ('plus_one_limit' in req.body) update.plus_one_limit = Math.max(0, Math.min(20, Number(req.body.plus_one_limit) || 0));
    if (Object.keys(update).length) await db('guests').where({ id: guest.id }).update(update);
    if ('event_ids' in req.body) await setGuestAccess(guest.id, ctx.invitation.id, req.body.event_ids || []);

    const refreshed = await db('guests').where({ id: guest.id }).first();
    const out = await serializeGuest(refreshed, ctx.invitation.slug, coupleNamesOf(ctx.invitation));
    return res.json({ ok: true, guest: out });
  } catch (err) {
    return next(err);
  }
});

/** DELETE /api/invitations/token/:token/guests/:id */
router.delete('/token/:token/guests/:id', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    await db('guests').where({ id: req.params.id, invitation_id: ctx.invitation.id }).del();
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/invitations/token/:token/guests/import — bulk CSV import.
 * Body: { csv: "name,phone,plus_one_limit,events\n..." }
 * The "events" column is a semicolon-separated list of event names, or "all".
 */
router.post('/token/:token/guests/import', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const csv = String(req.body.csv || '');
    if (!csv.trim()) return res.status(400).json({ error: 'csv is required' });

    const events = await db('invitation_events').where({ invitation_id: ctx.invitation.id });
    const byName = new Map(events.map((e) => [String(e.event_name || '').trim().toLowerCase(), e.id]));
    const allIds = events.map((e) => e.id);

    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // Skip a header row if present
    if (lines.length && /name/i.test(lines[0]) && /phone/i.test(lines[0])) lines.shift();

    let added = 0;
    for (const line of lines) {
      const cols = parseCsvLine(line);
      const name = (cols[0] || '').trim();
      if (!name) continue;
      const phone = (cols[1] || '').trim() || null;
      const plusOne = Math.max(0, Math.min(20, Number(cols[2]) || 0));
      const evCol = (cols[3] || '').trim();
      let eventIds = [];
      if (/^all$/i.test(evCol)) eventIds = allIds;
      else if (evCol) {
        eventIds = evCol.split(/[;|]/).map((n) => byName.get(n.trim().toLowerCase())).filter(Boolean);
      }
      // eslint-disable-next-line no-await-in-loop
      const token = await generateGuestToken();
      // eslint-disable-next-line no-await-in-loop
      const [guest] = await db('guests')
        .insert({ invitation_id: ctx.invitation.id, guest_name: name.slice(0, 200), phone, plus_one_limit: plusOne, unique_token: token })
        .returning('id');
      // eslint-disable-next-line no-await-in-loop
      await setGuestAccess(typeof guest === 'object' ? guest.id : guest, ctx.invitation.id, eventIds);
      added += 1;
    }
    return res.status(201).json({ ok: true, added });
  } catch (err) {
    return next(err);
  }
});

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** GET /api/invitations/token/:token/guests/export — .xlsx of guests + links */
router.get('/token/:token/guests/export', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const rows = await db('guests').where({ invitation_id: ctx.invitation.id }).orderBy('created_at', 'asc');
    const slug = ctx.invitation.slug;
    const events = await db('invitation_events').where({ invitation_id: ctx.invitation.id });
    const eventName = new Map(events.map((e) => [e.id, e.event_name || e.event_type]));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TheWed';
    const sheet = workbook.addWorksheet('Guests');
    sheet.columns = [
      { header: 'Guest Name', key: 'guest_name', width: 28 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Plus-one limit', key: 'plus_one_limit', width: 14 },
      { header: 'Assigned events', key: 'events', width: 30 },
      { header: 'Personalized Link', key: 'link', width: 70 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const g of rows) {
      // eslint-disable-next-line no-await-in-loop
      const access = await db('guest_event_access').where({ guest_id: g.id }).pluck('event_id');
      sheet.addRow({
        guest_name: g.guest_name,
        phone: g.phone || '',
        plus_one_limit: g.plus_one_limit,
        events: access.map((id) => eventName.get(id)).filter(Boolean).join('; '),
        link: guestLink(slug, g.unique_token) || '(publish first)',
      });
    }

    const coupleName = [ctx.invitation.groom_name, ctx.invitation.bride_name].filter(Boolean).join('-') || 'invitation';
    const safeName = coupleName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="guest-list-${safeName}.xlsx"`);
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    return next(err);
  }
});

// ===========================================================================
// QR code for the public invitation URL (dashboard download)
// ===========================================================================

/** GET /api/invitations/token/:token/qr[.png] — PNG QR of the public URL. */
router.get('/token/:token/qr', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    if (!ctx.invitation.slug) {
      return res.status(400).json({ error: 'Publish the invitation first to get its QR code.' });
    }
    const url = `${config.baseUrl}/i/${ctx.invitation.slug}`;
    const png = await QRCode.toBuffer(url, {
      type: 'png',
      width: 600,
      margin: 2,
      color: { dark: '#3b342cff', light: '#ffffffff' },
    });
    const download = req.query.download === '1';
    res.setHeader('Content-Type', 'image/png');
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="qr-${ctx.invitation.slug}.png"`);
    }
    return res.end(png);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
