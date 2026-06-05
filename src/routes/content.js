const express = require('express');
const router = express.Router();
const db = require('../database');
const { checkEmails } = require('../email-watcher');

const EDITABLE_FIELDS = [
  'piece_title', 'section_name', 'newsletter_blurb',
  'linkedin_hook', 'instagram_caption', 'blog_potential',
  'source_urls', 'status',
];

router.get('/', async (req, res) => {
  try {
    const items = await db.getAll();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', (req, res) => {
  res.json({ username: req.session.user.username });
});

// ── Trash routes (defined before /:id to avoid param collision) ──────────────

router.get('/trash', async (req, res) => {
  try {
    const items = await db.getTrash();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/trash/:id/restore', async (req, res) => {
  try {
    const item = await db.restoreById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/trash/:id', async (req, res) => {
  try {
    await db.permanentDeleteById(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/trash', async (req, res) => {
  try {
    await db.emptyTrash();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Content CRUD ─────────────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const data = {};
    for (const key of EDITABLE_FIELDS) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    // Allow the edit modal to remove images (sends updated array after X-button deletions)
    if (Array.isArray(req.body.images)) {
      data.images = req.body.images;
    }
    const updated = await db.update(req.params.id, data);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  console.log(`[delete] route hit — id: ${req.params.id}`);
  try {
    await db.deleteById(req.params.id);
    console.log(`[delete] db.deleteById returned without error for id: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[delete] db.deleteById threw for id ${req.params.id}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids array required' });
    }
    await db.deleteMany(ids);
    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/check-email', async (req, res) => {
  try {
    const count = await checkEmails();
    res.json({ message: 'Email check complete', processed: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
