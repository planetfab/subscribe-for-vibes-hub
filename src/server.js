const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');
const db = require('./database');
const { startEmailWatcher } = require('./email-watcher');

const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const publishRoutes = require('./routes/publish');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // set to true once behind HTTPS on Railway
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  if (req.originalUrl.startsWith('/api')) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/login');
}

// Auth routes (no auth guard)
app.use('/auth', authRoutes);

// Protected API routes
app.use('/api/content', requireAuth, contentRoutes);
app.use('/api/publish', requireAuth, publishRoutes);

// Login page (unauthenticated)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Dashboard root (protected)
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Static assets (CSS, JS, etc.)
app.use(express.static(path.join(__dirname, '../public')));

async function main() {
  await db.init();
  startEmailWatcher();
  app.listen(config.port, () => {
    console.log(`Subscribe for Vibes Hub running on port ${config.port}`);
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
