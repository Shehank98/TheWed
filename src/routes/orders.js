const express = require('express');
const db = require('../db');
const config = require('../config');
const { generateReferenceCode } = require('../utils/codes');
const { getBankDetails } = require('../utils/settings');

const router = express.Router();

function isEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(str || ''));
}

/**
 * POST /api/orders
 * Create an order for a template. Returns the reference code + bank details.
 */
router.post('/', async (req, res, next) => {
  try {
    const { template_id, customer_name, email, phone } = req.body || {};

    if (!template_id) return res.status(400).json({ error: 'template_id is required' });
    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ error: 'customer_name is required' });
    }
    if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required' });

    const template = await db('templates').where({ id: template_id }).first();
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const reference_code = await generateReferenceCode();

    const [order] = await db('orders')
      .insert({
        template_id: template.id,
        customer_name: String(customer_name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: phone ? String(phone).trim() : '',
        reference_code,
        amount: template.price,
        status: 'pending_payment',
      })
      .returning('*');

    return res.status(201).json({
      order: {
        id: order.id,
        reference_code: order.reference_code,
        status: order.status,
        amount: order.amount,
        customer_name: order.customer_name,
        email: order.email,
        template: { id: template.id, name: template.name },
        created_at: order.created_at,
      },
      bank: await getBankDetails(),
      instructionsUrl: `${config.baseUrl}/order/${order.reference_code}`,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/orders/:reference_code
 * Customer checks their order status (+ bank details while pending).
 */
router.get('/:reference_code', async (req, res, next) => {
  try {
    const order = await db('orders')
      .where({ reference_code: req.params.reference_code })
      .first();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const template = await db('templates').where({ id: order.template_id }).first();

    // If paid, surface the magic link presence (but not the token itself here).
    const invitation = await db('invitations').where({ order_id: order.id }).first();

    return res.json({
      order: {
        reference_code: order.reference_code,
        status: order.status,
        amount: order.amount,
        customer_name: order.customer_name,
        email: order.email,
        template: template ? { id: template.id, name: template.name } : null,
        created_at: order.created_at,
        paid_at: order.paid_at,
      },
      bank: order.status === 'pending_payment' ? await getBankDetails() : null,
      invitationReady: Boolean(invitation),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
