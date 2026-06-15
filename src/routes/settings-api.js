const express = require('express');
const router = express.Router();
const db = require('../database');
const config = require('../config');
const { saveInstagramAccount } = require('./instagram-oauth');

// ── LinkedIn ─────────────────────────────────────────────────────────────

router.get('/linkedin', async (req, res) => {
  try {
    const profiles = ['fabrice', 'michelle', 'planetfab'];
    const result = {};

    for (const type of profiles) {
      const dbToken = await db.getSetting(`linkedin_${type}_token`);
      const dbUrn   = await db.getSetting(`linkedin_${type}_urn`);

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

router.post('/linkedin/planetfab-org', async (req, res) => {
  try {
    const { orgId } = req.body;
    if (!orgId) return res.status(400).json({ error: 'orgId required' });
    const urn = `urn:li:organization:${orgId}`;
    await db.setSetting('linkedin_planetfab_urn', urn);
    await db.setSetting('linkedin_planetfab_orgs', '');
    res.json({ urn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Instagram ─────────────────────────────────────────────────────────────

router.get('/instagram', async (req, res) => {
  try {
    const dbToken     = await db.getSetting('instagram_access_token');
    const dbAccountId = await db.getSetting('instagram_account_id');
    const dbUsername  = await db.getSetting('instagram_username');
    const dbPageName  = await db.getSetting('instagram_page_name');
    const pendingJson = await db.getSetting('instagram_pending_accounts');

    const token     = dbToken     || config.meta.instagramToken     || null;
    const accountId = dbAccountId || config.meta.instagramUserId    || null;

    const pending = pendingJson ? JSON.parse(pendingJson) : [];

    res.json({
      connected: !!(token && accountId),
      username:  dbUsername  || null,
      accountId: accountId   || null,
      pageName:  dbPageName  || null,
      source:    dbToken ? 'oauth' : (config.meta.instagramToken ? 'env' : null),
      pendingAccounts: pending,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Called when admin picks one account from the pending list
router.post('/instagram/select', async (req, res) => {
  try {
    const { igId } = req.body;
    if (!igId) return res.status(400).json({ error: 'igId required' });

    const pendingJson = await db.getSetting('instagram_pending_accounts');
    if (!pendingJson) return res.status(400).json({ error: 'No pending accounts to select from' });

    const accounts = JSON.parse(pendingJson);
    const account = accounts.find(a => a.igId === igId);
    if (!account) return res.status(404).json({ error: 'Account not found in pending list' });

    await saveInstagramAccount(account);
    res.json({ success: true, username: account.igUsername });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
