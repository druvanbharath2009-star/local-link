require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

// Convert SQLite ? placeholders to PostgreSQL $1, $2, ...
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function run(sql, params = []) {
  let pgSql = toPositional(sql);
  const upper = sql.trim().toUpperCase();
  if (upper.startsWith('INSERT') && !upper.includes('RETURNING')) {
    pgSql += ' RETURNING id';
  }
  const result = await pool.query(pgSql, params);
  return { lastID: result.rows[0]?.id, changes: result.rowCount };
}

async function get(sql, params = []) {
  const result = await pool.query(toPositional(sql), params);
  return result.rows[0] || undefined;
}

async function all(sql, params = []) {
  const result = await pool.query(toPositional(sql), params);
  return result.rows;
}

async function initDb() {
  const bcrypt = require('bcryptjs');

  const existing = await get('SELECT id FROM users WHERE email = ?', ['admin@locallink.com']);
  if (!existing) {
    const hash = await bcrypt.hash('admin123', 10);
    await run(
      'INSERT INTO users (email, password_hash, role, name) VALUES (?,?,?,?)',
      ['admin@locallink.com', hash, 'admin', 'Admin']
    );
  }

  const topicCount = await get('SELECT COUNT(*)::int as cnt FROM topics');
  if (topicCount.cnt === 0) {
    const topics = [
      ['Tutoring & Education', 'Academic support and subject tutoring', 'school'],
      ['Tech & Software', 'App development, web design, and tech services', 'computer'],
      ['Lawn & Garden', 'Landscaping, mowing, and outdoor services', 'yard'],
      ['Creative & Design', 'Graphic design, art, and creative services', 'palette'],
      ['Food & Catering', 'Home-cooked meals, baked goods, and catering', 'restaurant'],
      ['Photography', 'Event and portrait photography services', 'photo_camera'],
      ['Fitness & Wellness', 'Personal training and wellness coaching', 'fitness_center'],
      ['Pet Care', 'Dog walking, pet sitting, and grooming', 'pets'],
    ];
    for (const [name, description, icon] of topics) {
      await run('INSERT INTO topics (name, description, icon) VALUES (?,?,?)', [name, description, icon]);
    }
  }

  console.log('Database ready.');
}

module.exports = { run, get, all, initDb };
