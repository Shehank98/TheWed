require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  baseUrl: (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || '',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
    sessionSecret: process.env.ADMIN_SESSION_SECRET || 'dev-insecure-secret-change-me',
  },

  email: {
    appScriptUrl: process.env.GOOGLE_APPSCRIPT_EMAIL_URL || '',
    sharedSecret: process.env.EMAIL_SHARED_SECRET || '',
    fromName: process.env.EMAIL_FROM_NAME || 'TheWed',
  },

  drive: {
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    parentFolderId: process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || '',
  },

  firebase: {
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    credentialsPath:
      process.env.FIREBASE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  },

  bank: {
    name: process.env.BANK_NAME || 'Bank of Ceylon',
    accountName: process.env.BANK_ACCOUNT_NAME || 'TheWed (Pvt) Ltd',
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || '0000000000',
    branch: process.env.BANK_BRANCH || 'Colombo',
    swift: process.env.BANK_SWIFT || '',
  },
};

module.exports = config;
