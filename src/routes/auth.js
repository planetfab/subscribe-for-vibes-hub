const express = require('express');
const router = express.Router();
const config = require('../config');

router.post('/login', (req, res) => {
  const username = (req.body.username || '').toLowerCase().trim();
  const password = req.body.password || '';

  const validPassword = config.users[username];
  if (validPassword && password === validPassword) {
    req.session.user = { username };
    return res.redirect('/');
  }

  res.redirect('/login?error=1');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
