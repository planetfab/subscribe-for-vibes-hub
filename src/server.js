const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');
const db = require('./database');
const { startEmailWatcher } = require('./email-watcher');
const requireAuth = require('./middleware/auth');

const authRoutes        = require('./routes/auth');
const contentRoutes     = require('./routes/content');
const publishRoutes     = require('./routes/publish');
const linkedinOAuth          = require('./routes/linkedin-oauth');
const { router: instagramOAuth } = require('./routes/instagram-oauth');
const settingsApiRoutes      = require('./routes/settings-api');

const app = express();

// Railway (and most PaaS) terminate TLS at their proxy and forward plain
// HTTP to the container. Trust the first proxy so Express sees the correct
// protocol, and so session cookies work properly behind HTTPS.
app.set('trust proxy', 1);

// Raise the JSON body limit to accommodate base64-encoded image arrays in PUT /api/content/:id
// (3 × 4 MB images × 4/3 base64 ratio ≈ 16 MB; 50 MB gives comfortable headroom)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ── Unauthenticated routes ───────────────────────────────────────────────
app.use('/auth', authRoutes);

// LinkedIn OAuth callback is hit by a browser that still has a valid session
// (the user was redirected away from our app and back), so requireAuth is fine.
app.use('/auth/linkedin',   requireAuth, linkedinOAuth);
app.use('/auth/instagram', requireAuth, instagramOAuth);

// ── Protected API routes ─────────────────────────────────────────────────
app.use('/api/content',  requireAuth, contentRoutes);
app.use('/api/publish',  requireAuth, publishRoutes);
app.use('/api/settings', requireAuth, settingsApiRoutes);

// ── Pages ────────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/settings', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/settings.html'));
});

app.use(express.static(path.join(__dirname, '../public')));

// ── Start ────────────────────────────────────────────────────────────────
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
