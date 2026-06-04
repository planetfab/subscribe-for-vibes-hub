const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');
const db = require('../database');

const SCOPES = {
  fabrice:  'openid profile w_member_social',
  michelle: 'openid profile w_member_social',
  planetfab: 'w_organization_social rw_organization_admin',
};

// GET /auth/linkedin/callback  — must be registered before /:type
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    const msg = error_description || error;
    console.error('LinkedIn OAuth error:', msg);
    return res.redirect(`/settings?li_error=${encodeURIComponent(msg)}`);
  }

  // Verify CSRF state
  const storedState = req.session.linkedinOAuthState;
  delete req.session.linkedinOAuthState;
  if (!state || state !== storedState) {
    return res.redirect('/settings?li_error=Invalid+state+parameter');
  }

  const type = state.split(':')[0];
  if (!SCOPES[type]) {
    return res.redirect('/settings?li_error=Unknown+account+type');
  }

  try {
    // Exchange code for access token
    const tokenRes = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.linkedin.redirectUri,
        client_id: config.linkedin.clientId,
        client_secret: config.linkedin.clientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenRes.data;
    await db.setSetting(`linkedin_${type}_token`, access_token);

    if (type === 'fabrice' || type === 'michelle') {
      // Get person URN via OpenID Connect userinfo
      const userRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const urn = `urn:li:person:${userRes.data.sub}`;
      await db.setSetting(`linkedin_${type}_urn`, urn);
      console.log(`LinkedIn connected: ${type} → ${urn}`);
    }

    if (type === 'planetfab') {
      // Fetch organizations this token can manage so the admin can confirm
      try {
        const orgsRes = await axios.get(
          'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))',
          { headers: { Authorization: `Bearer ${access_token}`, 'X-Restli-Protocol-Version': '2.0.0' } }
        );
        const orgs = (orgsRes.data.elements || []).map(el => ({
          id: el['organization~']?.id,
          name: el['organization~']?.localizedName,
        })).filter(o => o.id);

        if (orgs.length === 1) {
          const urn = `urn:li:organization:${orgs[0].id}`;
          await db.setSetting('linkedin_planetfab_urn', urn);
          console.log(`LinkedIn PlanetFab org auto-detected: ${urn}`);
        } else {
          // Store the list for the settings page to display
          await db.setSetting('linkedin_planetfab_orgs', JSON.stringify(orgs));
        }
      } catch (orgErr) {
        console.warn('Could not fetch organizations:', orgErr.message);
      }
    }

    res.redirect(`/settings?li_connected=${type}`);
  } catch (err) {
    const detail = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    console.error('LinkedIn token exchange failed:', detail);
    res.redirect(`/settings?li_error=${encodeURIComponent('Token exchange failed: ' + err.message)}`);
  }
});

// GET /auth/linkedin/:type  — initiate OAuth for fabrice | michelle | planetfab
router.get('/:type', (req, res) => {
  const type = req.params.type;
  if (!SCOPES[type]) return res.status(400).send('Unknown account type');

  if (!config.linkedin.clientId || !config.linkedin.clientSecret) {
    return res.redirect('/settings?li_error=LINKEDIN_CLIENT_ID+or+CLIENT_SECRET+not+set+in+environment');
  }

  // Encode type in state; random suffix prevents CSRF
  const state = `${type}:${crypto.randomBytes(16).toString('hex')}`;
  req.session.linkedinOAuthState = state;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.linkedin.clientId,
    redirect_uri: config.linkedin.redirectUri,
    state,
    scope: SCOPES[type],
  });

  res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
});

module.exports = router;
