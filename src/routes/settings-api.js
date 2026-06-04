const express = require('express');
const router = express.Router();
const db = require('../database');
const config = require('../config');

// Returns connection status for all three LinkedIn profiles
router.get('/linkedin', async (req, res) => {
  try {
    const profiles = ['fabrice', 'michelle', 'planetfab'];
    const result = {};

    for (const type of profiles) {
      const dbToken = await db.getSetting(`linkedin_${type}_token`);
      const dbUrn   = await db.getSetting(`linkedin_${type}_urn`);

      // Env var fallbacks
      const envToken = type === 'planetfab'
        ? config.linkedin.planetfabToken
        : config.linkedin[`${type}Token`];
      const envUrn = type === 'planetfab'
        ? (config.linkedin.planetfabPageId ? `urn:li:organization:${config.linkedin.planetfabPageId}` : null)
        : config.linkedin[`${type}Urn`];

      const token = dbToken || envToken || null;
      const urn   = dbUrn   || envUrn   || null;

      result[type] = {
        connected: !!(token && urn),
        hasToken: !!token,
        urn: urn || null,
        source: dbToken ? 'oauth' : (envToken ? 'env' : null),
      };

      // Include pending org list for planetfab when URN not yet chosen
      if (type === 'planetfab' && !urn) {
        const orgsJson = await db.getSetting('linkedin_planetfab_orgs');
        result[type].pendingOrgs = orgsJson ? JSON.parse(orgsJson) : [];
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set the PlanetFab org URN manually (used when admin picks from org list)
router.post('/linkedin/planetfab-org', async (req, res) => {
  try {
    const { orgId } = req.body;
    if (!orgId) return res.status(400).json({ error: 'orgId required' });
    const urn = `urn:li:organization:${orgId}`;
    await db.setSetting('linkedin_planetfab_urn', urn);
    await db.setSetting('linkedin_planetfab_orgs', ''); // clear pending list
    res.json({ urn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
