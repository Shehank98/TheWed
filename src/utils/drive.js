const fs = require('fs');
const { Readable } = require('stream');
const { google } = require('googleapis');
const config = require('../config');

/**
 * Google Drive image storage via a service account.
 *
 * Configure with either GOOGLE_SERVICE_ACCOUNT_JSON (the JSON key as a string)
 * or GOOGLE_APPLICATION_CREDENTIALS (a path to the key file), plus
 * GOOGLE_DRIVE_PARENT_FOLDER_ID (a folder shared with the service account).
 *
 * One sub-folder is created per invitation. Uploaded files are made
 * "anyone with the link can view" so they can be embedded in the public page.
 */

let driveClient = null;

function isConfigured() {
  return Boolean(
    (config.drive.serviceAccountJson || config.drive.credentialsPath) &&
      config.drive.parentFolderId
  );
}

function getCredentials() {
  if (config.drive.serviceAccountJson) {
    return JSON.parse(config.drive.serviceAccountJson);
  }
  if (config.drive.credentialsPath) {
    return JSON.parse(fs.readFileSync(config.drive.credentialsPath, 'utf8'));
  }
  throw new Error('Google Drive credentials are not configured');
}

function getDrive() {
  if (driveClient) return driveClient;
  const credentials = getCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

/**
 * Find or create a per-invitation folder under the configured parent folder.
 * Returns the folder id.
 */
async function ensureInvitationFolder(folderName) {
  const drive = getDrive();
  const safeName = String(folderName).replace(/'/g, "\\'");
  const q = [
    `name = '${safeName}'`,
    `'${config.drive.parentFolderId}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ');

  const existing = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [config.drive.parentFolderId],
    },
    fields: 'id',
  });
  return created.data.id;
}

/**
 * Upload a buffer to Drive inside the invitation's folder, make it public,
 * and return { fileId, url } where url is a directly-embeddable image URL.
 */
async function uploadImage({ folderName, filename, mimeType, buffer }) {
  if (!isConfigured()) {
    throw new Error('Google Drive is not configured (set service account + parent folder id)');
  }

  const drive = getDrive();
  const folderId = await ensureInvitationFolder(folderName);

  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id',
  });

  const fileId = created.data.id;

  // Make the file readable by anyone with the link so it can be embedded.
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    fileId,
    url: driveImageUrl(fileId),
  };
}

async function deleteFile(fileId) {
  if (!isConfigured()) return;
  const drive = getDrive();
  try {
    await drive.files.delete({ fileId });
  } catch (err) {
    // A 404 means it's already gone — that's fine.
    if (err && err.code !== 404) throw err;
  }
}

/**
 * A URL that serves the raw image bytes for embedding in <img> tags.
 */
function driveImageUrl(fileId) {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

module.exports = {
  isConfigured,
  uploadImage,
  deleteFile,
  driveImageUrl,
  ensureInvitationFolder,
};
