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

const EVENT_TYPES = ['Poruwa', 'Church', 'Reception', 'Homecoming', 'Custom'];

function toDateStr(d) {
  if (!d) return '';
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/**
 * Load an invitation's events, chronologically. Falls back to a single event
 * synthesized from the legacy wedding_date/venue fields (and then the legacy
 * `schedule` JSONB) so already-published single-event invitations keep working.
 *
 * `restrictEventIds` (optional) limits the result to those event ids — used for
 * per-guest private-event gating (Phase 2/8).
 */
async function loadEvents(invitation, restrictEventIds = null) {
  let rows = await db('invitation_events')
    .where({ invitation_id: invitation.id })
    .orderByRaw('event_date asc nulls last, event_time asc nulls last, sort_order asc, id asc');

  if (rows.length) {
    let events = rows.map((r) => ({
      id: r.id,
      name: r.event_name || labelForType(r.event_type),
      type: r.event_type || 'Custom',
      date: toDateStr(r.event_date),
      time: r.event_time || '',
      venueName: r.venue_name || '',
      venueAddress: r.venue_address || '',
      mapLink: r.map_link || '',
      dressCode: r.dress_code || '',
      sortOrder: r.sort_order || 0,
      isPrivate: Boolean(r.is_private),
      language: r.language || '',
    }));
    if (Array.isArray(restrictEventIds)) {
      const allow = new Set(restrictEventIds.map(Number));
      events = events.filter((e) => allow.has(Number(e.id)));
    }
    return events;
  }

  // Fallback 1: legacy schedule JSONB
  const schedule = normalizeSchedule(invitation.schedule);
  if (schedule.length) {
    return schedule.map((s, i) => ({
      id: null,
      name: s.name || 'Event',
      type: 'Custom',
      date: toDateStr(invitation.wedding_date),
      time: s.time || '',
      venueName: s.venue || invitation.venue_name || '',
      venueAddress: '',
      mapLink: invitation.map_link || '',
      sortOrder: i,
      isPrivate: false,
      language: '',
    }));
  }

  // Fallback 2: single wedding_date / venue
  if (invitation.wedding_date || invitation.venue_name) {
    return [
      {
        id: null,
        name: 'Wedding',
        type: 'Custom',
        date: toDateStr(invitation.wedding_date),
        time: invitation.wedding_time || '',
        venueName: invitation.venue_name || '',
        venueAddress: invitation.venue_address || '',
        mapLink: invitation.map_link || '',
        sortOrder: 0,
        isPrivate: false,
        language: '',
      },
    ];
  }
  return [];
}

function labelForType(type) {
  return EVENT_TYPES.includes(type) ? type : 'Event';
}

/**
 * Optional "Our Story" milestone timeline. Empty array if the couple hasn't
 * added any (the section then stays hidden).
 */
async function loadMilestones(invitationId) {
  const rows = await db('story_milestones')
    .where({ invitation_id: invitationId })
    .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'id', order: 'asc' }]);
  return rows.map((m) => ({
    id: m.id,
    title: m.title || '',
    date: m.milestone_date || '',
    body: m.body || '',
    imageUrl: m.image_url || '',
    sortOrder: m.sort_order || 0,
  }));
}

module.exports = {
  renderPayload,
  groupImages,
  loadImages,
  normalizeSchedule,
  loadEvents,
  loadMilestones,
  EVENT_TYPES,
  toDateStr,
};
