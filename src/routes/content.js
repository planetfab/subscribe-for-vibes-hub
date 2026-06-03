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

router.put('/:id', async (req, res) => {
  try {
    const data = {};
    for (const key of EDITABLE_FIELDS) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    const updated = await db.update(req.params.id, data);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
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
