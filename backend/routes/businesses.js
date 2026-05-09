const express = require('express');
const multer = require('multer');
const path = require('path');
const { run, get, all } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/businesses - public list of all businesses
router.get('/', async (req, res) => {
  try {
    const { category, search, verified } = req.query;
    let sql = `SELECT b.*, u.name as owner_name, u.email as owner_email
               FROM businesses b JOIN users u ON b.user_id = u.id WHERE 1=1`;
    const params = [];

    if (category) { sql += ' AND b.category = ?'; params.push(category); }
    if (verified === 'true') { sql += ' AND b.verified = 1'; }
    if (search) {
      sql += ' AND (b.business_name LIKE ? OR b.mission LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY b.verified DESC, b.created_at DESC';

    const businesses = await all(sql, params);
    res.json(businesses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/businesses/me - get own business profile
router.get('/me', authenticate, requireRole('business'), async (req, res) => {
  try {
    const biz = await get('SELECT * FROM businesses WHERE user_id = ?', [req.user.id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    res.json(biz);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/businesses/:id - single business
router.get('/:id', async (req, res) => {
  try {
    const biz = await get(
      `SELECT b.*, u.name as owner_name FROM businesses b JOIN users u ON b.user_id = u.id WHERE b.id = ?`,
      [req.params.id]
    );
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    res.json(biz);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/businesses/me - update own business profile
router.put('/me', authenticate, requireRole('business'), upload.single('image'), async (req, res) => {
  try {
    const { business_name, mission, price, category } = req.body;
    const biz = await get('SELECT * FROM businesses WHERE user_id = ?', [req.user.id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const image_url = req.file ? `/uploads/${req.file.filename}` : biz.image_url;

    await run(
      `UPDATE businesses SET business_name=?, mission=?, price=?, category=?, image_url=? WHERE user_id=?`,
      [
        business_name || biz.business_name,
        mission !== undefined ? mission : biz.mission,
        price !== undefined ? price : biz.price,
        category || biz.category,
        image_url,
        req.user.id
      ]
    );
    const updated = await get('SELECT * FROM businesses WHERE user_id = ?', [req.user.id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/businesses/verify - request verification (business pays $10)
router.post('/verify', authenticate, requireRole('business'), async (req, res) => {
  try {
    const biz = await get('SELECT * FROM businesses WHERE user_id = ?', [req.user.id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    if (biz.verification_status === 'pending') {
      return res.status(400).json({ error: 'Verification already pending' });
    }
    if (biz.verified) return res.status(400).json({ error: 'Already verified' });

    const { payment_method_id } = req.body;

    // Simulate payment success (in prod, integrate real Stripe here)
    await run(
      `INSERT INTO verification_requests (business_id, status, payment_confirmed) VALUES (?,?,?)
       ON CONFLICT (business_id) DO UPDATE SET status='pending', payment_confirmed=1`,
      [biz.id, 'pending', 1]
    );
    await run(`UPDATE businesses SET verification_status='pending' WHERE id=?`, [biz.id]);
    await run(
      `INSERT INTO payments (user_id, amount, type, reference_id) VALUES (?,?,?,?)`,
      [req.user.id, 10.00, 'verification', biz.id]
    );

    res.json({ message: 'Verification request submitted. Admin will review your application.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/businesses/me/leads - get leads for business
router.get('/me/leads', authenticate, requireRole('business'), async (req, res) => {
  try {
    const biz = await get('SELECT * FROM businesses WHERE user_id = ?', [req.user.id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const forms = await all(
      `SELECT id, customer_name, created_at, unlocked,
        CASE WHEN unlocked=1 THEN customer_email ELSE NULL END as customer_email,
        CASE WHEN unlocked=1 THEN customer_phone ELSE NULL END as customer_phone,
        CASE WHEN unlocked=1 THEN message ELSE NULL END as message
       FROM interest_forms WHERE business_id = ? ORDER BY created_at DESC`,
      [biz.id]
    );

    res.json({
      leads: forms,
      free_leads_used: biz.free_leads_used,
      free_leads_limit: 5
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/businesses/me/leads/:id/unlock - pay $1.99 to unlock lead
router.post('/me/leads/:id/unlock', authenticate, requireRole('business'), async (req, res) => {
  try {
    const biz = await get('SELECT * FROM businesses WHERE user_id = ?', [req.user.id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const lead = await get('SELECT * FROM interest_forms WHERE id = ? AND business_id = ?', [req.params.id, biz.id]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.unlocked) return res.status(400).json({ error: 'Lead already unlocked' });

    if (biz.free_leads_used < 5) {
      await run('UPDATE interest_forms SET unlocked=1 WHERE id=?', [lead.id]);
      await run('UPDATE businesses SET free_leads_used=free_leads_used+1 WHERE id=?', [biz.id]);
      return res.json({ message: 'Lead unlocked (free)', lead: { ...lead, unlocked: 1 } });
    }

    // Simulate payment for paid unlock
    await run('UPDATE interest_forms SET unlocked=1 WHERE id=?', [lead.id]);
    await run('UPDATE businesses SET free_leads_used=free_leads_used+1 WHERE id=?', [biz.id]);
    await run(
      'INSERT INTO payments (user_id, amount, type, reference_id) VALUES (?,?,?,?)',
      [req.user.id, 1.99, 'lead_unlock', lead.id]
    );

    const unlocked = await get('SELECT * FROM interest_forms WHERE id=?', [lead.id]);
    res.json({ message: 'Lead unlocked ($1.99 charged)', lead: unlocked });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
