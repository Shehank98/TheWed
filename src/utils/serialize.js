const db = require('../db');

/**
 * Build the normalized data object that templates render from. Used by both
 * the public page and the editor's live preview so they render identically.
 */
function groupImages(images) {
  const hero = images.find((i) => i.image_type === 'hero') || null;
  const couple = images
    .filter((i) => i.image_type === 'couple')
    .sort((a, b) => a.position - b.position);
  const gallery = images
    .filter((i) => i.image_type === 'gallery')
    .sort((a, b) => a.position - b.position);

  const toRef = (img) => (img ? { id: img.id, url: img.drive_url, driveFileId: img.drive_file_id } : null);

  return {
    hero: toRef(hero),
    couple: couple.map(toRef),
    gallery: gallery.map(toRef),
  };
}

async function loadImages(invitationId) {
  return db('invitation_images').where({ invitation_id: invitationId }).orderBy('position', 'asc');
}

/**
 * Coerce the stored schedule (JSONB, may arrive as a string) into a clean
 * array of { name, time, venue } items.
 */
function normalizeSchedule(schedule) {
  let arr = schedule;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((it) => ({
      name: String((it && it.name) || '').slice(0, 200),
      time: String((it && it.time) || '').slice(0, 100),
      venue: String((it && it.venue) || '').slice(0, 300),
    }))
    .filter((it) => it.name || it.time || it.venue);
}

/**
 * The render payload shared by templates. `includeStatus` adds status/slug for
 * the public endpoint.
 */
function renderPayload(invitation, template, images) {
  return {
    template: {
      id: template.id,
      name: template.name,
      folderKey: template.folder_key,
      animationStyle: template.animation_style,
    },
    invitation: {
      groomName: invitation.groom_name || '',
      brideName: invitation.bride_name || '',
      weddingDate: invitation.wedding_date
        ? new Date(invitation.wedding_date).toISOString().slice(0, 10)
        : '',
      weddingTime: invitation.wedding_time || '',
      venueName: invitation.venue_name || '',
      venueAddress: invitation.venue_address || '',
      storyText: invitation.story_text || '',
      customFields: invitation.custom_fields || {},
      schedule: normalizeSchedule(invitation.schedule),
      mapLink: invitation.map_link || '',
      musicUrl: invitation.music_url || '',
      languageDefault: invitation.language_default || 'en',
      mealPrefEnabled: Boolean(invitation.meal_pref_enabled),
      slug: invitation.slug || '',
      status: invitation.status,
    },
    images: groupImages(images),
  };
}

module.exports = { renderPayload, groupImages, loadImages, normalizeSchedule };
