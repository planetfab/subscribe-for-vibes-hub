const axios = require('axios');
const config = require('../config');
const db = require('../database');

const GRAPH = 'https://graph.facebook.com/v25.0';

async function publishToInstagram(item) {
  // DB tokens (set via OAuth) take precedence over env vars
  const token     = await db.getSetting('instagram_access_token') || config.meta.instagramToken;
  const accountId = await db.getSetting('instagram_account_id')   || config.meta.instagramUserId;

  if (!token || !accountId) {
    throw new Error(
      'Instagram credentials not configured. Go to /settings and connect via OAuth.'
    );
  }

  // Step 1: create media container
  const containerRes = await axios.post(`${GRAPH}/${accountId}/media`, {
    caption: item.instagram_caption,
    access_token: token,
  });

  const containerId = containerRes.data.id;

  // Step 2: publish the container
  const publishRes = await axios.post(`${GRAPH}/${accountId}/media_publish`, {
    creation_id: containerId,
    access_token: token,
  });

  return { instagramPostId: publishRes.data.id };
}

module.exports = { publishToInstagram };
