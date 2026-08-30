const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');

/**
 * Admin authentication.
 *
 * Two entry points:
 *  - HTTP Basic auth (works for API clients / curl).
 *  - A signed session cookie set by POST /api/admin/login (used by the admin UI).
 *
 * Credentials come from env: ADMIN_USERNAME plus either ADMIN_PASSWORD_HASH
 * (bcrypt, preferred) or ADMIN_PASSWORD (plaintext, dev only).
 */

function verifyPassword(plain) {
  if (config.admin.passwordHash) {
    try {
      return bcrypt.compareSync(plain, config.admin.passwordHash);
    } catch {
      return false;
    }
  }
  if (config.admin.password) {
    // constant-time-ish compare for plaintext fallback
    const a = Buffer.from(plain);
    const b = Buffer.from(config.admin.password);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
  return false;
}

function verifyCredentials(username, password) {
  if (!username || username !== config.admin.username) return false;
  return verifyPassword(password);
}

// --- Signed cookie sessions -------------------------------------------------

function sign(value) {
  const mac = crypto
    .createHmac('sha256', config.admin.sessionSecret)
    .update(value)
    .digest('base64url');
  return `${value}.${mac}`;
}

function createSessionToken() {
  // token = base64url(username|issuedAt) . hmac
  const payload = Buffer.from(`${config.admin.username}|${Date.now()}`).toString('base64url');
  return sign(payload);
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const expected = sign(payload);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const SESSION_COOKIE = 'admin_session';

function setSessionCookie(res) {
  res.cookie(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: 1000 * 60 * 60 * 12, // 12h
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// --- Middleware -------------------------------------------------------------

function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) return null;
    return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  // 1) Valid session cookie
  const cookieToken = req.cookies && req.cookies[SESSION_COOKIE];
  if (verifySessionToken(cookieToken)) return next();

  // 2) HTTP Basic auth
  const basic = parseBasicAuth(req.headers.authorization);
  if (basic && verifyCredentials(basic.username, basic.password)) return next();

  res.set('WWW-Authenticate', 'Basic realm="TheWed Admin"');
  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = {
  requireAdmin,
  verifyCredentials,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
};
