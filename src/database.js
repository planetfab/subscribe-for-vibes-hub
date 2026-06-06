const config = require('./config');
const { v4: uuidv4 } = require('uuid');

let pool = null;
const memStore = [];
const memSettings = {};
const memProcessed = new Set();

async function init() {
  const rawUrl = process.env.DATABASE_URL;
  console.log(`[db.init] DATABASE_URL present: ${!!rawUrl}`);
  console.log(`[db.init] DATABASE_URL value: ${rawUrl ? rawUrl.substring(0, 40) + '…' : '(undefined)'}`);

  if (!config.database.url) {
    console.warn('DATABASE_URL not set — using in-memory store (data will not persist across restarts)');
    return;
  }

  const { Pool } = require('pg');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const MAX_RETRIES = 4;

  // Phase 1: establish the connection, retried on failure.
  // Schema setup is intentionally separate so a migration hiccup never nulls
  // a working pool and causes a silent fallback to in-memory storage.
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (pool) { pool.end().catch(() => {}); pool = null; }
      pool = new Pool({
        connectionString: config.database.url,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000,
      });
      await pool.query('SELECT 1');
      console.log(`[db.init] PostgreSQL connected (attempt ${attempt}/${MAX_RETRIES})`);
      break;
    } catch (err) {
      if (pool) { pool.end().catch(() => {}); pool = null; }
      if (attempt < MAX_RETRIES) {
        console.warn(`[db.init] attempt ${attempt}/${MAX_RETRIES} failed (${err.message}) — retrying in 4s`);
        await sleep(4000);
      } else {
        console.error(`PostgreSQL connection failed after ${MAX_RETRIES} attempts (${err.message}) — falling back to in-memory store`);
        return;
      }
    }
  }

  // Phase 2: schema setup — always idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
  // Never drops or truncates tables. Pool stays live even if a migration query throws
  // (tables already exist from prior deployments), so tokens and settings are never lost.
  try {
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
    await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS images           TEXT`);
    await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS email_message_id TEXT`);
    await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS blog_post        TEXT`);
    await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS email_received_at  TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS published_channels TEXT`);

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM settings');
    console.log(`[db.init] PostgreSQL ready — ${rows[0].n} setting${rows[0].n !== 1 ? 's' : ''} in store`);
  } catch (err) {
    console.error(`[db.init] Schema setup error (${err.message}) — pool stays live, tables should exist from prior deployments`);
  }
}

function parseRow(row) {
  if (!row) return null;
  let images = [];
  if (row.images) { try { images = JSON.parse(row.images); } catch {} }
  let published_channels = {};
  if (row.published_channels) { try { published_channels = JSON.parse(row.published_channels); } catch {} }
  return { ...row, images, published_channels };
}

async function create(data) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const imagesJson = JSON.stringify(Array.isArray(data.images) ? data.images : []);

  if (pool) {
    const { rows } = await pool.query(
      `INSERT INTO content
         (id, piece_title, section_name, newsletter_blurb, linkedin_hook,
          instagram_caption, blog_potential, source_urls, status, email_subject,
          raw_content, images, email_message_id, blog_post, email_received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Draft',$9,$10,$11,$12,$13,$14)
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
        imagesJson,
        data.email_message_id || null,
        data.blog_post || null,
        data.email_received_at || null,
      ]
    );
    return parseRow(rows[0]);
  }

  const item = { id, ...data, images: Array.isArray(data.images) ? data.images : [], status: 'Draft', created_at: now, updated_at: now };
  memStore.unshift(item);
  return item;
}

async function getAll() {
  if (pool) {
    const { rows } = await pool.query(
      'SELECT * FROM content WHERE deleted_at IS NULL ORDER BY created_at DESC'
    );
    return rows.map(parseRow);
  }
  return memStore.filter(i => !i.deleted_at);
}

async function getById(id) {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM content WHERE id = $1', [id]);
    return parseRow(rows[0] || null);
  }
  return memStore.find(i => i.id === id) || null;
}

const ALLOWED_COLUMNS = new Set([
  'piece_title', 'section_name', 'newsletter_blurb', 'linkedin_hook',
  'instagram_caption', 'blog_potential', 'source_urls', 'status',
  'email_subject', 'raw_content', 'blog_post',
]);

async function update(id, data) {
  const safe = Object.fromEntries(
    Object.entries(data).filter(([k]) => ALLOWED_COLUMNS.has(k))
  );
  // images is a JSON column — serialize for PG but handled separately for in-memory
  const hasImages = Array.isArray(data.images);
  if (!Object.keys(safe).length && !hasImages) return null;

  if (pool) {
    const pgSafe = { ...safe };
    if (hasImages) pgSafe.images = JSON.stringify(data.images);
    const setClauses = Object.keys(pgSafe).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = Object.values(pgSafe);
    const { rows } = await pool.query(
      `UPDATE content SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return parseRow(rows[0] || null);
  }

  const idx = memStore.findIndex(i => i.id === id);
  if (idx === -1) return null;
  const merged = { ...memStore[idx], ...safe, updated_at: new Date().toISOString() };
  if (hasImages) merged.images = data.images;
  memStore[idx] = merged;
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
    return rows.map(parseRow);
  }
  return memStore.filter(i => i.deleted_at && new Date(i.deleted_at) > cutoff);
}

async function restoreById(id) {
  if (pool) {
    const { rows } = await pool.query(
      'UPDATE content SET deleted_at = NULL WHERE id = $1 RETURNING *',
      [id]
    );
    return parseRow(rows[0] || null);
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

async function countProcessedEmails() {
  if (pool) {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM processed_emails');
    return rows[0].n;
  }
  return memProcessed.size;
}

// Returns null if not yet processed, or a string indicating which table matched.
async function hasProcessedEmail(messageId) {
  if (pool) {
    const { rows: peRows } = await pool.query(
      'SELECT 1 FROM processed_emails WHERE message_id = $1',
      [messageId]
    );
    if (peRows.length > 0) return 'processed_emails';
    // Fallback: content row carries this message_id (including deleted) — prevents
    // recreating deleted cards when processed_emails loses its record (e.g. crash
    // between db.create and markEmailProcessed).
    const { rows: cRows } = await pool.query(
      'SELECT 1 FROM content WHERE email_message_id = $1 LIMIT 1',
      [messageId]
    );
    if (cRows.length > 0) return 'content';
    return null;
  }
  return memProcessed.has(messageId) ? 'processed_emails' : null;
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

// Merges a single channel timestamp into the published_channels JSON column.
// Uses a read-modify-write so existing channel records are never overwritten.
async function markChannelPublished(id, channel) {
  const ts = new Date().toISOString();
  if (pool) {
    const { rows } = await pool.query('SELECT published_channels FROM content WHERE id = $1', [id]);
    if (!rows.length) return;
    let channels = {};
    try { channels = JSON.parse(rows[0].published_channels || '{}'); } catch {}
    channels[channel] = ts;
    await pool.query(
      'UPDATE content SET published_channels = $2, updated_at = NOW() WHERE id = $1',
      [id, JSON.stringify(channels)]
    );
    return;
  }
  const item = memStore.find(i => i.id === id);
  if (item) {
    if (!item.published_channels) item.published_channels = {};
    item.published_channels[channel] = ts;
  }
}

async function countCardsThisMonth() {
  if (pool) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM content WHERE created_at >= date_trunc('month', NOW())`
    );
    return rows[0].n;
  }
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  return memStore.filter(i => i.created_at >= start).length;
}

module.exports = {
  init,
  create, getAll, getById, update,
  deleteById, deleteMany,
  getTrash, restoreById, permanentDeleteById, emptyTrash, purgeOldTrash,
  getSetting, setSetting,
  countProcessedEmails, hasProcessedEmail, markEmailProcessed, countCardsThisMonth,
  markChannelPublished,
};
