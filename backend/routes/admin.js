const express = require('express');
const { run, get, all } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin role
router.use(authenticate, requireRole('admin'));

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const users = await get('SELECT COUNT(*)::int as cnt FROM users');
    const businesses = await get('SELECT COUNT(*)::int as cnt FROM businesses');
    const verified = await get('SELECT COUNT(*)::int as cnt FROM businesses WHERE verified=1');
    const pending = await get(`SELECT COUNT(*)::int as cnt FROM verification_requests WHERE status='pending'`);
    const topics = await get('SELECT COUNT(*)::int as cnt FROM topics');
    const complaints = await get(`SELECT COUNT(*)::int as cnt FROM complaints WHERE status='open'`);
    const revenue = await get('SELECT COALESCE(SUM(amount),0)::float as total FROM payments');

    res.json({
      total_users: users.cnt,
      total_businesses: businesses.cnt,
      verified_businesses: verified.cnt,
      pending_verifications: pending.cnt,
      active_topics: topics.cnt,
      open_complaints: complaints.cnt,
      total_revenue: revenue.total
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { role, search } = req.query;
    let sql = 'SELECT id, email, role, name, phone, created_at FROM users WHERE 1=1';
    const params = [];
    if (role) { sql += ' AND role=?'; params.push(role); }
    if (search) {
      sql += ' AND (name LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY created_at DESC';
    const users = await all(sql, params);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin' });
    await run('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/verifications
router.get('/verifications', async (req, res) => {
  try {
    const requests = await all(
      `SELECT vr.*, b.business_name, b.mission, u.email, u.name as owner_name
       FROM verification_requests vr
       JOIN businesses b ON vr.business_id = b.id
       JOIN users u ON b.user_id = u.id
       ORDER BY vr.submitted_at DESC`,
      []
    );
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/verifications/:id/approve
router.post('/verifications/:id/approve', async (req, res) => {
  try {
    const vr = await get('SELECT * FROM verification_requests WHERE id=?', [req.params.id]);
    if (!vr) return res.status(404).json({ error: 'Verification request not found' });

    await run(
      `UPDATE verification_requests SET status='approved', reviewed_at=CURRENT_TIMESTAMP WHERE id=?`,
      [req.params.id]
    );
    await run(
      `UPDATE businesses SET verified=1, verification_status='approved' WHERE id=?`,
      [vr.business_id]
    );
    res.json({ message: 'Business verified and approved' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/verifications/:id/reject
router.post('/verifications/:id/reject', async (req, res) => {
  try {
    const { notes } = req.body;
    const vr = await get('SELECT * FROM verification_requests WHERE id=?', [req.params.id]);
    if (!vr) return res.status(404).json({ error: 'Verification request not found' });

    await run(
      `UPDATE verification_requests SET status='rejected', reviewed_at=CURRENT_TIMESTAMP, notes=? WHERE id=?`,
      [notes || null, req.params.id]
    );
    await run(
      `UPDATE businesses SET verification_status='rejected' WHERE id=?`,
      [vr.business_id]
    );
    res.json({ message: 'Verification rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/complaints
router.get('/complaints', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT c.*, u.name as customer_name, u.email as customer_email,
                      b.business_name
               FROM complaints c
               LEFT JOIN users u ON c.customer_id = u.id
               LEFT JOIN businesses b ON c.business_id = b.id
               WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND c.status=?'; params.push(status); }
    sql += ' ORDER BY c.created_at DESC';
    const complaints = await all(sql, params);
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/complaints/:id
router.put('/complaints/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'reviewing', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await run('UPDATE complaints SET status=? WHERE id=?', [status, req.params.id]);
    res.json({ message: 'Complaint updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/businesses
router.get('/businesses', async (req, res) => {
  try {
    const { verified, verification_status } = req.query;
    let sql = `SELECT b.*, u.email, u.name as owner_name
               FROM businesses b JOIN users u ON b.user_id = u.id WHERE 1=1`;
    const params = [];
    if (verified !== undefined) { sql += ' AND b.verified=?'; params.push(verified === 'true' ? 1 : 0); }
    if (verification_status) { sql += ' AND b.verification_status=?'; params.push(verification_status); }
    sql += ' ORDER BY b.created_at DESC';
    const businesses = await all(sql, params);
    res.json(businesses);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
