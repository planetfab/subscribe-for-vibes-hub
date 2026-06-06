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
    const { type, id } = req.params;
    const item = await db.getById(id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    requireApproved(item);

    const result = await publishToLinkedIn(item, type);
    await db.update(id, { status: 'Published' });
    await db.markChannelPublished(id, `linkedin_${type}`);
    const updated = await db.getById(id);
    res.json({ success: true, ...result, item: updated });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/instagram/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.getById(id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    requireApproved(item);

    const result = await publishToInstagram(item);
    await db.markChannelPublished(id, 'instagram');
    const updated = await db.getById(id);
    res.json({ success: true, ...result, item: updated });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/newsletter/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.getById(id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    requireApproved(item);

    await db.update(id, { status: 'Newsletter Ready' });
    await db.markChannelPublished(id, 'newsletter');
    const updated = await db.getById(id);
    res.json({ success: true, item: updated });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Saving to blog creates a WP draft — no approval required
// :author is 'fabrice' or 'michelle'
router.post('/blog/:author/:id', async (req, res) => {
  try {
    const { author, id } = req.params;
    if (!['fabrice', 'michelle'].includes(author)) {
      return res.status(400).json({ error: 'Invalid author' });
    }
    const item = await db.getById(id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    const result = await saveToWordPress(item, author);
    await db.markChannelPublished(id, `blog_${author}`);
    const updated = await db.getById(id);
    res.json({ success: true, ...result, item: updated });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
