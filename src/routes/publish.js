const express = require('express');
const router = express.Router();
const db = require('../database');
const { publishToLinkedIn } = require('../publishers/linkedin');
const { publishToInstagram } = require('../publishers/instagram');
const { saveToWordPress } = require('../publishers/wordpress');

function requireApproved(item) {
  if (item.status !== 'Approved') {
    const err = new Error('Content must be Approved before publishing');
    err.statusCode = 400;
    throw err;
  }
}

router.post('/linkedin/:type/:id', async (req, res) => {
  try {
    const item = await db.getById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    requireApproved(item);

    const result = await publishToLinkedIn(item, req.params.type);
    await db.update(req.params.id, { status: 'Published' });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/instagram/:id', async (req, res) => {
  try {
    const item = await db.getById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    requireApproved(item);

    const result = await publishToInstagram(item);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/newsletter/:id', async (req, res) => {
  try {
    const item = await db.getById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    requireApproved(item);

    const updated = await db.update(req.params.id, { status: 'Newsletter Ready' });
    res.json({ success: true, item: updated });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Saving to blog creates a WP draft — no approval required
router.post('/blog/:id', async (req, res) => {
  try {
    const item = await db.getById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    const result = await saveToWordPress(item);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
