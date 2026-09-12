const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const QRCode = require('qrcode');
const db = require('../db');
const config = require('../config');
const drive = require('../utils/drive');
const { generateUniqueSlug } = require('../utils/codes');
const { renderPayload, loadImages, normalizeSchedule } = require('../utils/serialize');

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
    payload.stats = { confirmedGuests: await confirmedGuestCount(invitation.id) };

    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

/** GET /api/invitations/public/:slug/stats — live confirmed-guest counter. */
router.get('/public/:slug/stats', async (req, res, next) => {
  try {
    const invitation = await db('invitations').where({ slug: req.params.slug }).first();
    if (!invitation || invitation.status !== 'published') return res.status(404).json({ error: 'not_found' });
    return res.json({ confirmedGuests: await confirmedGuestCount(invitation.id) });
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

async function confirmedGuestCount(invitationId) {
  const row = await db('rsvps')
    .where({ invitation_id: invitationId, attending: true })
    .sum({ total: 'guest_count' })
    .first();
  return Number((row && row.total) || 0);
}

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
    return res.json(renderPayload(refreshed, ctx.template, images));
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

    // Validate required fields.
    const missing = [];
    if (!inv.groom_name) missing.push('groom_name');
    if (!inv.bride_name) missing.push('bride_name');
    if (!inv.wedding_date) missing.push('wedding_date');
    if (!inv.venue_name) missing.push('venue_name');
    if (missing.length) {
      return res.status(400).json({ error: 'Please fill in all required fields before publishing', missing });
    }

    // Generate slug (keep existing on re-publish).
    const slug = inv.slug || (await generateUniqueSlug(inv.groom_name, inv.bride_name, inv.id));

    // archive_at = wedding_date + 90 days
    const weddingDate = new Date(inv.wedding_date);
    const archiveAt = new Date(weddingDate.getTime());
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
      { header: 'Meal Preference', key: 'meal_preference', width: 20 },
      { header: 'Message', key: 'message', width: 50 },
      { header: 'Submitted At', key: 'submitted_at', width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };

    rsvps.forEach((r) => {
      sheet.addRow({
        guest_name: r.guest_name,
        attending: r.attending ? 'Yes' : 'No',
        guest_count: r.guest_count,
        meal_preference: r.meal_preference || '',
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
// Guest list (dashboard) — per-guest personalized links + Excel export
// ===========================================================================

function guestLink(slug, name) {
  return `${config.baseUrl}/i/${slug}?to=${encodeURIComponent(name)}`;
}

/** GET /api/invitations/token/:token/guests */
router.get('/token/:token/guests', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const guests = await db('guest_list')
      .where({ invitation_id: ctx.invitation.id })
      .orderBy('created_at', 'asc');
    const slug = ctx.invitation.slug;
    return res.json({
      guests: guests.map((g) => ({
        id: g.id,
        guest_name: g.guest_name,
        link: slug ? guestLink(slug, g.guest_name) : null,
      })),
      published: Boolean(slug),
    });
  } catch (err) {
    return next(err);
  }
});

/** POST /api/invitations/token/:token/guests — { guest_name } or { names: [] } */
router.post('/token/:token/guests', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });

    let names = [];
    if (Array.isArray(req.body.names)) names = req.body.names;
    else if (req.body.guest_name) names = [req.body.guest_name];
    names = names
      .map((n) => String(n || '').trim())
      .filter(Boolean)
      .map((n) => n.slice(0, 200));
    if (!names.length) return res.status(400).json({ error: 'Provide guest_name or names[]' });

    const rows = names.map((guest_name) => ({ invitation_id: ctx.invitation.id, guest_name }));
    await db('guest_list').insert(rows);
    return res.status(201).json({ ok: true, added: rows.length });
  } catch (err) {
    return next(err);
  }
});

/** DELETE /api/invitations/token/:token/guests/:id */
router.delete('/token/:token/guests/:id', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    await db('guest_list').where({ id: req.params.id, invitation_id: ctx.invitation.id }).del();
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/** GET /api/invitations/token/:token/guests/export — .xlsx of guests + links */
router.get('/token/:token/guests/export', async (req, res, next) => {
  try {
    const ctx = await loadByToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'Invalid or expired link' });
    const guests = await db('guest_list')
      .where({ invitation_id: ctx.invitation.id })
      .orderBy('created_at', 'asc');
    const slug = ctx.invitation.slug;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TheWed';
    const sheet = workbook.addWorksheet('Guest list');
    sheet.columns = [
      { header: 'Guest Name', key: 'guest_name', width: 30 },
      { header: 'Personalized Link', key: 'link', width: 70 },
    ];
    sheet.getRow(1).font = { bold: true };
    guests.forEach((g) => {
      sheet.addRow({ guest_name: g.guest_name, link: slug ? guestLink(slug, g.guest_name) : '(publish first)' });
    });

    const coupleName =
      [ctx.invitation.groom_name, ctx.invitation.bride_name].filter(Boolean).join('-') || 'invitation';
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
