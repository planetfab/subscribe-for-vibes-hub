const axios = require('axios');
const config = require('../config');
const db = require('../database');

async function resolveProfile(type) {
  // DB tokens (set via OAuth) take precedence over env vars
  const dbToken = await db.getSetting(`linkedin_${type}_token`);
  const dbUrn   = await db.getSetting(`linkedin_${type}_urn`);

  let token, urn;

  if (type === 'planetfab') {
    token = dbToken || config.linkedin.planetfabToken;
    urn   = dbUrn
      || (config.linkedin.planetfabPageId ? `urn:li:organization:${config.linkedin.planetfabPageId}` : null);
  } else {
    token = dbToken || config.linkedin[`${type}Token`];
    urn   = dbUrn   || config.linkedin[`${type}Urn`];
  }

  return { token, urn };
}

async function publishToLinkedIn(item, type) {
  const validTypes = ['fabrice', 'michelle', 'planetfab'];
  if (!validTypes.includes(type)) throw new Error(`Unknown LinkedIn profile type: ${type}`);

  const { token, urn } = await resolveProfile(type);

  if (!token || !urn) {
    throw new Error(
      `LinkedIn credentials not configured for "${type}". ` +
      'Go to /settings and connect the account via OAuth.'
    );
  }

  const firstUrl = (item.source_urls || '').split(',').map(u => u.trim()).find(Boolean) || '';
  const postText = firstUrl ? `${item.linkedin_hook}\n\n${firstUrl}` : item.linkedin_hook;

  const { data } = await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      author: urn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: postText },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );

  return { linkedinPostId: data.id };
}

module.exports = { publishToLinkedIn };
