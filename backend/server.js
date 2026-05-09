require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend pages
const FRONTEND = path.join(__dirname, '..', 'stitch_local_link_student_marketplace');
app.use(express.static(FRONTEND));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/businesses', require('./routes/businesses'));
app.use('/api/topics', require('./routes/topics'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/admin', require('./routes/admin'));

// Catch-all: serve the homepage
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND, 'local_link_homepage', 'code.html'));
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Local Link server running at http://localhost:${PORT}`);
    console.log(`Admin credentials: admin@locallink.com / admin123`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
