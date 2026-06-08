const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');
const db = require('../database');

const GRAPH = 'https://graph.facebook.com/v25.0';

// Permissions needed for Instagram content publishing via a Business page
const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
].join(',');

// GET /auth/instagram/callback — registered before / so it isn't swallowed
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    const msg = error_description || error;
    console.error('Instagram OAuth error from Meta:', msg);
    return res.redirect(`/settings?ig_error=${encodeURIComponent(msg)}`);
  }

  const storedState = req.session.instagramOAuthState;
  delete req.session.instagramOAuthState;
  if (!state || state !== storedState) {
    return res.redirect('/settings?ig_error=Invalid+state+parameter');
  }

  try {
    // Step 1 — exchange code for short-lived user token
    const tokenRes = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: {
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        redirect_uri: config.meta.redirectUri,
        code,
      },
    });
    const shortLivedToken = tokenRes.data.access_token;

    // Step 2 — exchange for long-lived user token (valid 60 days)
    const llRes = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    const longLivedUserToken = llRes.data.access_token;

    // Step 3 — get Facebook pages this user manages
    // Page tokens derived from a long-lived user token do not expire
    const pagesRes = await axios.get(`${GRAPH}/me/accounts`, {
      params: { access_token: longLivedUserToken, fields: 'id,name,access_token' },
    });
    const pages = pagesRes.data.data || [];

    if (!pages.length) {
      return res.redirect('/settings?ig_error=No+Facebook+pages+found.+Make+sure+you+are+a+Page+admin.');
    }

    // Step 4 — for each page find connected Instagram Business Account
    const igAccounts = [];
    for (const page of pages) {
      try {
        const igRes = await axios.get(`${GRAPH}/${page.id}`, {
          params: {
            fields: 'instagram_business_account{id,name,username}',
            access_token: page.access_token,
          },
        });
        const ig = igRes.data.instagram_business_account;
        if (ig) {
          igAccounts.push({
            igId: ig.id,
            igUsername: ig.username || ig.name || ig.id,
            pageId: page.id,
            pageName: page.name,
            pageToken: page.access_token, // permanent page-level token
          });
        }
      } catch (err) {
        console.warn(`Skipping page ${page.id}:`, err.message);
      }
    }

    if (!igAccounts.length) {
      return res.redirect(
        '/settings?ig_error=No+Instagram+Business+accounts+found.+' +
        'Make+sure+your+Instagram+account+is+a+Business+account+connected+to+a+Facebook+Page.'
      );
    }

    if (igAccounts.length === 1) {
      await saveInstagramAccount(igAccounts[0]);
      return res.redirect('/settings?ig_connected=1');
    }

    // Multiple accounts — store for user to pick on /settings
    await db.setSetting('instagram_pending_accounts', JSON.stringify(igAccounts));
    return res.redirect('/settings?ig_pick=1');

  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('Instagram OAuth failed:', detail);
    return res.redirect(`/settings?ig_error=${encodeURIComponent('OAuth failed: ' + err.message)}`);
  }
});

// GET /auth/instagram — initiate OAuth
router.get('/', (req, res) => {
  if (!config.meta.appSecret) {
    return res.redirect('/settings?ig_error=META_APP_SECRET+not+set+in+Railway+environment');
  }

  const state = crypto.randomBytes(16).toString('hex');
  req.session.instagramOAuthState = state;

  const params = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: config.meta.redirectUri,
    scope: SCOPES,
    response_type: 'code',
    state,
  });

  res.redirect(`https://www.facebook.com/v25.0/dialog/oauth?${params}`);
});

async function saveInstagramAccount(account) {
  await db.setSetting('instagram_account_id',   account.igId);
  await db.setSetting('instagram_access_token', account.pageToken);
  await db.setSetting('instagram_username',     account.igUsername);
  await db.setSetting('instagram_page_name',    account.pageName);
  await db.setSetting('instagram_pending_accounts', '');
  console.log(`Instagram connected: @${account.igUsername} (${account.igId}) via page "${account.pageName}"`);
}

module.exports = { router, saveInstagramAccount };
