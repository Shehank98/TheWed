const fs = require('fs');
const admin = require('firebase-admin');
const config = require('../config');

/**
 * Firebase Cloud Storage image storage via a service account.
 *
 * Configure with either FIREBASE_SERVICE_ACCOUNT_JSON (the JSON key as a
 * string) or FIREBASE_APPLICATION_CREDENTIALS / GOOGLE_APPLICATION_CREDENTIALS
 * (a path to the key file), plus FIREBASE_STORAGE_BUCKET
 * (e.g. "my-project.appspot.com").
 *
 * One "folder" (path prefix) is used per invitation. Uploaded objects are made
 * public so they can be embedded directly in the public invitation page via a
 * plain https://storage.googleapis.com/<bucket>/<path> URL.
 */

let app = null;

function isConfigured() {
  return Boolean(
    (config.firebase.serviceAccountJson || config.firebase.credentialsPath) &&
      config.firebase.storageBucket
  );
}

function getCredentials() {
  if (config.firebase.serviceAccountJson) {
    return JSON.parse(config.firebase.serviceAccountJson);
  }
  if (config.firebase.credentialsPath) {
    return JSON.parse(fs.readFileSync(config.firebase.credentialsPath, 'utf8'));
  }
  throw new Error('Firebase credentials are not configured');
}

function getBucket() {
  if (!app) {
    // Reuse an already-initialised default app if one exists.
    if (admin.apps && admin.apps.length) {
      app = admin.apps[0];
    } else {
      app = admin.initializeApp({
        credential: admin.credential.cert(getCredentials()),
        storageBucket: config.firebase.storageBucket,
      });
    }
  }
  return admin.storage().bucket(config.firebase.storageBucket);
}

/**
 * Upload a buffer to Firebase Storage under the invitation's folder, make it
 * public, and return { fileId, url } where url is a directly-embeddable image
 * URL and fileId is the storage object path (used later for deletion).
 */
async function uploadImage({ folderName, filename, mimeType, buffer }) {
  if (!isConfigured()) {
    throw new Error('Firebase Storage is not configured (set service account + storage bucket)');
  }

  const bucket = getBucket();
  const objectPath = `${folderName}/${filename}`;
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    contentType: mimeType,
    resumable: false,
    metadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000',
    },
  });

  // Make the object readable by anyone so it can be embedded in <img> tags.
  await file.makePublic();

  return {
    fileId: objectPath,
    url: firebaseImageUrl(objectPath),
  };
}

async function deleteFile(fileId) {
  if (!isConfigured() || !fileId) return;
  const bucket = getBucket();
  try {
    await bucket.file(fileId).delete();
  } catch (err) {
    // A 404 means it's already gone — that's fine.
    if (err && err.code !== 404) throw err;
  }
}

/**
 * A URL that serves the raw image bytes for embedding in <img> tags.
 * Works for objects made public via makePublic().
 */
function firebaseImageUrl(objectPath) {
  const bucket = config.firebase.storageBucket;
  const encoded = String(objectPath)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `https://storage.googleapis.com/${bucket}/${encoded}`;
}

module.exports = {
  isConfigured,
  uploadImage,
  deleteFile,
  firebaseImageUrl,
};
