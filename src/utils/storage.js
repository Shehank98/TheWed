const drive = require('./drive');
const firebase = require('./firebaseStorage');

/**
 * Image storage abstraction.
 *
 * The app supports two backends with identical adapter signatures:
 *   - Firebase Cloud Storage (preferred — lets users upload their own images)
 *   - Google Drive (legacy fallback)
 *
 * Firebase is used when it is configured; otherwise Drive is used. This keeps
 * the editor upload flow (POST /token/:token/images) backend-agnostic, and
 * lets existing invitations that stored Drive URLs keep working — those URLs
 * are absolute and served as-is, no matter which backend is active now.
 *
 * Every adapter exposes:
 *   isConfigured()                                   -> boolean
 *   uploadImage({ folderName, filename, mimeType, buffer }) -> { fileId, url }
 *   deleteFile(fileId)                               -> void
 *
 * `fileId` is opaque to callers (a Drive file id or a Firebase object path)
 * and is what must be passed back to deleteFile.
 */

function active() {
  if (firebase.isConfigured()) return firebase;
  return drive;
}

function isConfigured() {
  return firebase.isConfigured() || drive.isConfigured();
}

function backendName() {
  if (firebase.isConfigured()) return 'firebase';
  if (drive.isConfigured()) return 'drive';
  return 'none';
}

function uploadImage(args) {
  return active().uploadImage(args);
}

/**
 * Delete a stored file. We don't know which backend originally stored a given
 * fileId (an invitation may predate a backend switch), so try both — each
 * adapter no-ops when it isn't configured, and deletes are best-effort anyway.
 */
async function deleteFile(fileId) {
  if (!fileId) return;
  await active().deleteFile(fileId).catch(() => {});
}

module.exports = {
  isConfigured,
  uploadImage,
  deleteFile,
  backendName,
};
