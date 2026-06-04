function requireAuth(req, res, next) {
  if (req.session.user) return next();
  if (req.originalUrl.startsWith('/api')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/login');
}

module.exports = requireAuth;
