const config = require('./config');
const { v4: uuidv4 } = require('uuid');

let pool = null;
const memStore = [];
const memSettings = {};
const memProcessed = new Set();

async function init() {
  if (!config.database.url) {
    console.warn('DATABASE_URL not set — using in-memory store (data will not persist across restarts)');
    return;
  }

  try {
    const { Pool } = require('pg');
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
    // Migration: add deleted_at for soft-delete / trash (safe to run repeatedly)
    await pool.query(`
      ALTER TABLE content ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    `);
    console.log('PostgreSQL database ready');
  } catch (err) {
    console.error(`PostgreSQL connection failed (${err.message}) — falling back to in-memory store`);
    pool = null;
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
    const { rows } = await pool.query(
      'SELECT * FROM content WHERE deleted_at IS NULL ORDER BY created_at DESC'
    );
    return rows;
  }
  return memStore.filter(i => !i.deleted_at);
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

// ── Soft delete (moves to Trash) ─────────────────────────────────────────────

async function deleteById(id) {
  console.log(`[db.deleteById] called — id: ${id}, pool: ${pool ? 'connected' : 'NULL (in-memory)'}`);
  if (pool) {
    const result = await pool.query(
      'UPDATE content SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    console.log(`[db.deleteById] UPDATE executed — rowCount: ${result.rowCount}`);
    return;
  }
  const item = memStore.find(i => i.id === id);
  console.log(`[db.deleteById] in-memory — item found: ${!!item}`);
  if (item && !item.deleted_at) item.deleted_at = new Date().toISOString();
}

async function deleteMany(ids) {
  if (!ids.length) return;
  if (pool) {
    await pool.query(
      'UPDATE content SET deleted_at = NOW() WHERE id = ANY($1) AND deleted_at IS NULL',
      [ids]
    );
    return;
  }
  for (const id of ids) {
    const item = memStore.find(i => i.id === id);
    if (item && !item.deleted_at) item.deleted_at = new Date().toISOString();
  }
}

// ── Trash operations ─────────────────────────────────────────────────────────

const TRASH_TTL_DAYS = 5;

function trashCutoff() {
  return new Date(Date.now() - TRASH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

async function getTrash() {
  const cutoff = trashCutoff();
  if (pool) {
    const { rows } = await pool.query(
      'SELECT * FROM content WHERE deleted_at IS NOT NULL AND deleted_at > $1 ORDER BY deleted_at DESC',
      [cutoff]
    );
    return rows;
  }
  return memStore.filter(i => i.deleted_at && new Date(i.deleted_at) > cutoff);
}

async function restoreById(id) {
  if (pool) {
    const { rows } = await pool.query(
      'UPDATE content SET deleted_at = NULL WHERE id = $1 RETURNING *',
      [id]
    );
    return rows[0] || null;
  }
  const item = memStore.find(i => i.id === id);
  if (!item) return null;
  delete item.deleted_at;
  return item;
}

async function permanentDeleteById(id) {
  if (pool) {
    await pool.query('DELETE FROM content WHERE id = $1', [id]);
    return;
  }
  const idx = memStore.findIndex(i => i.id === id);
  if (idx !== -1) memStore.splice(idx, 1);
}

async function emptyTrash() {
  if (pool) {
    await pool.query('DELETE FROM content WHERE deleted_at IS NOT NULL');
    return;
  }
  const toRemove = memStore.filter(i => !!i.deleted_at).map(i => i.id);
  for (const id of toRemove) {
    const idx = memStore.findIndex(i => i.id === id);
    if (idx !== -1) memStore.splice(idx, 1);
  }
}

async function purgeOldTrash() {
  const cutoff = trashCutoff();
  if (pool) {
    const { rowCount } = await pool.query(
      'DELETE FROM content WHERE deleted_at IS NOT NULL AND deleted_at < $1',
      [cutoff]
    );
    if (rowCount > 0) console.log(`[db] Purged ${rowCount} expired trash item${rowCount !== 1 ? 's' : ''}`);
    return;
  }
  const before = memStore.length;
  const cutoffStr = cutoff.toISOString();
  for (let i = memStore.length - 1; i >= 0; i--) {
    if (memStore[i].deleted_at && memStore[i].deleted_at < cutoffStr) memStore.splice(i, 1);
  }
  const purged = before - memStore.length;
  if (purged > 0) console.log(`[db] Purged ${purged} expired trash item${purged !== 1 ? 's' : ''} (in-memory)`);
}

// ── Settings / email dedup ───────────────────────────────────────────────────

async function getSetting(key) {
  if (pool) {
    const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    return rows[0]?.value ?? null;
  }
  return memSettings[key] ?? null;
}

async function setSetting(key, value) {
  if (pool) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );
    return;
  }
  memSettings[key] = value;
}

async function hasProcessedEmail(messageId) {
  if (pool) {
    const { rows } = await pool.query(
      'SELECT 1 FROM processed_emails WHERE message_id = $1',
      [messageId]
    );
    return rows.length > 0;
  }
  return memProcessed.has(messageId);
}

async function markEmailProcessed(messageId) {
  if (pool) {
    await pool.query(
      'INSERT INTO processed_emails (message_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [messageId]
    );
    return;
  }
  memProcessed.add(messageId);
}

module.exports = {
  init,
  create, getAll, getById, update,
  deleteById, deleteMany,
  getTrash, restoreById, permanentDeleteById, emptyTrash, purgeOldTrash,
  getSetting, setSetting,
  hasProcessedEmail, markEmailProcessed,
};
