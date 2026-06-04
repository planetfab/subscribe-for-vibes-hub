const { Pool } = require('pg');
const config = require('./config');
const { v4: uuidv4 } = require('uuid');

let pool = null;

async function init() {
  if (!config.database.url) {
    throw new Error('DATABASE_URL is required — set it in Railway environment variables');
  }

  pool = new Pool({
    connectionString: config.database.url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_emails (
      message_id   TEXT PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS content (
      id                UUID PRIMARY KEY,
      piece_title       TEXT,
      section_name      TEXT,
      newsletter_blurb  TEXT,
      linkedin_hook     TEXT,
      instagram_caption TEXT,
      blog_potential    TEXT,
      source_urls       TEXT,
      status            TEXT NOT NULL DEFAULT 'Draft',
      email_subject     TEXT,
      raw_content       TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log('PostgreSQL database ready');
}

function requirePool() {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

async function create(data) {
  const id = uuidv4();
  const { rows } = await requirePool().query(
    `INSERT INTO content
       (id, piece_title, section_name, newsletter_blurb, linkedin_hook,
        instagram_caption, blog_potential, source_urls, status, email_subject, raw_content)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Draft',$9,$10)
     RETURNING *`,
    [
      id,
      data.piece_title,
      data.section_name,
      data.newsletter_blurb,
      data.linkedin_hook,
      data.instagram_caption,
      data.blog_potential,
      data.source_urls,
      data.email_subject,
      data.raw_content,
    ]
  );
  return rows[0];
}

async function getAll() {
  const { rows } = await requirePool().query('SELECT * FROM content ORDER BY created_at DESC');
  return rows;
}

async function getById(id) {
  const { rows } = await requirePool().query('SELECT * FROM content WHERE id = $1', [id]);
  return rows[0] || null;
}

const ALLOWED_COLUMNS = new Set([
  'piece_title', 'section_name', 'newsletter_blurb', 'linkedin_hook',
  'instagram_caption', 'blog_potential', 'source_urls', 'status',
  'email_subject', 'raw_content',
]);

async function update(id, data) {
  const safe = Object.fromEntries(
    Object.entries(data).filter(([k]) => ALLOWED_COLUMNS.has(k))
  );
  if (!Object.keys(safe).length) return null;

  const setClauses = Object.keys(safe).map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = Object.values(safe);
  const { rows } = await requirePool().query(
    `UPDATE content SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return rows[0] || null;
}

async function getSetting(key) {
  const { rows } = await requirePool().query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function setSetting(key, value) {
  await requirePool().query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

async function deleteById(id) {
  await requirePool().query('DELETE FROM content WHERE id = $1', [id]);
}

async function deleteMany(ids) {
  if (!ids.length) return;
  await requirePool().query('DELETE FROM content WHERE id = ANY($1)', [ids]);
}

async function hasProcessedEmail(messageId) {
  const { rows } = await requirePool().query(
    'SELECT 1 FROM processed_emails WHERE message_id = $1',
    [messageId]
  );
  return rows.length > 0;
}

async function markEmailProcessed(messageId) {
  await requirePool().query(
    'INSERT INTO processed_emails (message_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [messageId]
  );
}

module.exports = {
  init, create, getAll, getById, update, deleteById, deleteMany,
  getSetting, setSetting, hasProcessedEmail, markEmailProcessed,
};
