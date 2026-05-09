const express = require('express');
const { run, get, all } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/customers/interest - submit interest form for a business
router.post('/interest', async (req, res) => {
  try {
    const { business_id, customer_name, customer_email, customer_phone, message } = req.body;
    if (!business_id || !customer_name || !customer_email) {
      return res.status(400).json({ error: 'business_id, customer_name, and customer_email are required' });
    }

    const biz = await get('SELECT id FROM businesses WHERE id = ?', [business_id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const result = await run(
      `INSERT INTO interest_forms (business_id, customer_name, customer_email, customer_phone, message, unlocked)
       VALUES (?,?,?,?,?, CASE WHEN (SELECT free_leads_used FROM businesses WHERE id=?) < 5 THEN 1 ELSE 0 END)`,
      [business_id, customer_name, customer_email, customer_phone || null, message || null, business_id]
    );

    // Auto-unlock if under free threshold and mark as used
    const bizData = await get('SELECT free_leads_used FROM businesses WHERE id = ?', [business_id]);
    if (bizData.free_leads_used < 5) {
      await run('UPDATE businesses SET free_leads_used=free_leads_used+1 WHERE id=?', [business_id]);
    }

    res.status(201).json({ message: 'Interest form submitted successfully', id: result.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/customers/complaint - submit a complaint
router.post('/complaint', async (req, res) => {
  try {
    const { customer_id, business_id, subject, description } = req.body;
    if (!subject || !description) {
      return res.status(400).json({ error: 'subject and description are required' });
    }

    // Allow anonymous complaints (customer_id optional)
    const result = await run(
      'INSERT INTO complaints (customer_id, business_id, subject, description) VALUES (?,?,?,?)',
      [customer_id || null, business_id || null, subject, description]
    );
    res.status(201).json({ message: 'Complaint submitted', id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/customers/me/activity - logged-in customer's forms
router.get('/me/activity', authenticate, requireRole('customer'), async (req, res) => {
  try {
    const forms = await all(
      `SELECT f.*, b.business_name FROM interest_forms f
       JOIN businesses b ON f.business_id = b.id
       WHERE f.customer_email = (SELECT email FROM users WHERE id = ?)
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(forms);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
