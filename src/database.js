const config = require('./config');
const { v4: uuidv4 } = require('uuid');

let pool = null;
const memStore = [];

async function init() {
  if (config.database.url) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: config.database.url,
      ssl: { rejectUnauthorized: false },
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS content (
        id            UUID PRIMARY KEY,
        piece_title   TEXT,
        section_name  TEXT,
        newsletter_blurb TEXT,
        linkedin_hook TEXT,
        instagram_caption TEXT,
        blog_potential TEXT,
        source_urls   TEXT,
        status        TEXT NOT NULL DEFAULT 'Draft',
        email_subject TEXT,
        raw_content   TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('PostgreSQL database ready');
  } else {
    console.warn('DATABASE_URL not set — using in-memory store (data will not persist across restarts)');
  }
}

async function create(data) {
  const id = uuidv4();
  const now = new Date().toISOString();

  if (pool) {
    const { rows } = await pool.query(
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

  const item = { id, ...data, status: 'Draft', created_at: now, updated_at: now };
  memStore.unshift(item);
  return item;
}

async function getAll() {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM content ORDER BY created_at DESC');
    return rows;
  }
  return [...memStore];
}

async function getById(id) {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM content WHERE id = $1', [id]);
    return rows[0] || null;
  }
  return memStore.find(i => i.id === id) || null;
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

  if (pool) {
    const setClauses = Object.keys(safe).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = Object.values(safe);
    const { rows } = await pool.query(
      `UPDATE content SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return rows[0] || null;
  }

  const idx = memStore.findIndex(i => i.id === id);
  if (idx === -1) return null;
  memStore[idx] = { ...memStore[idx], ...safe, updated_at: new Date().toISOString() };
  return memStore[idx];
}

module.exports = { init, create, getAll, getById, update };
