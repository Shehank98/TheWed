const express = require('express');
const db = require('../db');

const router = express.Router();

/** GET /api/templates — public list of templates for the storefront/order page. */
router.get('/', async (req, res, next) => {
  try {
    const templates = await db('templates').orderBy('id', 'asc');
    return res.json({ templates });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
