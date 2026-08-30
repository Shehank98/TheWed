const crypto = require('crypto');
const db = require('../db');

// Unambiguous alphabet (no 0/O/1/I) for human-typed reference codes.
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomFrom(alphabet, length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * Generate an 8-char alphanumeric reference code, checked for collision
 * against the orders table.
 */
async function generateReferenceCode(length = 8, maxAttempts = 12) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = randomFrom(REF_ALPHABET, length);
    // eslint-disable-next-line no-await-in-loop
    const existing = await db('orders').where({ reference_code: code }).first();
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique reference_code after several attempts');
}

/**
 * Long, URL-safe random token for magic links. Collision is astronomically
 * unlikely, but we still verify against the invitations table.
 */
async function generateMagicLinkToken(bytes = 32, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const token = crypto.randomBytes(bytes).toString('base64url');
    // eslint-disable-next-line no-await-in-loop
    const existing = await db('invitations').where({ magic_link_token: token }).first();
    if (!existing) return token;
  }
  throw new Error('Could not generate a unique magic_link_token');
}

/**
 * Slugify a couple's names: lowercase, strip special chars, hyphen-join.
 * On collision append -2, -3, ... (optionally ignoring one invitation's own id
 * so re-publishing keeps the same slug).
 */
function baseSlug(groomName, brideName) {
  const clean = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // strip diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const parts = [clean(groomName), clean(brideName)].filter(Boolean);
  const joined = parts.join('-');
  return joined || 'our-wedding';
}

async function generateUniqueSlug(groomName, brideName, ignoreInvitationId = null) {
  const base = baseSlug(groomName, brideName);
  let candidate = base;
  let suffix = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = db('invitations').where({ slug: candidate });
    if (ignoreInvitationId) query.andWhereNot({ id: ignoreInvitationId });
    // eslint-disable-next-line no-await-in-loop
    const clash = await query.first();
    if (!clash) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

module.exports = {
  generateReferenceCode,
  generateMagicLinkToken,
  generateUniqueSlug,
  baseSlug,
};
