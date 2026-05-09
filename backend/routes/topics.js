const express = require('express');
const { run, get, all } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/topics - list all topics
router.get('/', async (req, res) => {
  try {
    const topics = await all('SELECT * FROM topics ORDER BY name');
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/topics/:id
router.get('/:id', async (req, res) => {
  try {
    const topic = await get('SELECT * FROM topics WHERE id = ?', [req.params.id]);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    res.json(topic);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/topics - admin creates topic
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { name, description, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await run(
      'INSERT INTO topics (name, description, icon) VALUES (?,?,?)',
      [name, description || '', icon || 'category']
    );
    const topic = await get('SELECT * FROM topics WHERE id = ?', [result.lastID]);
    res.status(201).json(topic);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/topics/:id - admin updates topic
router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { name, description, icon } = req.body;
    const topic = await get('SELECT * FROM topics WHERE id = ?', [req.params.id]);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    await run(
      'UPDATE topics SET name=?, description=?, icon=? WHERE id=?',
      [name || topic.name, description !== undefined ? description : topic.description, icon || topic.icon, req.params.id]
    );
    const updated = await get('SELECT * FROM topics WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/topics/:id - admin deletes topic
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const topic = await get('SELECT * FROM topics WHERE id = ?', [req.params.id]);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    await run('DELETE FROM topics WHERE id = ?', [req.params.id]);
    res.json({ message: 'Topic deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/topics/:id/submit - customer submits info into a topic
router.post('/:id/submit', async (req, res) => {
  try {
    const topic = await get('SELECT * FROM topics WHERE id = ?', [req.params.id]);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const { customer_name, customer_email, customer_phone, message } = req.body;
    if (!customer_name || !customer_email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const result = await run(
      'INSERT INTO topic_submissions (topic_id, customer_name, customer_email, customer_phone, message) VALUES (?,?,?,?,?)',
      [req.params.id, customer_name, customer_email, customer_phone || null, message || null]
    );
    res.status(201).json({ message: 'Submitted successfully', id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/topics/:id/leads - business sees leads from a subscribed topic
router.get('/:id/leads', authenticate, requireRole('business'), async (req, res) => {
  try {
    const biz = await get('SELECT * FROM businesses WHERE user_id = ?', [req.user.id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const sub = await get(
      'SELECT * FROM topic_subscriptions WHERE business_id = ? AND topic_id = ? AND active = 1',
      [biz.id, req.params.id]
    );
    if (!sub) return res.status(403).json({ error: 'Not subscribed to this topic' });

    const leads = await all(
      'SELECT * FROM topic_submissions WHERE topic_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/topics/subscribe - business subscribes to topics
router.post('/subscribe', authenticate, requireRole('business'), async (req, res) => {
  try {
    const { topic_ids, plan_type } = req.body;
    if (!topic_ids || !plan_type) {
      return res.status(400).json({ error: 'topic_ids and plan_type are required' });
    }
    if (!['single', 'bundle'].includes(plan_type)) {
      return res.status(400).json({ error: 'plan_type must be single or bundle' });
    }
    if (plan_type === 'single' && topic_ids.length !== 1) {
      return res.status(400).json({ error: 'Single plan requires exactly 1 topic' });
    }
    if (plan_type === 'bundle' && topic_ids.length !== 3) {
      return res.status(400).json({ error: 'Bundle plan requires exactly 3 topics' });
    }

    const biz = await get('SELECT * FROM businesses WHERE user_id = ?', [req.user.id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const amount = plan_type === 'single' ? 14.99 : 39.99;

    for (const topic_id of topic_ids) {
      const topic = await get('SELECT id FROM topics WHERE id = ?', [topic_id]);
      if (!topic) return res.status(400).json({ error: `Topic ${topic_id} not found` });

      const existing = await get(
        'SELECT id FROM topic_subscriptions WHERE business_id=? AND topic_id=? AND active=1',
        [biz.id, topic_id]
      );
      if (!existing) {
        await run(
          'INSERT INTO topic_subscriptions (business_id, topic_id, plan_type) VALUES (?,?,?)',
          [biz.id, topic_id, plan_type]
        );
      }
    }

    await run(
      'INSERT INTO payments (user_id, amount, type, reference_id) VALUES (?,?,?,?)',
      [req.user.id, amount, 'topic_subscription', biz.id]
    );

    res.json({ message: `Subscribed to ${topic_ids.length} topic(s) for $${amount}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/topics/me/subscriptions - business sees their subscriptions
router.get('/me/subscriptions', authenticate, requireRole('business'), async (req, res) => {
  try {
    const biz = await get('SELECT * FROM businesses WHERE user_id = ?', [req.user.id]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const subs = await all(
      `SELECT ts.*, t.name, t.description, t.icon
       FROM topic_subscriptions ts JOIN topics t ON ts.topic_id = t.id
       WHERE ts.business_id = ? AND ts.active = 1`,
      [biz.id]
    );
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
