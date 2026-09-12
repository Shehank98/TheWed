const db = require('../db');
const config = require('../config');

/**
 * Read a settings row. Returns the stored object, or {} if not set.
 */
async function getSetting(key) {
  const row = await db('settings').where({ key }).first();
  if (!row) return {};
  let val = row.value;
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch {
      val = {};
    }
  }
  return val || {};
}

/**
 * Upsert a settings row.
 */
async function setSetting(key, value) {
  const payload = JSON.stringify(value || {});
  const existing = await db('settings').where({ key }).first();
  if (existing) {
    await db('settings').where({ key }).update({ value: payload, updated_at: db.fn.now() });
  } else {
    await db('settings').insert({ key, value: payload });
  }
  return value;
}

const BANK_FIELDS = ['bankName', 'accountName', 'accountNumber', 'branch', 'swift'];

/**
 * Bank details, merging any admin-saved overrides over the env defaults.
 */
async function getBankDetails() {
  const defaults = {
    bankName: config.bank.name,
    accountName: config.bank.accountName,
    accountNumber: config.bank.accountNumber,
    branch: config.bank.branch,
    swift: config.bank.swift,
  };
  const saved = await getSetting('bank');
  const merged = { ...defaults };
  BANK_FIELDS.forEach((f) => {
    if (saved[f] !== undefined && saved[f] !== null) merged[f] = String(saved[f]);
  });
  return merged;
}

/**
 * Save bank details (only the known fields are persisted).
 */
async function saveBankDetails(input) {
  const clean = {};
  BANK_FIELDS.forEach((f) => {
    clean[f] = input && input[f] != null ? String(input[f]).slice(0, 200) : '';
  });
  await setSetting('bank', clean);
  return getBankDetails();
}

module.exports = { getSetting, setSetting, getBankDetails, saveBankDetails, BANK_FIELDS };
