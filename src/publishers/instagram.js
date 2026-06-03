const axios = require('axios');
const config = require('../config');

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

async function publishToInstagram(item) {
  const token = config.meta.instagramToken;
  const accountId = config.meta.instagramAccountId;

  if (!token || !accountId) {
    throw new Error(
      'Instagram credentials not configured. ' +
      'Complete the Meta OAuth flow after the app is live at hub.planetfab.com.'
    );
  }

  // Step 1: create media container (text-only / caption post)
  const containerRes = await axios.post(`${GRAPH_BASE}/${accountId}/media`, {
    caption: item.instagram_caption,
    access_token: token,
  });

  const containerId = containerRes.data.id;

  // Step 2: publish the container
  const publishRes = await axios.post(`${GRAPH_BASE}/${accountId}/media_publish`, {
    creation_id: containerId,
    access_token: token,
  });

  return { instagramPostId: publishRes.data.id };
}

module.exports = { publishToInstagram };
